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
  system: { id: string; versions: string };
  requires_settings: { id: string; versions: string }[];
  players: [number, number];
  start: { location: string; room: string; effects: unknown[] };
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
