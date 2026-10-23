// Reading a pack: layout, parsing, schema checks, and merging per directory (spec/README.md,
// "Pack directory", "Adventure directory", "Checks"). Pure: a pack is an in-memory map of files.

import { parseDocument } from "yaml";
import { registry, schemaId } from "../bundle/registry";
import { SCHEMAS } from "../bundle/schemas.generated";
import { formatPath, type Check, type Diagnostic, type Segment } from "./diagnostics";
import { Explainer, type Issue } from "./explain";
import { layout, layoutEntry, type LayoutEntry, type PackKind } from "./layout";
import { isObject, type Json, type JsonObject } from "./walk";

/** Pack-relative paths, with `/` separators, mapped to file contents. */
export type PackFiles = ReadonlyMap<string, Uint8Array | string>;

/** One record of a merged directory or a one-per-file directory, with the file it came from. */
export interface Entry {
  file: string;
  value: JsonObject;
}

export interface ParsedPack {
  kind: PackKind;
  /** Single files by layout path, such as `manifest.yaml`. */
  single: Map<string, { file: string; data: JsonObject }>;
  /** Directory records by layout path, such as `entities/*.yaml`, keyed by record key. */
  merged: Map<string, Map<string, Entry>>;
  /** Files under `assets/`. */
  assets: Map<string, Uint8Array>;
}

export class Diagnostics {
  readonly list: Diagnostic[] = [];

  add(file: string, path: readonly Segment[] | string, message: string, check: Check): void {
    this.list.push({ file, path: typeof path === "string" ? path : formatPath(path), message, check });
  }

  get ok(): boolean {
    return this.list.length === 0;
  }
}

const explainer = new Explainer((id) => SCHEMAS[id] as never);

/** Explains a failed validation, falling back to Ajv's messages when the explainer finds no cause. */
export function schemaIssues(schemaName: string, value: unknown): Issue[] | null {
  const validate = registry().getSchema(schemaId(schemaName))!;
  if (validate(value)) return null;
  const issues = explainer.explain({ id: schemaId(schemaName), root: SCHEMAS[schemaId(schemaName)] as never }, value);
  if (issues.length > 0) return issues;
  return (validate.errors ?? []).map((e) => ({
    path: e.instancePath.split("/").slice(1).map((s) => (/^[0-9]+$/.test(s) ? Number(s) : s.replace(/~1/g, "/").replace(/~0/g, "~"))),
    message: e.message ?? "is invalid",
    shape: false,
  }));
}

export { explainer };

const text = (content: Uint8Array | string): string =>
  typeof content === "string" ? content : new TextDecoder("utf-8", { fatal: true }).decode(content);

const bytes = (content: Uint8Array | string): Uint8Array => (typeof content === "string" ? new TextEncoder().encode(content) : content);

/** Parses JSON-compatible YAML 1.2: only `true` and `false` are booleans, dates are strings. */
export function parseData(file: string, content: Uint8Array | string, out: Diagnostics): Json | undefined {
  let source: string;
  try {
    source = text(content);
  } catch {
    out.add(file, ".", "is not UTF-8 text", "file");
    return undefined;
  }
  const doc = parseDocument(source, { schema: "core", version: "1.2", uniqueKeys: true, prettyErrors: true });
  const problems = [...doc.errors, ...doc.warnings];
  if (problems.length > 0) {
    for (const p of problems) out.add(file, ".", p.message.split("\n")[0]!.replace(/:$/, ""), "file");
    return undefined;
  }
  return doc.toJS({ maxAliasCount: 100 }) as Json;
}

// SPEC_ISSUES.md#pack-file-names: `.json` stands in for `.yaml`, and files whose name starts with
// `.` (such as `.DS_Store`) are ignored.
function layoutPath(path: string): string {
  return path.endsWith(".json") ? path.slice(0, -".json".length) + ".yaml" : path;
}

const hidden = (path: string): boolean => path.split("/").some((part) => part.startsWith("."));

/** Reads every file of a pack: layout, parsing, schemas, and duplicate keys across merged files. */
export function readPack(kind: PackKind, files: PackFiles, out: Diagnostics): ParsedPack {
  const pack: ParsedPack = { kind, single: new Map(), merged: new Map(), assets: new Map() };
  const seen = new Map<string, string>();
  const found = new Set<LayoutEntry>();

  for (const path of [...files.keys()].sort()) {
    if (hidden(path)) continue;
    if (path.startsWith("assets/")) {
      pack.assets.set(path, bytes(files.get(path)!));
      continue;
    }
    const logical = layoutPath(path);
    const entry = layoutEntry(kind, logical);
    if (!entry) {
      out.add(path, ".", `is not part of a ${kind} pack`, "file");
      continue;
    }
    if (seen.has(logical)) {
      out.add(path, ".", `duplicates ${seen.get(logical)}`, "file");
      continue;
    }
    seen.set(logical, path);
    found.add(entry);
    const data = parseData(path, files.get(path)!, out);
    if (data === undefined) continue;
    const issues = schemaIssues(entry.schema, data);
    if (issues) {
      for (const issue of issues) out.add(path, issue.path, issue.message, "schema");
      continue;
    }
    const obj = data as JsonObject;
    if (!entry.path.includes("*")) {
      pack.single.set(entry.path, { file: path, data: obj });
      continue;
    }
    const records = pack.merged.get(entry.path) ?? new Map<string, Entry>();
    pack.merged.set(entry.path, records);
    if (/^(plot|locations|npcs)\//.test(entry.path)) {
      const id = obj.id as string;
      const prior = records.get(id);
      if (prior) out.add(path, ["id"], `'${id}' is already defined in ${prior.file}`, "duplicate_key");
      else records.set(id, { file: path, value: obj });
      continue;
    }
    for (const [key, value] of Object.entries(obj)) {
      const prior = records.get(key);
      if (prior) out.add(path, [key], `'${key}' is already defined in ${prior.file}`, "duplicate_key");
      else if (isObject(value)) records.set(key, { file: path, value });
    }
  }

  for (const entry of layout(kind)) {
    if (entry.required && !found.has(entry)) out.add(entry.path.replace("*", "<name>"), ".", "is required", "file");
  }
  return pack;
}
