// The world over state: terrain, rooms, occupancy, obstruction, sight, lighting, perception, and
// visibility (engine.md, "Space" and "Lighting"). Pure functions of state and bundles.

import {
  TerrainGrid,
  distance,
  footprintCells,
  footprintDistance,
  footprintSees,
  sightLine,
  type Cell,
  type CellTest,
  type Footprint,
} from "../grid";
import type { Side } from "../systems";
import type { Content } from "./content";
import type { EntityState, Illumination, LightLevel, LocationState, State } from "./types";

export const key = ([x, y]: Cell): number => y * 64 + x;

const grids = new WeakMap<LocationState, TerrainGrid>();

/** The static terrain of a location. Terrain never changes, so the grid is cached per location object. */
export function terrainOf(loc: LocationState): TerrainGrid {
  let g = grids.get(loc);
  if (!g) {
    const width = loc.rows[0]?.length ?? 0;
    const terrain = loc.rows.flatMap((row) => [...row].map((ch) => loc.legend[ch] ?? "void"));
    g = new TerrainGrid({ width, height: loc.rows.length, terrain }, loc.terrain);
    grids.set(loc, g);
  }
  return g;
}

/** The room holding each cell, from the rooms' areas. */
export function roomAt(loc: LocationState, cell: Cell): string | undefined {
  for (const [id, room] of Object.entries(loc.rooms)) {
    for (const [x, y, w, h] of room.area) if (cell[0] >= x && cell[0] < x + w && cell[1] >= y && cell[1] < y + h) return id;
  }
  return undefined;
}

export function roomCells(loc: LocationState, room: string): Cell[] {
  const cells: Cell[] = [];
  const seen = new Set<number>();
  for (const [x, y, w, h] of loc.rooms[room]?.area ?? []) {
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        const k = key([cx, cy]);
        if (!seen.has(k)) cells.push([cx, cy]);
        seen.add(k);
      }
    }
  }
  return cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// ---------------------------------------------------------------------------------------------
// Bodies: characters and creatures with a cell

export interface Body {
  id: string;
  kind: "character" | "creature";
  side: Side;
  location: string;
  at: Cell;
  footprint: Footprint;
}

export function footprintOf(c: Content, e: EntityState): Footprint {
  const t = c.template(e.ref);
  return t.footprint;
}

/** Whether a creature or character still occupies cells: status other than `dead`. */
export function occupies(sheetStatus: string | undefined): boolean {
  return sheetStatus !== "dead";
}

export function bodyOf(state: State, c: Content, id: string): Body | undefined {
  const ch = state.characters[id];
  if (ch) return { id, kind: "character", side: "characters", location: ch.location, at: ch.at, footprint: [1, 1] };
  const e = state.entities[id];
  if (e && e.kind === "creature" && e.location !== undefined && e.at !== undefined) {
    return { id, kind: "creature", side: "entities", location: e.location, at: e.at, footprint: footprintOf(c, e) };
  }
  return undefined;
}

/** Every character and placed creature in a location, in ascending id order. */
export function bodiesIn(state: State, c: Content, location: string): Body[] {
  const ids = [
    ...Object.keys(state.characters).filter((id) => state.characters[id]!.location === location),
    ...Object.keys(state.entities).filter((id) => {
      const e = state.entities[id]!;
      return e.kind === "creature" && e.location === location && e.at !== undefined;
    }),
  ].sort();
  return ids.map((id) => bodyOf(state, c, id)!);
}

/** Entities with a cell in the location (not carried), in ascending id order. */
export function placedIn(state: State, location: string): string[] {
  return Object.keys(state.entities)
    .filter((id) => {
      const e = state.entities[id]!;
      return e.location === location && e.at !== undefined && e.carrier === undefined;
    })
    .sort();
}

export function cellsOf(c: Content, e: EntityState): Cell[] {
  if (e.at === undefined) return [];
  return footprintCells(e.at, e.kind === "item" || e.kind === "door" ? [1, 1] : footprintOf(c, e));
}

/** What a non-creature entity obstructs now: doors only while closed. */
export function entityObstructs(c: Content, e: EntityState): ("movement" | "sight")[] {
  if (e.kind === "creature" || e.kind === "item") return [];
  if (e.kind === "door" && e.open) return [];
  const t = c.template(e.ref);
  return "obstructs" in t ? t.obstructs : [];
}

export const isHidden = (e: { conditions: { id: string }[] }): boolean => e.conditions.some((k) => k.id === "hidden");

/** Hidden entities are hidden from the other side. */
export function hiddenFrom(state: State, id: string, viewerSide: Side): boolean {
  const ch = state.characters[id];
  if (ch) return viewerSide !== "characters" && isHidden(ch);
  const e = state.entities[id];
  return e !== undefined && viewerSide === "characters" && isHidden(e);
}

/** Cells whose terrain obstructs movement, or that hold an entity obstructing movement. */
export function blocksMovement(state: State, c: Content, location: string, passable: ReadonlySet<string> = new Set()): CellTest {
  const loc = state.locations[location]!;
  const g = terrainOf(loc);
  const blocked = new Set<number>();
  for (const id of placedIn(state, location)) {
    if (passable.has(id)) continue;
    const e = state.entities[id]!;
    if (entityObstructs(c, e).includes("movement")) for (const cell of cellsOf(c, e)) blocked.add(key(cell));
  }
  return (cell) => g.blocksMovement(cell) || blocked.has(key(cell));
}

/** Cells that obstruct sight for a viewer on `viewerSide`, or for light when the side is null. */
export function blocksSight(state: State, c: Content, location: string, viewerSide: Side | null): CellTest {
  const loc = state.locations[location]!;
  const g = terrainOf(loc);
  const blocked = new Set<number>();
  for (const id of placedIn(state, location)) {
    const e = state.entities[id]!;
    if (viewerSide !== null && hiddenFrom(state, id, viewerSide)) continue;
    if (entityObstructs(c, e).includes("sight")) for (const cell of cellsOf(c, e)) blocked.add(key(cell));
  }
  return (cell) => g.blocksSight(cell) || blocked.has(key(cell));
}

/** Cells held by each occupying body other than `except`. */
function bodyCells(state: State, c: Content, location: string, except: string): Map<number, Body> {
  const cells = new Map<number, Body>();
  for (const b of bodiesIn(state, c, location)) {
    if (b.id === except) continue;
    const status = b.kind === "character" ? state.characters[b.id]!.sheet.status : state.entities[b.id]!.sheet?.status;
    if (!occupies(status)) continue;
    for (const cell of footprintCells(b.at, b.footprint)) cells.set(key(cell), b);
  }
  return cells;
}

export interface MoverTests {
  /** Open for the mover: no obstructing terrain or entity, no creature of the other side. */
  open: CellTest;
  /** Free: open, and no other creature occupies it. */
  free: CellTest;
  blocksMovement: CellTest;
}

/** Movement predicates for `mover`; entities in `passable` (closed doors on the path) count as open. */
export function moverTests(state: State, c: Content, mover: Body, passable: ReadonlySet<string> = new Set()): MoverTests {
  const blocked = blocksMovement(state, c, mover.location, passable);
  const others = bodyCells(state, c, mover.location, mover.id);
  const open: CellTest = (cell) => {
    if (blocked(cell)) return false;
    const b = others.get(key(cell));
    return b === undefined || b.side === mover.side;
  };
  return { open, free: (cell) => open(cell) && !others.has(key(cell)), blocksMovement: blocked };
}

// ---------------------------------------------------------------------------------------------
// Light, perception, and visibility

const RANK: Readonly<Record<LightLevel, number>> = { dark: 0, dim: 1, bright: 2 };
const LEVEL: readonly LightLevel[] = ["dark", "dim", "bright"];

export function isLit(c: Content, e: EntityState): boolean {
  const t = c.template(e.ref);
  if (!("light" in t) || t.light === undefined) return false;
  return e.lit ?? t.light.lit ?? true;
}

/** Cells a light source emits from: its footprint, or its carrier's cells while carried. */
function emittingCells(state: State, c: Content, e: EntityState): { location: string; cells: Cell[] } | undefined {
  if (e.carrier !== undefined) {
    const ch = state.characters[e.carrier];
    if (ch) return { location: ch.location, cells: [ch.at] };
    const holder = state.entities[e.carrier];
    if (holder?.location !== undefined) return { location: holder.location, cells: cellsOf(c, holder) };
    return undefined;
  }
  return e.location !== undefined ? { location: e.location, cells: cellsOf(c, e) } : undefined;
}

/** Illumination of every cell of a location (engine.md, "Lighting"), row-major. */
export function illumination(state: State, c: Content, location: string): Illumination {
  const loc = state.locations[location]!;
  const g = terrainOf(loc);
  const metric = c.bundles.system.SPATIAL.metric;
  const out: number[] = new Array<number>(g.width * g.height).fill(0);
  for (const [, room] of Object.entries(loc.rooms)) {
    const level = RANK[room.light];
    for (const [x, y, w, h] of room.area) {
      for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) out[cy * g.width + cx] = Math.max(out[cy * g.width + cx]!, level);
    }
  }
  const sight = blocksSight(state, c, location, null);
  for (const id of Object.keys(state.entities).sort()) {
    const e = state.entities[id]!;
    if (!isLit(c, e)) continue;
    const from = emittingCells(state, c, e);
    if (!from || from.location !== location) continue;
    const light = (c.template(e.ref) as { light: { bright: number; dim: number } }).light;
    for (const src of from.cells) {
      out[src[1] * g.width + src[0]] = 2;
      for (let y = Math.max(0, src[1] - light.dim); y <= Math.min(g.height - 1, src[1] + light.dim); y++) {
        for (let x = Math.max(0, src[0] - light.dim); x <= Math.min(g.width - 1, src[0] + light.dim); x++) {
          const i = y * g.width + x;
          if (out[i] === 2) continue;
          const d = distance(src, [x, y], metric);
          const level = d <= light.bright ? 2 : d <= light.dim ? 1 : 0;
          if (level > out[i]! && sightLine(src, [x, y], sight) !== null) out[i] = level;
        }
      }
    }
  }
  return out.map((v) => LEVEL[v]!);
}

function levelAt(illum: Illumination, loc: LocationState, cell: Cell): LightLevel {
  const width = loc.rows[0]?.length ?? 0;
  return illum[cell[1] * width + cell[0]] ?? "dark";
}

/** Per-viewer perception: sees the cell, and with `SPATIAL.lighting`, the cell is light enough. */
export class Perception {
  readonly #illum = new Map<string, Illumination>();
  readonly #sight = new Map<string, CellTest>();

  constructor(
    readonly state: State,
    readonly c: Content,
  ) {}

  illum(location: string): Illumination {
    let i = this.#illum.get(location);
    if (!i) {
      i = illumination(this.state, this.c, location);
      this.#illum.set(location, i);
    }
    return i;
  }

  level(location: string, cell: Cell): LightLevel {
    return levelAt(this.illum(location), this.state.locations[location]!, cell);
  }

  sight(location: string, side: Side | null): CellTest {
    const k = `${location}|${side}`;
    let t = this.#sight.get(k);
    if (!t) {
      t = blocksSight(this.state, this.c, location, side);
      this.#sight.set(k, t);
    }
    return t;
  }

  perceives(viewer: Body, cell: Cell): boolean {
    const sight = this.sight(viewer.location, viewer.side);
    if (!footprintCells(viewer.at, viewer.footprint).some((v) => sightLine(v, cell, sight) !== null)) return false;
    if (!this.c.bundles.system.SPATIAL.lighting) return true;
    if (this.level(viewer.location, cell) !== "dark") return true;
    const combatant = { id: viewer.id, side: viewer.side, kind: viewer.kind, sheet: sheetOf(this.state, viewer.id), items: {} };
    const darkvision = this.c.bundles.system.senses(combatant as never).darkvision;
    return footprintCells(viewer.at, viewer.footprint).some((v) => distance(v, cell, this.c.bundles.system.SPATIAL.metric) <= darkvision);
  }

  /** Every cell of the viewer's location it perceives. */
  perceivedCells(viewer: Body): Cell[] {
    const g = terrainOf(this.state.locations[viewer.location]!);
    const cells: Cell[] = [];
    for (const cell of g.cells()) if (this.perceives(viewer, cell)) cells.push(cell);
    return cells;
  }

  /** An entity or character is visible to a viewer that perceives any of its cells and from whom it is not hidden. */
  visible(viewer: Body, id: string): boolean {
    if (id === viewer.id) return true;
    if (hiddenFrom(this.state, id, viewer.side)) return false;
    const cells = cellsOfAny(this.state, this.c, id);
    if (!cells || cells.location !== viewer.location) return false;
    return cells.cells.some((cell) => this.perceives(viewer, cell));
  }
}

export function sheetOf(state: State, id: string) {
  return state.characters[id]?.sheet ?? state.entities[id]?.sheet ?? { status: "active" };
}

/** Location and cells of a character or placed entity. */
export function cellsOfAny(state: State, c: Content, id: string): { location: string; cells: Cell[] } | undefined {
  const ch = state.characters[id];
  if (ch) return { location: ch.location, cells: [ch.at] };
  const e = state.entities[id];
  if (!e || e.location === undefined || e.at === undefined) return undefined;
  return { location: e.location, cells: cellsOf(c, e) };
}

/** The anchor cell and footprint of anything placed. */
export function placement(state: State, c: Content, id: string): { location: string; at: Cell; footprint: Footprint } | undefined {
  const ch = state.characters[id];
  if (ch) return { location: ch.location, at: ch.at, footprint: [1, 1] };
  const e = state.entities[id];
  if (!e || e.location === undefined || e.at === undefined) return undefined;
  return { location: e.location, at: e.at, footprint: e.kind === "item" || e.kind === "door" ? [1, 1] : footprintOf(c, e) };
}

export function entityDistance(state: State, c: Content, a: string, b: string): number | undefined {
  const pa = placement(state, c, a);
  const pb = placement(state, c, b);
  if (!pa || !pb || pa.location !== pb.location) return undefined;
  return footprintDistance(pa.at, pa.footprint, pb.at, pb.footprint, c.bundles.system.SPATIAL.metric);
}

/** After every resolved action: every cell a character perceives becomes seen. */
export function updateSeen(state: State, c: Content): void {
  const perception = new Perception(state, c);
  for (const id of Object.keys(state.characters).sort()) {
    const body = bodyOf(state, c, id)!;
    const loc = state.locations[body.location]!;
    const rows = loc.seen.map((r) => [...r]);
    for (const [x, y] of perception.perceivedCells(body)) rows[y]![x] = "1";
    loc.seen = rows.map((r) => r.join(""));
  }
}
