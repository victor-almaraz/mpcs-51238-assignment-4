// Distance, adjacency, line of sight, and direction labels (engine.md, "Space").

/** `[x, y]`: x increases east, y increases south, `[0, 0]` is the top-left cell. */
export type Cell = readonly [number, number];
/** `[width, height]` in cells, anchored at the top-left cell. */
export type Footprint = readonly [number, number];
export type Metric = "chebyshev" | "manhattan";

/** A cell predicate, such as "obstructs sight" or "obstructs movement". */
export type CellTest = (cell: Cell) => boolean;

export const UNIT: Footprint = [1, 1];

export function sameCell(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function distance(a: Cell, b: Cell, metric: Metric): number {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return metric === "chebyshev" ? Math.max(dx, dy) : dx + dy;
}

/** The cells of a footprint anchored at `at`, in row-major order. */
export function footprintCells(at: Cell, footprint: Footprint = UNIT): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < footprint[1]; y++) for (let x = 0; x < footprint[0]; x++) cells.push([at[0] + x, at[1] + y]);
  return cells;
}

/** The smallest distance between any cell of one footprint and any cell of the other. */
export function footprintDistance(a: Cell, af: Footprint, b: Cell, bf: Footprint, metric: Metric): number {
  const gap = (lo1: number, len1: number, lo2: number, len2: number): number =>
    Math.max(0, lo2 - (lo1 + len1 - 1), lo1 - (lo2 + len2 - 1));
  const dx = gap(a[0], af[0], b[0], bf[0]);
  const dy = gap(a[1], af[1], b[1], bf[1]);
  return metric === "chebyshev" ? Math.max(dx, dy) : dx + dy;
}

/**
 * Two cells are adjacent when their distance is 1, except that a diagonal pair is not adjacent
 * when either of the two cells it passes between obstructs movement.
 */
export function adjacent(a: Cell, b: Cell, metric: Metric, blocksMovement: CellTest): boolean {
  if (distance(a, b, metric) !== 1) return false;
  if (a[0] === b[0] || a[1] === b[1]) return true;
  return !blocksMovement([b[0], a[1]]) && !blocksMovement([a[0], b[1]]);
}

/** Footprints are adjacent when any cell of one is adjacent to any cell of the other. */
export function footprintsAdjacent(
  a: Cell,
  af: Footprint,
  b: Cell,
  bf: Footprint,
  metric: Metric,
  blocksMovement: CellTest,
): boolean {
  const bs = footprintCells(b, bf);
  return footprintCells(a, af).some((ca) => bs.some((cb) => adjacent(ca, cb, metric, blocksMovement)));
}

/** Footprints overlap when they share a cell. */
export function footprintsOverlap(a: Cell, af: Footprint, b: Cell, bf: Footprint): boolean {
  return a[0] < b[0] + bf[0] && b[0] < a[0] + af[0] && a[1] < b[1] + bf[1] && b[1] < a[1] + af[1];
}

/** Every cell of the line from `a` to `b`, both included. */
export function line(a: Cell, b: Cell): Cell[] {
  let [x, y] = a;
  const [x1, y1] = b;
  const dx = Math.abs(x1 - x);
  const dy = -Math.abs(y1 - y);
  const sx = x < x1 ? 1 : -1;
  const sy = y < y1 ? 1 : -1;
  let err = dx + dy;
  const cells: Cell[] = [];
  for (;;) {
    cells.push([x, y]);
    if (x === x1 && y === y1) return cells;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function clear(cells: readonly Cell[], blocksSight: CellTest): boolean {
  for (let i = 1; i < cells.length - 1; i++) if (blocksSight(cells[i]!)) return false;
  return true;
}

/**
 * The sight line from `a` to `b`: `line(a, b)` when no cell strictly between its endpoints
 * obstructs sight, else `line(b, a)` when that is clear, else null.
 */
export function sightLine(a: Cell, b: Cell, blocksSight: CellTest): Cell[] | null {
  const forward = line(a, b);
  if (clear(forward, blocksSight)) return forward;
  const backward = line(b, a);
  return clear(backward, blocksSight) ? backward : null;
}

/** Cell `a` sees cell `b`. Symmetric; endpoints never block; no range limit. */
export function sees(a: Cell, b: Cell, blocksSight: CellTest): boolean {
  return sightLine(a, b, blocksSight) !== null;
}

/** An entity sees another when any cell of its footprint sees any cell of the other's. */
export function footprintSees(a: Cell, af: Footprint, b: Cell, bf: Footprint, blocksSight: CellTest): boolean {
  const bs = footprintCells(b, bf);
  return footprintCells(a, af).some((ca) => bs.some((cb) => sees(ca, cb, blocksSight)));
}

export type Direction =
  | "here"
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west"
  | "north-west";

/** The direction label of the offset `(dx, dy)` from an actor to a target. */
export function direction(dx: number, dy: number): Direction {
  if (dx === 0 && dy === 0) return "here";
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const ns = dy < 0 ? "north" : "south";
  const ew = dx < 0 ? "west" : "east";
  if (ax >= 2 * ay) return ew;
  if (ay >= 2 * ax) return ns;
  return `${ns}-${ew}`;
}
