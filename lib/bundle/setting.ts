// Setting bundles: the Content Compiler's output for a setting pack, and its loader
// (spec/README.md, "Bundle"; engine milestone 2: "loads into typed structures. Unknown fields fail.").

import type { Cell, Footprint, LightLevel, PackEffect, Requirement, Tags } from "./types/defs";
import type { ParserHints } from "./types/parser";
import type { PackArtAssets } from "./types/assets";
import { SCHEMAS, SCHEMA_BASE } from "./schemas.generated";

export const FORMAT_VERSION = 2;

export interface LightSource {
  bright: number;
  dim: number;
  lit?: boolean;
}

export interface Pick {
  table: string;
  picks: number | string;
}

export interface Verb {
  requirement?: Requirement;
  effects: PackEffect[];
}

interface Common {
  label: string;
  tags?: Tags;
  art?: string[];
  footprint: Footprint;
}

export interface CreatureTemplate extends Common {
  kind: "creature";
  behavior: "aggressive" | "defensive" | "passive" | "fleeing";
  light?: LightSource;
  loot?: Pick;
  flee_when_harmed?: boolean;
  system_stats: Record<string, unknown>;
}

export interface ItemTemplate extends Common {
  kind: "item";
  light?: LightSource;
  uses: number | null;
  use?: { target: "self" | "self_or_ally" | "entity" | "door" | "none"; effects: PackEffect[] };
  system_stats?: Record<string, unknown>;
}

export interface ContainerTemplate extends Common {
  kind: "container";
  light?: LightSource;
  obstructs: ("movement" | "sight")[];
  cover: boolean;
  contents: Pick | string[];
  verbs?: Record<string, Verb>;
  capacity?: number;
  lock?: Requirement;
}

export interface FixtureTemplate extends Common {
  kind: "fixture";
  light?: LightSource;
  obstructs: ("movement" | "sight")[];
  cover: boolean;
  verbs: Record<string, Verb>;
}

export interface ObstacleTemplate extends Common {
  kind: "obstacle";
  light?: LightSource;
  obstructs: ("movement" | "sight")[];
  cover: boolean;
  system_stats?: Record<string, unknown>;
  remains?: string;
  verbs?: Record<string, Verb>;
}

export interface DoorTemplate extends Common {
  kind: "door";
  open: boolean;
  obstructs: ("movement" | "sight")[];
  lock?: Requirement;
  system_stats?: Record<string, unknown>;
  remains?: string;
  verbs?: Record<string, Verb>;
}

export type EntityTemplate = CreatureTemplate | ItemTemplate | ContainerTemplate | FixtureTemplate | ObstacleTemplate | DoorTemplate;
export type EntityKind = EntityTemplate["kind"];

export interface TerrainDef {
  label: string;
  obstructs: ("movement" | "sight")[];
  cost: number;
  tags: Tags;
  art?: string[];
}

export interface ConditionDef {
  label: string;
  duration: number | null;
  on_turn_start?: PackEffect[];
  blocks?: string[];
  situation?: { advantage?: number; modifier?: number };
}

export interface AbilityDef {
  label: string;
  target: "self" | "entity" | "door" | "none";
  art?: string[];
  range?: number | null;
  effects: PackEffect[];
  system_stats: Record<string, unknown>;
}

export interface Placement {
  ref?: string;
  npc?: string;
  id?: string;
  at?: Cell;
  room?: string;
  count?: number | string;
  lock?: Requirement;
  hidden?: boolean;
}

export interface RoomTemplate {
  label: string;
  tags?: Tags;
  role: "any" | "entry" | "boss" | "treasure" | "dead_end";
  min_depth?: number;
  max_depth?: number;
  light?: LightLevel;
  map: { legend?: Record<string, string | { terrain: string; place: string }>; rows: string[] };
  contents?: Placement[];
}

export interface TableEntry {
  weight: number;
  ref: string;
  count?: number | string;
  depth?: [number, number];
}

export interface Tables {
  room_labels: { weight: number; label: string; tags?: Tags }[];
  [table: string]: TableEntry[] | { weight: number; label: string; tags?: Tags }[];
}

export interface SystemBinding {
  id: string;
  versions: string;
  modules: string[];
  /** The installed system version the pack was validated against. */
  resolved: string;
}

export interface SettingManifest {
  title: string;
  system: SystemBinding;
  damage_types: string[];
  terrain: Record<string, TerrainDef>;
  currency?: { id: string; label: string; unit: string; denominations: Record<string, { label: string; value: number }> };
  generation: { door: string; locks: Record<string, string> };
  starting_items?: Pick;
  narration: { style: string; person: "second" | "third"; max_sentences: number };
}

export interface SettingBundle {
  kind: "setting";
  format_version: typeof FORMAT_VERSION;
  id: string;
  version: string;
  namespace: string;
  manifest: SettingManifest;
  conditions: Record<string, ConditionDef>;
  abilities: Record<string, AbilityDef>;
  entities: Record<string, EntityTemplate>;
  rooms: Record<string, RoomTemplate>;
  tables: Tables;
  parser: ParserHints;
  assets: PackArtAssets;
}

const ORDERED_TOOLS = ["move", "attack", "ability", "use", "interact", "search", "take", "drop", "give", "talk", "rest", "wait"];

/** The built-in terrain types with their defaults (engine.md, "Terrain"). */
export function builtinTerrain(): Record<string, TerrainDef> {
  return {
    void: { label: "void", obstructs: ["movement", "sight"], cost: 1, tags: [] },
    floor: { label: "floor", obstructs: [], cost: 1, tags: [] },
    wall: { label: "wall", obstructs: ["movement", "sight"], cost: 1, tags: [] },
  };
}

/** The built-in conditions every pack inherits (engine.md, "Conditions"). */
export function builtinConditions(): Record<string, ConditionDef> {
  return {
    incapacitated: { label: "incapacitated", duration: null, blocks: [...ORDERED_TOOLS] },
    hidden: { label: "hidden", duration: null },
  };
}

export class BundleError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function schema(name: string): Obj {
  return SCHEMAS[SCHEMA_BASE + name] as Obj;
}

function propsOf(node: Obj): string[] {
  return Object.keys((node.properties ?? {}) as Obj);
}

function only(where: string, value: unknown, allowed: readonly string[]): Obj {
  if (!isObj(value)) throw new BundleError(`${where}: expected an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new BundleError(`${where}: unknown field '${key}'`);
  }
  return value;
}

const ENTITY_DEFAULTS = ["footprint", "obstructs", "cover", "open", "uses"];

// SPEC_ISSUES.md#bundle-format: the bundle has no schema; fields are those of the pack schemas plus
// the compiler's defaults, `system.modules`, and `system.resolved`.
/** Loads a setting bundle, failing on unknown fields at every level the compiler writes. */
export function loadSettingBundle(json: unknown): SettingBundle {
  const b = only("bundle", json, ["kind", "format_version", "id", "version", "namespace", "manifest", "conditions", "abilities", "entities", "rooms", "tables", "parser", "assets"]);
  if (b.kind !== "setting") throw new BundleError(`bundle: kind is ${String(b.kind)}, not setting`);
  if (b.format_version !== FORMAT_VERSION) throw new BundleError(`bundle: format_version ${String(b.format_version)} is not ${FORMAT_VERSION}`);
  for (const key of ["id", "version", "namespace"]) if (typeof b[key] !== "string") throw new BundleError(`bundle: ${key} must be a string`);

  const manifestProps = propsOf(schema("manifest.schema.json")).filter((k) => !["format_version", "kind", "id", "version", "namespace"].includes(k));
  const manifest = only("manifest", b.manifest, manifestProps);
  only("manifest.system", manifest.system, ["id", "versions", "modules", "resolved"]);
  for (const [id, t] of Object.entries(only("manifest.terrain", manifest.terrain, Object.keys(isObj(manifest.terrain) ? manifest.terrain : {})))) {
    only(`manifest.terrain.${id}`, t, ["label", "obstructs", "cost", "tags", "art"]);
  }

  const conditionProps = propsOf((schema("conditions.schema.json").additionalProperties ?? {}) as Obj);
  for (const [id, c] of Object.entries(only("conditions", b.conditions, Object.keys(isObj(b.conditions) ? b.conditions : {})))) only(`conditions.${id}`, c, conditionProps);

  const abilityProps = propsOf((schema("abilities.schema.json").additionalProperties ?? {}) as Obj);
  for (const [id, a] of Object.entries(isObj(b.abilities) ? b.abilities : {})) only(`abilities.${id}`, a, abilityProps);

  const defs = (schema("entities.schema.json").$defs ?? {}) as Record<string, Obj>;
  for (const [id, e] of Object.entries(isObj(b.entities) ? b.entities : {})) {
    const kind = isObj(e) ? (e.kind as string) : "";
    const def = defs[kind];
    if (!def) throw new BundleError(`entities.${id}: unknown kind '${kind}'`);
    only(`entities.${id}`, e, [...propsOf(def), ...ENTITY_DEFAULTS]);
  }

  const roomProps = propsOf((schema("rooms.schema.json").additionalProperties ?? {}) as Obj);
  for (const [id, r] of Object.entries(isObj(b.rooms) ? b.rooms : {})) only(`rooms.${id}`, r, roomProps);

  for (const key of ["tables", "parser", "assets"]) if (!isObj(b[key])) throw new BundleError(`bundle: ${key} must be an object`);
  if (!Array.isArray((b.tables as Obj).room_labels)) throw new BundleError("tables: room_labels is required");
  return b as unknown as SettingBundle;
}
