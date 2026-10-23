// Explains why a value fails a JSON Schema, naming the most specific cause (spec/README.md,
// "Compiler interface": "A wrong key in an effect or requirement reports the unknown key and the
// expected keys, not every alternative of the schema"). Ajv decides validity; this walker only
// produces messages, covering the keywords the specification's schemas use.

import { show, type Segment } from "./diagnostics";

type Schema = boolean | { [k: string]: unknown };

export interface Issue {
  path: Segment[];
  message: string;
  /** Issues about the value's own shape (type, const, keys) rather than its contents. */
  shape: boolean;
}

export interface Document {
  id: string;
  root: Schema;
}

/** Looks up a schema document by absolute `$id`. */
export type Resolver = (id: string) => Schema | undefined;

const NAMED_PATTERNS: Readonly<Record<string, string>> = {
  "^[a-z][a-z0-9_]{0,63}$": "a valid id",
  "^([a-z][a-z0-9_]{0,63}:)?[a-z][a-z0-9_]{0,63}$": "a valid ref",
  "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$": "a semantic version",
  "^[1-9][0-9]*d[1-9][0-9]*([+-][0-9]+)?$": "a dice expression",
  "^(actor|target|room|[a-z][a-z0-9_]{0,63})$": "a target keyword or entity id",
  "^[\\^~]?(0|[1-9][0-9]*)(\\.(0|[1-9][0-9]*)){0,2}$": "a version range",
  "^[!-~]$": "one printable ASCII character",
};

const typeOf = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;

function typeMatches(t: string, v: unknown): boolean {
  const actual = typeOf(v);
  return t === actual || (t === "number" && actual === "integer");
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const quoteList = (keys: readonly string[]): string => keys.map((k) => `'${k}'`).join(", ");

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class Explainer {
  readonly #resolve: Resolver;

  constructor(resolve: Resolver) {
    this.#resolve = resolve;
  }

  /** Issues for `value` against the schema document `doc`; empty when the walker finds none. */
  explain(doc: Document, value: unknown): Issue[] {
    return this.#walk(doc.root, value, [], doc);
  }

  #deref(ref: string, doc: Document): { schema: Schema; doc: Document } {
    const [target = "", pointer = ""] = ref.split("#");
    let next = doc;
    if (target !== "") {
      const id = new URL(target, doc.id).href;
      const root = this.#resolve(id);
      if (root === undefined) throw new Error(`unresolved $ref ${ref}`);
      next = { id, root };
    }
    let node: unknown = next.root;
    for (const part of pointer.split("/").slice(1)) {
      node = (node as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
      if (node === undefined) throw new Error(`unresolved $ref ${ref}`);
    }
    return { schema: node as Schema, doc: next };
  }

  #walk(schema: Schema, v: unknown, path: Segment[], doc: Document): Issue[] {
    if (schema === true) return [];
    if (schema === false) return [{ path, message: "is not allowed", shape: true }];
    const s = schema;
    const issues: Issue[] = [];
    const add = (message: string, shape = false, at: Segment[] = path) => issues.push({ path: at, message, shape });

    if (typeof s.$ref === "string") {
      const { schema: target, doc: next } = this.#deref(s.$ref, doc);
      issues.push(...this.#walk(target, v, path, next));
    }

    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
      if (!types.some((t) => typeMatches(t, v))) {
        add(`expected ${types.join(" or ")}, got ${typeOf(v)}${typeof v === "string" ? ` ${show(v)}` : ""}`, true);
        return issues;
      }
    }
    if ("const" in s && !deepEqual(s.const, v)) {
      add(`must be ${show(s.const)}`, true);
      return issues;
    }
    if (Array.isArray(s.enum) && !s.enum.some((e) => deepEqual(e, v))) {
      add(`${show(v)} is not one of ${show(s.enum)}`);
    }

    if (typeof v === "string") {
      if (typeof s.minLength === "number" && [...v].length < s.minLength) add(`must have at least ${s.minLength} characters`);
      if (typeof s.maxLength === "number" && [...v].length > s.maxLength) add(`must have at most ${s.maxLength} characters`);
      if (typeof s.pattern === "string" && !new RegExp(s.pattern, "u").test(v)) {
        add(`${show(v)} is not ${NAMED_PATTERNS[s.pattern] ?? `matched by the pattern ${s.pattern}`}`);
      }
    }
    if (typeof v === "number") {
      if (typeof s.minimum === "number" && v < s.minimum) add(`${v} is less than the minimum ${s.minimum}`);
      if (typeof s.maximum === "number" && v > s.maximum) add(`${v} is greater than the maximum ${s.maximum}`);
    }
    if (Array.isArray(v)) issues.push(...this.#array(s, v, path, doc));
    if (isObj(v)) issues.push(...this.#object(s, v, path, doc));

    if (Array.isArray(s.allOf)) for (const sub of s.allOf as Schema[]) issues.push(...this.#walk(sub, v, path, doc));
    if (Array.isArray(s.oneOf)) issues.push(...this.#alternatives(s.oneOf as Schema[], v, path, doc, true));
    if (Array.isArray(s.anyOf)) issues.push(...this.#alternatives(s.anyOf as Schema[], v, path, doc, false));
    if (s.if !== undefined && this.#walk(s.if as Schema, v, path, doc).length === 0 && s.then !== undefined) {
      issues.push(...this.#walk(s.then as Schema, v, path, doc));
    }
    if (s.not !== undefined && this.#walk(s.not as Schema, v, path, doc).length === 0) add(this.#notMessage(s.not as Schema, v), true);
    return issues;
  }

  #array(s: { [k: string]: unknown }, v: unknown[], path: Segment[], doc: Document): Issue[] {
    const issues: Issue[] = [];
    if (typeof s.minItems === "number" && v.length < s.minItems) issues.push({ path, message: `must have at least ${s.minItems} items`, shape: false });
    if (typeof s.maxItems === "number" && v.length > s.maxItems) issues.push({ path, message: `must have at most ${s.maxItems} items`, shape: false });
    if (s.uniqueItems === true) {
      const seen = new Set<string>();
      v.forEach((item, i) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) issues.push({ path: [...path, i], message: `repeats ${show(item)}`, shape: false });
        seen.add(key);
      });
    }
    const prefix = Array.isArray(s.prefixItems) ? (s.prefixItems as Schema[]) : [];
    v.forEach((item, i) => {
      const sub = i < prefix.length ? prefix[i] : (s.items as Schema | undefined);
      if (sub !== undefined) issues.push(...this.#walk(sub, item, [...path, i], doc));
    });
    return issues;
  }

  #object(s: { [k: string]: unknown }, v: Record<string, unknown>, path: Segment[], doc: Document): Issue[] {
    const issues: Issue[] = [];
    const props = isObj(s.properties) ? (s.properties as Record<string, Schema>) : {};
    const keys = Object.keys(v);
    for (const req of Array.isArray(s.required) ? (s.required as string[]) : []) {
      if (!(req in v)) issues.push({ path, message: `missing required key '${req}'`, shape: true });
    }
    if (typeof s.minProperties === "number" && keys.length < s.minProperties) {
      issues.push({ path, message: `must have at least ${s.minProperties} ${s.minProperties === 1 ? "entry" : "entries"}`, shape: false });
    }
    if (typeof s.maxProperties === "number" && keys.length > s.maxProperties) {
      issues.push({ path, message: `must have at most ${s.maxProperties} keys`, shape: true });
    }
    for (const key of keys) {
      if (s.propertyNames !== undefined) {
        for (const issue of this.#walk(s.propertyNames as Schema, key, path, doc)) {
          issues.push({ path: [...path, key], message: `key ${issue.message}`, shape: false });
        }
      }
      if (key in props) issues.push(...this.#walk(props[key]!, v[key], [...path, key], doc));
      else if (s.additionalProperties === false) {
        const expected = Object.keys(props);
        issues.push({
          path,
          message: expected.length > 0 ? `unknown key '${key}'; expected ${quoteList(expected)}` : `unknown key '${key}'`,
          shape: true,
        });
      } else if (s.additionalProperties !== undefined && s.additionalProperties !== true) {
        issues.push(...this.#walk(s.additionalProperties as Schema, v[key], [...path, key], doc));
      }
    }
    return issues;
  }

  /** Picks the alternative the value was meant to match, and reports only its issues. */
  #alternatives(branches: Schema[], v: unknown, path: Segment[], doc: Document, exclusive: boolean): Issue[] {
    const results = branches.map((b) => this.#walk(b, v, path, doc));
    const valid = results.filter((r) => r.length === 0).length;
    const requiredOnly = branches.map((b) => this.#requiredOnly(b, doc));
    if (requiredOnly.every((r) => r !== undefined) && isObj(v)) {
      const keys = requiredOnly.map((r) => r!.join(" and "));
      if (valid === 0) return [{ path, message: `requires one of ${quoteList(keys)}`, shape: true }];
      if (exclusive && valid > 1) return [{ path, message: `allows only one of ${quoteList(keys)}`, shape: true }];
      return [];
    }
    if (valid === 1 || (!exclusive && valid > 0)) return [];
    if (valid > 1) return [{ path, message: "matches more than one alternative", shape: true }];
    const atPath = (i: Issue) => i.path.length === path.length;
    const candidates = results.map((r, i) => ({ r, i })).filter(({ r }) => !r.some((issue) => issue.shape && atPath(issue)));
    if (candidates.length > 0) return candidates.reduce((best, c) => (c.r.length < best.r.length ? c : best)).r;
    if (isObj(v)) {
      const allowed = branches.flatMap((b) => this.#keysOf(b, doc));
      const unknown = Object.keys(v).filter((k) => !allowed.includes(k));
      if (unknown.length > 0) {
        return [{ path, message: `unknown key '${unknown[0]}'; expected ${quoteList([...new Set(allowed)])}`, shape: true }];
      }
    }
    return results.reduce((best, r) => (r.length < best.length ? r : best));
  }

  /** The keys a branch declares, following one `$ref`. */
  #keysOf(branch: Schema, doc: Document): string[] {
    if (typeof branch !== "object") return [];
    const target = typeof branch.$ref === "string" ? this.#deref(branch.$ref, doc).schema : branch;
    return typeof target === "object" && isObj(target.properties) ? Object.keys(target.properties) : [];
  }

  /** `required` of a branch that has no other constraint, as in `oneOf: [{ required: [dice] }, { required: [amount] }]`. */
  #requiredOnly(branch: Schema, doc: Document): string[] | undefined {
    void doc;
    if (typeof branch !== "object") return undefined;
    const keys = Object.keys(branch).filter((k) => k !== "description");
    return keys.length === 1 && keys[0] === "required" ? (branch.required as string[]) : undefined;
  }

  #notMessage(not: Schema, v: unknown): string {
    if (typeof not === "object" && Array.isArray(not.required)) return `cannot combine ${quoteList(not.required as string[])}`;
    if (typeof not === "object" && Array.isArray(not.enum)) return `${show(v)} is reserved`;
    return "is not allowed";
  }
}
