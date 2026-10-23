// Map checks (spec/README.md, "Map checks"; setting-packs.md, "Maps"): rows, legend, and the
// cells placed entities occupy.

import { BUILTIN_TERRAIN, MAX_SIZE, footprintCells, parseMap, type Cell, type Footprint, type LegendEntry, type ParsedMap, type TerrainType } from "../grid";
import { formatPath, type Segment } from "./diagnostics";
import type { Diagnostics } from "./pack";
import { isObject, type Json, type JsonObject } from "./walk";

export interface Template {
  kind: string;
  footprint: Footprint;
  obstructsMovement: boolean;
}

/** The template key an NPC placement resolves through `MapContext.template`. */
export const npcRef = (npc: string): string => `npc:${npc}`;

export interface MapContext {
  file: string;
  /** Path of the map object (with `legend` and `rows`). */
  path: Segment[];
  terrain: Readonly<Record<string, TerrainType>>;
  /** The template a ref names, or undefined when it does not resolve (reported by the ref checks). */
  template: (ref: string) => Template | undefined;
}

const BUILTIN_CHARS = new Set([" ", ".", "#"]);

/** Template defaults (setting-packs.md, entities): footprints and what each kind obstructs. */
export function templateOf(value: JsonObject): Template {
  const kind = value.kind as string;
  const footprint = (Array.isArray(value.footprint) ? value.footprint : [1, 1]) as unknown as Footprint;
  const obstructs = Array.isArray(value.obstructs)
    ? (value.obstructs as string[])
    : kind === "obstacle" || kind === "door"
      ? ["movement", "sight"]
      : [];
  const closedDoor = kind !== "door" || value.open !== true;
  return {
    kind,
    footprint: kind === "item" || kind === "door" ? [1, 1] : footprint,
    obstructsMovement: kind !== "creature" && closedDoor && obstructs.includes("movement"),
  };
}

/** Checks rows and legend; returns the parsed map when they are valid. */
export function checkGrid(map: JsonObject, ctx: MapContext, out: Diagnostics): ParsedMap | undefined {
  const rows = map.rows as string[];
  const legend = (isObject(map.legend) ? map.legend : {}) as Record<string, LegendEntry>;
  let ok = true;
  const width = rows[0]?.length ?? 0;
  if (rows.length > MAX_SIZE) {
    out.add(ctx.file, [...ctx.path, "rows"], `has ${rows.length} rows; a map has at most ${MAX_SIZE}`, "map");
    ok = false;
  }
  rows.forEach((row, y) => {
    if (row.length !== width) {
      out.add(ctx.file, [...ctx.path, "rows", y], `has ${row.length} characters; row 0 has ${width}`, "map");
      ok = false;
    }
    if (row.length > MAX_SIZE) {
      out.add(ctx.file, [...ctx.path, "rows", y], `has ${row.length} characters; a row has at most ${MAX_SIZE}`, "map");
      ok = false;
    }
    [...row].forEach((ch, x) => {
      if (!BUILTIN_CHARS.has(ch) && !(ch in legend)) {
        out.add(ctx.file, [...ctx.path, "rows", y], `character '${ch}' at [${x}, ${y}] is not built in or in the legend`, "map");
        ok = false;
      }
    });
  });
  for (const [ch, entry] of Object.entries(legend)) {
    const terrain = typeof entry === "string" ? entry : entry.terrain;
    if (!(terrain in ctx.terrain)) {
      const at = typeof entry === "string" ? [...ctx.path, "legend", ch] : [...ctx.path, "legend", ch, "terrain"];
      out.add(ctx.file, at, `terrain '${terrain}' is not declared`, "declared");
      ok = false;
    }
  }
  return ok ? parseMap(rows, legend) : undefined;
}

interface Occupant {
  ref: string;
  template: Template;
  where: string;
}

/**
 * Checks every placed entity: legend placements and `contents` entries with `at`. Each lies inside
 * the map with its whole footprint on cells that are not void and whose terrain does not obstruct
 * movement; no cell holds two creatures or two doors, or a movement-obstructing entity together
 * with any other placed entity.
 */
export function checkPlacements(
  parsed: ParsedMap,
  contents: readonly Json[],
  contentsPath: Segment[],
  ctx: MapContext,
  out: Diagnostics,
): void {
  const cells = new Map<number, Occupant[]>();
  const terrainAt = ([x, y]: Cell) => parsed.terrain[y * parsed.width + x]!;
  const size = `${parsed.width}x${parsed.height}`;

  const place = (ref: string, at: Cell, path: Segment[], where: string) => {
    const template = ctx.template(ref);
    if (!template) return;
    for (const cell of footprintCells(at, template.footprint)) {
      const [x, y] = cell;
      if (x < 0 || y < 0 || x >= parsed.width || y >= parsed.height) {
        out.add(ctx.file, path, `cell [${x}, ${y}] is outside the ${size} map`, "placement");
        return;
      }
      const t = terrainAt(cell);
      if (t === "void") {
        out.add(ctx.file, path, `cell [${x}, ${y}] is void`, "placement");
        return;
      }
      if (ctx.terrain[t]?.obstructs.includes("movement")) {
        out.add(ctx.file, path, `cell [${x}, ${y}] has terrain '${t}', which obstructs movement`, "placement");
        return;
      }
    }
    const me: Occupant = { ref, template, where };
    for (const [x, y] of footprintCells(at, template.footprint)) {
      const key = y * MAX_SIZE + x;
      const here = cells.get(key) ?? [];
      for (const other of here) {
        const clash =
          (me.template.kind === "creature" && other.template.kind === "creature") ||
          (me.template.kind === "door" && other.template.kind === "door") ||
          me.template.obstructsMovement ||
          other.template.obstructsMovement;
        if (clash) {
          out.add(ctx.file, path, `cell [${x}, ${y}] is already occupied by ${other.where}`, "placement");
          return;
        }
      }
      here.push(me);
      cells.set(key, here);
    }
  };

  for (const { at, ref } of parsed.placements) {
    const path = [...ctx.path, "rows", at[1]];
    place(ref, at, path, formatPath(path));
  }
  contents.forEach((entry, i) => {
    if (!isObject(entry) || !Array.isArray(entry.at)) return;
    const ref = typeof entry.ref === "string" ? entry.ref : typeof entry.npc === "string" ? npcRef(entry.npc) : undefined;
    if (ref === undefined) return;
    place(ref, entry.at as unknown as Cell, [...contentsPath, i, "at"], formatPath([...contentsPath, i]));
  });
}

/** Built-in terrain merged with a pack's declared terrain, with defaults. */
export function terrainTable(declared: Readonly<Record<string, JsonObject>>): Record<string, TerrainType> {
  const table: Record<string, TerrainType> = { ...BUILTIN_TERRAIN };
  for (const [id, t] of Object.entries(declared)) {
    table[id] = { obstructs: (t.obstructs as TerrainType["obstructs"] | undefined) ?? [], cost: (t.cost as number | undefined) ?? 1 };
  }
  return table;
}
