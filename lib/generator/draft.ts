// The map under construction: terrain, rooms, doorways, links, and placed entities, with placement
// cells (generation.md, "7. Population") and verification (generation.md, "8. Verification").

import type { EntityTemplate } from "../bundle/setting";
import type { Requirement, Tags, LightLevel } from "../bundle/types/defs";
import { adjacent, footprintCells, type Cell, type Footprint, type Metric, type TerrainType } from "../grid";
import type { Rng } from "../rng";
import { AttemptFailed, type Layout, type Region } from "./layout";
import type { RoomRole } from "./types";

/** How a template occupies cells (engine.md, "Entities on the map"). */
export interface Occupancy {
  kind: EntityTemplate["kind"];
  footprint: Footprint;
  /** Obstructs movement: obstacles, closed doors, and containers or fixtures that say so. */
  obstructs: boolean;
}

export function occupancy(t: EntityTemplate): Occupancy {
  const footprint: Footprint = t.kind === "item" || t.kind === "door" ? [1, 1] : (t.footprint ?? [1, 1]);
  const obstructs =
    t.kind === "creature" || t.kind === "item"
      ? false
      : t.kind === "door"
        ? !t.open && (t.obstructs ?? ["movement", "sight"]).includes("movement")
        : (t.obstructs ?? (t.kind === "obstacle" ? ["movement", "sight"] : [])).includes("movement");
  return { kind: t.kind, footprint, obstructs };
}

export interface Placed extends Occupancy {
  ref?: string;
  npc?: string;
  at: Cell;
  id?: string;
  lock?: Requirement;
  hidden?: boolean;
  /** The door template's own lock, for verification. */
  templateLock?: Requirement;
}

export interface RoomState {
  region: Region;
  /** Interior rectangle `[x, y, width, height]`. */
  interior: [number, number, number, number];
  depth: number;
  roles: Set<RoomRole>;
  /** Interior cells and owned doorways, in row-major order. */
  cells: Cell[];
  label?: string;
  tags: Tags;
  light?: LightLevel;
  template?: string;
  anchors: number;
}

/** A link occupies its cell like an item: one cell, obstructing nothing. */
export const LINK_OCCUPANCY: Occupancy = { kind: "item", footprint: [1, 1], obstructs: false };

export class Draft {
  readonly width: number;
  readonly height: number;
  readonly terrain: string[];
  readonly rooms: RoomState[];
  /** Placed entities other than doors, in placement order. */
  readonly entities: Placed[] = [];
  /** Doors in doorway order. */
  readonly doors: Placed[];
  readonly links = new Map<number, string>();
  readonly #terrainTypes: Readonly<Record<string, TerrainType>>;
  readonly #roomOf: Int16Array;
  readonly #doorways = new Set<number>();
  readonly #occupants = new Map<number, Placed[]>();
  readonly #location: string;
  #nextEntity = 1;

  constructor(location: string, width: number, height: number, layout: Layout, terrainTypes: Readonly<Record<string, TerrainType>>, door: { ref: string; template: EntityTemplate }) {
    this.#location = location;
    this.width = width;
    this.height = height;
    this.#terrainTypes = terrainTypes;
    this.terrain = new Array<string>(width * height).fill("wall");
    this.#roomOf = new Int16Array(width * height).fill(-1);
    this.rooms = layout.regions.map((r, i) => {
      const cells: Cell[] = [];
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
        for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
          this.terrain[this.#key([x, y])] = "floor";
          this.#roomOf[this.#key([x, y])] = i;
          cells.push([x, y]);
        }
      }
      return { region: r, interior: [r.x + 1, r.y + 1, r.w - 2, r.h - 2], depth: layout.depth[i]!, roles: layout.roles[i]!, cells, tags: [], anchors: 0 };
    });
    const occ = occupancy(door.template);
    this.doors = layout.doorways.map((d, i) => {
      const k = this.#key(d.cell);
      this.terrain[k] = "floor";
      this.#roomOf[k] = d.owner;
      this.#doorways.add(k);
      this.rooms[d.owner]!.cells.push(d.cell);
      const placed: Placed = { ...occ, ref: door.ref, at: d.cell, id: `${location}/d${i + 1}`, templateLock: door.template.kind === "door" ? door.template.lock : undefined };
      this.#occupy(placed);
      return placed;
    });
    for (const room of this.rooms) room.cells.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  }

  #key([x, y]: Cell): number {
    return y * this.width + x;
  }

  #inBounds([x, y]: Cell): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  #occupy(p: Placed): void {
    for (const c of footprintCells(p.at, p.footprint)) {
      const k = this.#key(c);
      const here = this.#occupants.get(k) ?? [];
      here.push(p);
      this.#occupants.set(k, here);
    }
  }

  terrainBlocks(cell: Cell): boolean {
    if (!this.#inBounds(cell)) return true;
    const t = this.terrain[this.#key(cell)]!;
    return t === "void" || (this.#terrainTypes[t]?.obstructs ?? []).includes("movement");
  }

  roomOf(cell: Cell): number {
    return this.#inBounds(cell) ? this.#roomOf[this.#key(cell)]! : -1;
  }

  occupants(cell: Cell): readonly Placed[] {
    return this.#inBounds(cell) ? (this.#occupants.get(this.#key(cell)) ?? []) : [];
  }

  isDoorway(cell: Cell): boolean {
    return this.#inBounds(cell) && this.#doorways.has(this.#key(cell));
  }

  /** Copies template terrain onto a cell. */
  setTerrain(cell: Cell, terrain: string): void {
    this.terrain[this.#key(cell)] = terrain;
    this.#near = undefined;
  }

  /** Places an entity, giving it `<location>/eN` unless it has an id or is an NPC. */
  place(entity: Placed): Placed {
    const placed: Placed = { ...entity };
    if (placed.id === undefined && placed.npc === undefined) placed.id = `${this.#location}/e${this.#nextEntity++}`;
    this.entities.push(placed);
    this.#occupy(placed);
    return placed;
  }

  // SPEC_ISSUES.md#placement-free-cells: a cell is free for an entity when its terrain is passable,
  // it holds no movement-obstructing entity and no link, it holds no creature when the entity is a
  // creature, and it holds nothing when the entity obstructs movement.
  #free(cell: Cell, room: number, what: Occupancy): boolean {
    if (this.roomOf(cell) !== room || this.terrainBlocks(cell)) return false;
    if (this.links.has(this.#key(cell))) return false;
    for (const o of this.occupants(cell)) {
      if (o.obstructs || what.obstructs) return false;
      if (what.kind === "creature" && o.kind === "creature") return false;
    }
    return true;
  }

  #near: { metric: Metric; mask: Uint8Array } | undefined;

  /** The cell is a doorway or adjacent to one. */
  #nearDoorway(cell: Cell, metric: Metric): boolean {
    if (this.#near?.metric !== metric) {
      const mask = new Uint8Array(this.width * this.height);
      for (const d of this.doors) {
        mask[this.#key(d.at)] = 1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const n: Cell = [d.at[0] + dx, d.at[1] + dy];
            if (this.#inBounds(n) && adjacent(n, d.at, metric, (c) => this.terrainBlocks(c))) mask[this.#key(n)] = 1;
          }
        }
      }
      this.#near = { metric, mask };
    }
    return this.#near.mask[this.#key(cell)] === 1;
  }

  /**
   * The room's placement cells for an entity: anchor cells where the whole footprint is free, not a
   * doorway, and not adjacent to a doorway; without the doorway restriction when none exist.
   */
  placementCells(room: number, what: Occupancy, metric: Metric): Cell[] {
    const free: Cell[] = [];
    const away: Cell[] = [];
    for (const at of this.rooms[room]!.cells) {
      const cells = footprintCells(at, what.footprint);
      if (!cells.every((c) => this.#free(c, room, what))) continue;
      free.push(at);
      if (!cells.some((c) => this.#nearDoorway(c, metric))) away.push(at);
    }
    return away.length > 0 ? away : free;
  }

  /** Chooses an anchor cell by RNG among the placement cells, failing the attempt when there are none. */
  chooseCell(room: number, what: Occupancy, metric: Metric, rng: Rng): Cell {
    const cells = this.placementCells(room, what, metric);
    if (cells.length === 0) throw new AttemptFailed(`room r${room + 1} has no placement cell`);
    return rng.pick(cells);
  }

  /** Marks a link cell. */
  addLink(id: string, cell: Cell): void {
    this.links.set(this.#key(cell), id);
  }

  /**
   * Verification: cells reachable from the entry room, treating unlocked doors as passable and
   * locked doors as passable once a key item on a reachable cell is collected.
   */
  access(metric: Metric): Set<number> {
    const keys = new Set<string>();
    const passableDoor = (d: Placed): boolean => {
      const lock = d.lock ?? d.templateLock;
      if (lock === undefined) return true;
      // SPEC_ISSUES.md#verification-passability: only `has_item` locks open in verification.
      return "has_item" in lock && typeof lock.has_item === "string" && keys.has(lock.has_item);
    };
    const steps: Cell[] =
      metric === "chebyshev"
        ? [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]
        : [[0, -1], [1, 0], [0, 1], [-1, 0]];
    let reached = new Set<number>();
    for (;;) {
      const mask = new Uint8Array(this.width * this.height);
      for (let i = 0; i < mask.length; i++) mask[i] = this.terrainBlocks([i % this.width, Math.floor(i / this.width)]) ? 1 : 0;
      // SPEC_ISSUES.md#verification-passability: creatures do not block access.
      for (const o of [...this.entities, ...this.doors]) {
        if (o.obstructs && !(o.kind === "door" && passableDoor(o))) for (const c of footprintCells(o.at, o.footprint)) mask[this.#key(c)] = 1;
      }
      const blocked = (c: Cell): boolean => !this.#inBounds(c) || mask[this.#key(c)] === 1;
      const next = new Set<number>();
      const queue: Cell[] = [];
      for (const c of this.rooms[0]!.cells) {
        if (!blocked(c)) {
          next.add(this.#key(c));
          queue.push(c);
        }
      }
      for (let i = 0; i < queue.length; i++) {
        const c = queue[i]!;
        for (const [dx, dy] of steps) {
          const n: Cell = [c[0] + dx, c[1] + dy];
          if (blocked(n) || next.has(this.#key(n)) || !adjacent(c, n, metric, blocked)) continue;
          next.add(this.#key(n));
          queue.push(n);
        }
      }
      const before = keys.size;
      for (const k of next) for (const o of this.#occupants.get(k) ?? []) if (o.kind === "item" && o.ref) keys.add(o.ref);
      const done = next.size === reached.size && keys.size === before;
      reached = next;
      if (done) return reached;
    }
  }

  /** The cell is reached, or, for an entity that obstructs movement, a cell adjacent to it is. */
  reaches(reached: ReadonlySet<number>, p: Placed, metric: Metric): boolean {
    const cells = footprintCells(p.at, p.footprint);
    if (cells.some((c) => reached.has(this.#key(c)))) return true;
    if (!p.obstructs) return false;
    return cells.some((c) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n: Cell = [c[0] + dx, c[1] + dy];
          if (this.#inBounds(n) && reached.has(this.#key(n)) && adjacent(n, c, metric, (x) => this.terrainBlocks(x))) return true;
        }
      }
      return false;
    });
  }

  cellReached(reached: ReadonlySet<number>, cell: Cell): boolean {
    return reached.has(this.#key(cell));
  }
}
