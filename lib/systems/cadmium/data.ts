// Cadmium rules data, module data, and schemas, read from the specification at build time
// (docs/systems/cadmium.md).

import data from "../../../cadmium-spec/systems/cadmium/data.json";
import modules from "../../../cadmium-spec/systems/cadmium/modules.json";
import ability from "../../../cadmium-spec/systems/cadmium/ability.schema.json";
import character from "../../../cadmium-spec/systems/cadmium/character.schema.json";
import check from "../../../cadmium-spec/systems/cadmium/check.schema.json";
import creature from "../../../cadmium-spec/systems/cadmium/creature.schema.json";
import item from "../../../cadmium-spec/systems/cadmium/item.schema.json";
import structure from "../../../cadmium-spec/systems/cadmium/structure.schema.json";
import type { QuestData } from "../quest/data";

export interface ModuleData {
  tune: string[];
  armor: { max: number; bypass_types: string[]; absorbs_at_deaths_door: boolean };
  stash: { base_slots: number; max_containers: number };
}

export const DATA = data as QuestData;
export const MODULE_DATA = modules as ModuleData;

/** The schemas as written, with every module field present. */
export const FULL_SCHEMAS = { character, creature, item, ability, check, structure } as const;

export const MODULE_IDS = ["armor", "stash"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// SPEC_ISSUES.md#module-schema-fields: module fields are recognized by their description.
const MODULE_FIELD = /^Module ([a-z][a-z0-9_]*):/;

/**
 * Removes the fields of disabled modules: a property whose description starts with
 * `Module <id>:` is kept only while module `<id>` is enabled (README.md, "Modules": module fields
 * in schemas apply only while the module is enabled).
 */
function strip(node: Json, enabled: ReadonlySet<string>): Json {
  if (Array.isArray(node)) return node.map((n) => strip(n, enabled));
  if (node === null || typeof node !== "object") return node;
  const out: { [k: string]: Json } = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "properties" && v !== null && typeof v === "object" && !Array.isArray(v)) {
      const props: { [k: string]: Json } = {};
      for (const [name, prop] of Object.entries(v)) {
        const description = (prop as { description?: unknown } | null)?.description;
        const m = typeof description === "string" ? MODULE_FIELD.exec(description) : null;
        if (m && !enabled.has(m[1]!)) continue;
        props[name] = strip(prop, enabled);
      }
      out[k] = props;
    } else out[k] = strip(v, enabled);
  }
  return out;
}

/** The schemas of Cadmium configured with `enabled`. Each keeps its `$id`; compile one configuration per registry. */
export function schemasFor(enabled: readonly string[]): Record<keyof typeof FULL_SCHEMAS, object> {
  const set = new Set(enabled);
  const out = {} as Record<keyof typeof FULL_SCHEMAS, object>;
  for (const [kind, schema] of Object.entries(FULL_SCHEMAS)) {
    out[kind as keyof typeof FULL_SCHEMAS] = strip(schema as Json, set) as object;
  }
  return out;
}
