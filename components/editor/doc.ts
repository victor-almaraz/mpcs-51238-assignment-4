// The draft document as the editor edits it (spec/schema/draft.schema.json; adventure-packs.md).
// Shapes are loose where the editor passes values through to YAML editing.

export type Cell = [number, number];
export type Rect = [number, number, number, number];

export interface Adventure {
  format_version: number;
  kind: "adventure";
  id: string;
  version: string;
  title: string;
  description?: string;
  system: { id: string; versions: string; modules?: string[] };
  requires_settings: { id: string; versions: string }[];
  players: [number, number];
  start: { location: string; room: string; effects: unknown[]; narrate?: string };
  endings: Record<string, { label: string }>;
}

export interface Flag {
  type: "bool" | "int" | "enum";
  initial: boolean | number | string;
  min?: number;
  max?: number;
  values?: string[];
  scope?: "party" | "character";
  currency?: string;
}

export interface Arc {
  id: string;
  title?: string;
  stages: string[];
  initial: string;
  triggers: unknown[];
}

export interface Placement {
  id?: string;
  ref?: string;
  npc?: string;
  at?: Cell;
  room?: string;
  lock?: unknown;
  hidden?: boolean;
}

export interface AuthoredMap {
  rows: string[];
  legend?: Record<string, string | { terrain: string; place?: string }>;
  rooms: Record<string, { label: string; tags?: string[]; light?: "bright" | "dim" | "dark"; area: Rect[] }>;
  links?: Record<string, { label: string; at: Cell; to: { location: string; link: string } }>;
  contents?: Placement[];
}

export interface AuthoredLocation {
  id: string;
  kind: "authored";
  map: AuthoredMap;
}

export type Location = AuthoredLocation | ({ id: string; kind: "generated" } & Record<string, unknown>);

export interface Npc {
  id: string;
  name: string;
  template: string;
  disposition?: "friendly" | "neutral" | "wary" | "hostile";
  topics?: Record<string, { label: string; when?: unknown; brief: string; effects?: unknown[] }>;
  secrets?: Record<string, string>;
}

export interface Doc {
  adventure: Adventure;
  flags: Record<string, Flag>;
  arcs: Record<string, Arc>;
  locations: Record<string, Location>;
  npcs: Record<string, Npc>;
  entities: Record<string, unknown>;
  editor: { layout: Record<string, unknown>; snapshots: { name: string; saved_at: string; document: unknown }[] };
}

export interface Refs {
  terrain: { id: string; label: string }[];
  templates: { ref: string; label: string; kind: string }[];
  conditions: { ref: string; label: string }[];
  settings: { id: string; version: string; title: string }[];
}

export interface Problem {
  pointer: string;
  severity: string;
  code: string;
  message: string;
}

export const ID = /^[a-z][a-z0-9_]{0,63}$/;

/** A fresh id from `base`, unique among `taken`. */
export function freshId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** The draft without editor metadata, for snapshots. */
export function content(doc: Doc): Omit<Doc, "editor"> {
  const { editor, ...rest } = doc;
  void editor;
  return structuredClone(rest);
}

/**
 * `value` with every ref into namespace `from` (a string `from:key`) pointing into `to` instead: what
 * the adventure's own entities are placed and named by after its id changes.
 */
export function renameNamespace<T>(value: T, from: string, to: string): T {
  const prefix = `${from}:`;
  const walk = (v: unknown): unknown =>
    typeof v === "string"
      ? v.startsWith(prefix) && /^[a-z0-9_]/.test(v.slice(prefix.length))
        ? `${to}:${v.slice(prefix.length)}`
        : v
      : Array.isArray(v)
        ? v.map(walk)
        : v !== null && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
          : v;
  return walk(value) as T;
}

/** A record other parts of the draft can refer to. */
export type UseTarget = { kind: "flag" | "location" | "npc" | "arc" | "entity" | "ending"; id: string };

/**
 * Where the draft refers to `t`, outside the record itself and the editor's metadata: how many
 * references, and the records that hold them, in words ("arc crossing", "location hall").
 */
export function usesOf(doc: Doc, t: UseTarget): { count: number; places: string[] } {
  const { id } = t;
  const own = `${doc.adventure.id}:${id}`;
  const refers = (key: string, v: unknown): boolean => {
    switch (t.kind) {
      case "flag":
        return key === "flag" && v === id;
      case "location":
        return (key === "location" && v === id) || (key === "room" && typeof v === "string" && v.startsWith(`${id}.`));
      case "npc":
        return ((key === "npc" || key === "target" || key === "defeated") && v === id) || (key === "secret" && typeof v === "string" && v.startsWith(`${id}.`));
      case "arc":
        return (key === "arc" && v === id) || (key === "stage" && Array.isArray(v) && v[0] === id);
      case "entity":
        return v === own || ((key === "ref" || key === "has_item" || key === "template") && v === id);
      case "ending":
        return key === "ending" && v === id;
    }
  };
  const self = { flag: "flags", location: "locations", npc: "npcs", arc: "arcs", entity: "entities", ending: "" }[t.kind];
  const places = new Map<string, number>();
  const place = (path: string[]): string => {
    const [top, key] = path;
    if (top === "adventure") return "the start";
    return `${{ arcs: "arc", locations: "location", npcs: "NPC", entities: "entity", flags: "flag" }[top!] ?? top} ${key}`;
  };
  const walk = (v: unknown, path: string[]) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, [...path, String(i)]));
    if (v === null || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (refers(k, x)) places.set(place(path), (places.get(place(path)) ?? 0) + 1);
      if (!(k === "stage" && Array.isArray(x))) walk(x, [...path, k]);
    }
  };
  for (const top of ["adventure", "flags", "arcs", "locations", "npcs", "entities"] as const) {
    for (const [key, record] of Object.entries(top === "adventure" ? { start: doc.adventure.start } : doc[top])) {
      if (top === self && key === id) continue;
      walk(record, [top, key]);
    }
  }
  return { count: [...places.values()].reduce((a, b) => a + b, 0), places: [...places.keys()] };
}
