// Form fields for `system_stats`, generated from a rules system's schemas (app-flow.md, Character
// creation and editor: each system's `StatsEditor` is "generated from the system's schemas by
// default"; a system with modules shows module fields only when the module is enabled). Pure: the
// adventure editor renders these fields, and a schema feature the form does not cover becomes a
// `raw` field edited as YAML.

import { SYSTEMS, type SchemaKind } from "../systems";

/** The schemas the editor edits `system_stats` with: entity templates and abilities. */
export type StatsKind = Extract<SchemaKind, "creature" | "item" | "ability" | "structure">;

/** The stats schema kind of an entity template kind, or undefined when the kind takes no stats. */
export function statsKindOf(entityKind: unknown): StatsKind | undefined {
  if (entityKind === "creature") return "creature";
  if (entityKind === "item") return "item";
  if (entityKind === "obstacle" || entityKind === "door") return "structure";
  return undefined;
}

interface Base {
  key: string;
  label: string;
  required: boolean;
  description?: string;
  /** The module the field belongs to, from a `Module <id>:` description. */
  module?: string;
}

export type StatsField =
  | (Base & { type: "integer" | "number"; min?: number; max?: number })
  | (Base & { type: "boolean" })
  | (Base & { type: "string"; maxLength?: number })
  | (Base & { type: "enum"; options: (string | number | boolean)[] })
  | (Base & { type: "strings" })
  | (Base & { type: "object"; fields: StatsField[]; open: boolean })
  | (Base & { type: "raw" });

type Schema = Record<string, unknown>;

// SPEC_ISSUES.md#module-schema-fields: module fields are recognized by their description.
const MODULE_FIELD = /^Module ([a-z][a-z0-9_]*):\s*/;

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** The system's schema for `kind`, configured with `modules`; undefined for an unknown system. */
export function statsSchema(system: string, modules: readonly string[], kind: StatsKind): object | undefined {
  const base = SYSTEMS[system];
  if (!base) return undefined;
  const known = modules.filter((m) => base.MODULES.includes(m));
  return base.configure(known).SCHEMAS[kind];
}

/** Module fields of `kind` hidden because their module is not among `modules`, as `[module, key]`. */
export function hiddenModuleFields(system: string, modules: readonly string[], kind: StatsKind): [string, string][] {
  const base = SYSTEMS[system];
  if (!base || base.MODULES.length === 0) return [];
  const all = statsFields(base.configure(base.MODULES).SCHEMAS[kind]);
  const shown = new Set((statsFields(statsSchema(system, modules, kind)) ?? { fields: [] }).fields.map((f) => f.key));
  return (all?.fields ?? []).filter((f) => f.module && !shown.has(f.key)).map((f) => [f.module!, f.key]);
}

/** Fields for an object schema, or null when the schema is not a plain object with properties. */
export function statsFields(schema: unknown): { fields: StatsField[]; open: boolean } | null {
  if (!isObject(schema) || schema.type !== "object" || !isObject(schema.properties)) return null;
  if (["$ref", "oneOf", "anyOf", "allOf", "if", "patternProperties", "dependentRequired"].some((k) => k in schema)) return null;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const fields = Object.entries(schema.properties).map(([key, p]) => field(key, p, required.has(key)));
  return { fields, open: schema.additionalProperties !== false };
}

function field(key: string, p: unknown, required: boolean): StatsField {
  const raw = (base: Base): StatsField => ({ ...base, type: "raw" });
  const label = key.replace(/_/g, " ");
  if (!isObject(p)) return raw({ key, label, required });
  const text = typeof p.description === "string" ? p.description : undefined;
  const m = text ? MODULE_FIELD.exec(text) : null;
  const base: Base = { key, label, required, ...(text ? { description: m ? text.slice(m[0].length) : text } : {}), ...(m ? { module: m[1]! } : {}) };
  if (["$ref", "oneOf", "anyOf", "allOf", "not", "if", "const"].some((k) => k in p)) return raw(base);
  if (Array.isArray(p.enum)) return { ...base, type: "enum", options: p.enum as (string | number | boolean)[] };
  const types = (Array.isArray(p.type) ? p.type : [p.type]).filter((t) => t !== "null");
  if (types.length !== 1) return raw(base);
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : undefined);
  switch (types[0]) {
    case "integer":
    case "number": {
      const min = num("minimum");
      const max = num("maximum");
      return { ...base, type: types[0], ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
    }
    case "boolean":
      return { ...base, type: "boolean" };
    case "string": {
      const maxLength = num("maxLength");
      return { ...base, type: "string", ...(maxLength !== undefined ? { maxLength } : {}) };
    }
    case "array":
      return isObject(p.items) && p.items.type === "string" && Object.keys(p.items).length === 1 ? { ...base, type: "strings" } : raw(base);
    case "object": {
      const inner = statsFields(p);
      return inner ? { ...base, type: "object", ...inner } : raw(base);
    }
    default:
      return raw(base);
  }
}

/** Whether `value` can be shown in `f`'s input; otherwise the field falls back to YAML. */
export function fits(f: StatsField, value: unknown): boolean {
  if (value === undefined) return true;
  switch (f.type) {
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "enum":
      return f.options.includes(value as never);
    case "strings":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "object":
      return isObject(value);
    case "raw":
      return true;
  }
}

/** Keys of `value` the fields do not describe. */
export function extraKeys(value: unknown, fields: readonly StatsField[]): string[] {
  if (!isObject(value)) return [];
  const known = new Set(fields.map((f) => f.key));
  return Object.keys(value).filter((k) => !known.has(k));
}

/** `value` with `key` set, or removed when `next` is undefined. */
export function withField(value: unknown, key: string, next: unknown): Record<string, unknown> {
  const out = { ...(isObject(value) ? value : {}) };
  if (next === undefined) delete out[key];
  else out[key] = next;
  return out;
}

/** The value a number input holds: undefined when empty, the typed number otherwise. */
export function parseNumber(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}
