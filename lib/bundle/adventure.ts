// Adventure bundles: the Content Compiler's output for an adventure pack, and its loader
// (adventure-packs.md; spec/README.md, "Bundle").

import type { AdventureEffect, Cell, LightLevel, Requirement, Tags } from "./types/defs";
import type { PackArtAssets } from "./types/assets";
import { BundleError, FORMAT_VERSION, type EntityTemplate, type Placement, type SystemBinding } from "./setting";
import { SCHEMAS, SCHEMA_BASE } from "./schemas.generated";

export type FlagDef =
  | { type: "bool"; initial: boolean; scope: "party" | "character" }
  | { type: "int"; min: number; max: number; initial: number; scope: "party" | "character"; currency?: string }
  | { type: "enum"; values: string[]; initial: string; scope: "party" | "character" };

export interface TriggerDef {
  id: string;
  on: { type: string; [field: string]: string | number | boolean };
  when?: Requirement;
  effects: AdventureEffect[];
  narrate?: string;
  once: boolean;
}

export interface ArcDef {
  id: string;
  title: string;
  stages: string[];
  initial: string;
  triggers: TriggerDef[];
}

export interface RoomDef {
  label: string;
  tags?: Tags;
  light?: LightLevel;
  area: [number, number, number, number][];
}

export interface LinkDef {
  label: string;
  at: Cell;
  to: { location: string; link: string };
}

export interface AuthoredLocation {
  id: string;
  kind: "authored";
  map: {
    legend?: Record<string, string | { terrain: string; place: string }>;
    rows: string[];
    rooms: Record<string, RoomDef>;
    contents?: Placement[];
    links?: Record<string, LinkDef>;
  };
}

export interface GeneratedLocation {
  id: string;
  kind: "generated";
  generator?: { algorithm?: "bsp"; size?: [number, number]; rooms?: [number, number]; min_room?: number; loop_ratio?: number };
  population: {
    encounter_table: string;
    loot_table?: string;
    room_templates?: string[];
    density?: number;
    ambient?: LightLevel;
    lit_rooms?: number;
  };
  anchors?: {
    id: string;
    place: { ref?: string; npc?: string; id?: string };
    constraints?: { min_depth?: number; max_depth?: number; prefer_role?: "entry" | "boss" | "treasure" | "dead_end"; room_tags?: Tags };
    shared?: boolean;
  }[];
  links?: Record<string, { label: string; role: "entry" | "boss" | "treasure" | "dead_end"; to: { location: string; link: string } }>;
  gates_per_location?: number;
}

export type LocationDef = AuthoredLocation | GeneratedLocation;

export interface NpcDef {
  id: string;
  name: string;
  template: string;
  art?: string[];
  disposition?: "friendly" | "neutral" | "wary" | "hostile";
  topics?: Record<string, { label: string; when?: Requirement; brief: string; effects?: AdventureEffect[] }>;
  secrets?: Record<string, string>;
}

export interface AdventureManifest {
  title: string;
  description?: string;
  system: SystemBinding;
  /** Each required setting with the version it was compiled against. */
  requires_settings: { id: string; versions: string; resolved: string }[];
  players: [number, number];
  start: { location: string; room: string; effects: AdventureEffect[] };
  endings: Record<string, { label: string }>;
}

export interface AdventureBundle {
  kind: "adventure";
  format_version: typeof FORMAT_VERSION;
  id: string;
  version: string;
  /** The adventure's namespace is its id. */
  namespace: string;
  manifest: AdventureManifest;
  flags: Record<string, FlagDef>;
  /** Arcs in file order, lexicographic by path: the order triggers are tested in. */
  arcs: ArcDef[];
  locations: Record<string, LocationDef>;
  npcs: Record<string, NpcDef>;
  entities: Record<string, EntityTemplate>;
  assets: PackArtAssets;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function only(where: string, value: unknown, allowed: readonly string[]): Obj {
  if (!isObj(value)) throw new BundleError(`${where}: expected an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new BundleError(`${where}: unknown field '${key}'`);
  return value;
}

const ENTITY_DEFAULTS = ["footprint", "obstructs", "cover", "open", "uses"];

// Bundle fields (spec/README.md, "Bundle"): those of the pack schemas plus the compiler's additions.
/** Loads an adventure bundle, failing on unknown fields at every level the compiler writes. */
export function loadAdventureBundle(json: unknown): AdventureBundle {
  const b = only("bundle", json, ["kind", "format_version", "id", "version", "namespace", "manifest", "flags", "arcs", "locations", "npcs", "entities", "assets"]);
  if (b.kind !== "adventure") throw new BundleError(`bundle: kind is ${String(b.kind)}, not adventure`);
  if (b.format_version !== FORMAT_VERSION) throw new BundleError(`bundle: format_version ${String(b.format_version)} is not ${FORMAT_VERSION}`);
  const m = only("manifest", b.manifest, ["title", "description", "system", "requires_settings", "players", "start", "endings"]);
  only("manifest.system", m.system, ["id", "versions", "modules", "resolved"]);
  if (!Array.isArray(m.requires_settings)) throw new BundleError("manifest.requires_settings: expected a list");
  m.requires_settings.forEach((r, i) => only(`manifest.requires_settings[${i}]`, r, ["id", "versions", "resolved"]));
  for (const [id, f] of Object.entries(isObj(b.flags) ? b.flags : {})) only(`flags.${id}`, f, ["type", "initial", "min", "max", "values", "scope", "currency"]);
  if (!Array.isArray(b.arcs)) throw new BundleError("arcs: expected a list");
  b.arcs.forEach((a, i) => {
    const arc = only(`arcs[${i}]`, a, ["id", "title", "stages", "initial", "triggers"]);
    (arc.triggers as unknown[]).forEach((t, j) => only(`arcs[${i}].triggers[${j}]`, t, ["id", "on", "when", "effects", "narrate", "once"]));
  });
  for (const [id, l] of Object.entries(isObj(b.locations) ? b.locations : {})) {
    const kind = isObj(l) ? l.kind : undefined;
    only(`locations.${id}`, l, kind === "authored" ? ["id", "kind", "map"] : ["id", "kind", "generator", "population", "anchors", "links", "gates_per_location"]);
  }
  for (const [id, n] of Object.entries(isObj(b.npcs) ? b.npcs : {})) only(`npcs.${id}`, n, ["id", "name", "template", "art", "disposition", "topics", "secrets"]);
  const defs = ((SCHEMAS[SCHEMA_BASE + "entities.schema.json"] as Obj).$defs ?? {}) as Record<string, Obj>;
  for (const [id, e] of Object.entries(isObj(b.entities) ? b.entities : {})) {
    const def = defs[isObj(e) ? (e.kind as string) : ""];
    if (!def) throw new BundleError(`entities.${id}: unknown kind`);
    only(`entities.${id}`, e, [...Object.keys((def.properties ?? {}) as Obj), ...ENTITY_DEFAULTS]);
  }
  if (!isObj(b.assets)) throw new BundleError("bundle: assets must be an object");
  return b as unknown as AdventureBundle;
}
