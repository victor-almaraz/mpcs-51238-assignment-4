// Map parsing and the terrain layer (engine.md, "Cells" and "Terrain"; setting-packs.md, "Maps").

import type { Cell } from "./geometry";

/** Maps are at most 64 × 64 cells. */
export const MAX_SIZE = 64;

export type Obstruction = "movement" | "sight";

export interface TerrainType {
  obstructs: readonly Obstruction[];
  cost: number;
}

/** The three built-in terrain types. */
export const BUILTIN_TERRAIN: Readonly<Record<"void" | "floor" | "wall", TerrainType>> = {
  void: { obstructs: ["movement", "sight"], cost: 1 },
  floor: { obstructs: [], cost: 1 },
  wall: { obstructs: ["movement", "sight"], cost: 1 },
};

const BUILTIN_CHARS: Readonly<Record<string, string>> = { " ": "void", ".": "floor", "#": "wall" };

/** A legend entry: a terrain id, or a terrain id with one entity template placed on the cell. */
export type LegendEntry = string | { terrain: string; place: string };

export interface ParsedMap {
  width: number;
  height: number;
  /** Terrain id per cell, row-major from the top-left cell. */
  terrain: string[];
  /** Entities placed through the legend, in row-major order. */
  placements: { at: Cell; ref: string }[];
}

export class MapError extends Error {}

/** Parses rows of characters, north first, with a legend for characters other than ` `, `.`, and `#`. */
export function parseMap(rows: readonly string[], legend: Readonly<Record<string, LegendEntry>> = {}): ParsedMap {
  if (rows.length === 0 || rows.length > MAX_SIZE) {
    throw new MapError(`a map has 1 to ${MAX_SIZE} rows, not ${rows.length}`);
  }
  const width = rows[0]!.length;
  if (width === 0 || width > MAX_SIZE) throw new MapError(`a row has 1 to ${MAX_SIZE} characters, not ${width}`);
  for (const key of Object.keys(legend)) {
    if (key in BUILTIN_CHARS) throw new MapError(`legend cannot redefine '${key}'`);
  }
  const terrain: string[] = [];
  const placements: { at: Cell; ref: string }[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) throw new MapError(`row ${y} has ${row.length} characters, not ${width}`);
    [...row].forEach((ch, x) => {
      const entry = legend[ch] ?? BUILTIN_CHARS[ch];
      if (entry === undefined) throw new MapError(`character '${ch}' at [${x}, ${y}] is not in the legend`);
      if (typeof entry === "string") terrain.push(entry);
      else {
        terrain.push(entry.terrain);
        placements.push({ at: [x, y], ref: entry.place });
      }
    });
  });
  return { width, height: rows.length, terrain, placements };
}

/**
 * The static terrain layer of one location. Cells outside the map are `void`.
 * Terrain never changes during play.
 */
export class TerrainGrid {
  readonly width: number;
  readonly height: number;
  readonly #ids: readonly string[];
  readonly #blocksMovement: Uint8Array;
  readonly #blocksSight: Uint8Array;
  readonly #cost: Uint8Array;

  constructor(map: Pick<ParsedMap, "width" | "height" | "terrain">, types: Readonly<Record<string, TerrainType>> = {}) {
    if (map.terrain.length !== map.width * map.height) throw new MapError("terrain does not match the map size");
    this.width = map.width;
    this.height = map.height;
    this.#ids = [...map.terrain];
    const n = map.terrain.length;
    this.#blocksMovement = new Uint8Array(n);
    this.#blocksSight = new Uint8Array(n);
    this.#cost = new Uint8Array(n);
    map.terrain.forEach((id, i) => {
      const t = types[id] ?? (BUILTIN_TERRAIN as Record<string, TerrainType>)[id];
      if (!t) throw new MapError(`terrain '${id}' is not declared`);
      if (!Number.isInteger(t.cost) || t.cost < 1 || t.cost > 4) throw new MapError(`terrain '${id}' has cost ${t.cost}, not 1-4`);
      this.#blocksMovement[i] = t.obstructs.includes("movement") ? 1 : 0;
      this.#blocksSight[i] = t.obstructs.includes("sight") ? 1 : 0;
      this.#cost[i] = t.cost;
    });
  }

  inBounds([x, y]: Cell): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  terrain(cell: Cell): string {
    return this.inBounds(cell) ? this.#ids[cell[1] * this.width + cell[0]]! : "void";
  }

  blocksMovement(cell: Cell): boolean {
    return !this.inBounds(cell) || this.#blocksMovement[cell[1] * this.width + cell[0]] === 1;
  }

  blocksSight(cell: Cell): boolean {
    return !this.inBounds(cell) || this.#blocksSight[cell[1] * this.width + cell[0]] === 1;
  }

  /** Movement spent to enter the cell. */
  cost(cell: Cell): number {
    return this.inBounds(cell) ? this.#cost[cell[1] * this.width + cell[0]]! : 1;
  }

  /** Every cell in row-major order. */
  *cells(): Generator<Cell> {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) yield [x, y];
  }
}
