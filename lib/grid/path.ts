// Pathfinding and movement allowance (engine.md, "Pathfinding" and "Movement").

import { MAX_SIZE } from "./map";
import { UNIT, footprintCells, type Cell, type CellTest, type Footprint, type Metric } from "./geometry";

export interface MoveRules {
  metric: Metric;
  /** The mover's footprint; default `[1, 1]`. */
  footprint?: Footprint;
  /** The cell is open for the mover: passable terrain, no obstructing entity, no opposing creature. */
  open: CellTest;
  /** The cell obstructs movement, for the corner rule. */
  blocksMovement: CellTest;
  /** Movement spent to enter the cell. */
  cost: (cell: Cell) => number;
}

// Neighbour order: north, east, south, west, then north-east, south-east, south-west, north-west.
const ORTHOGONAL: readonly Cell[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const DIAGONAL: readonly Cell[] = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

const key = ([x, y]: Cell): number => y * MAX_SIZE + x;
const cellOf = (k: number): Cell => [k % MAX_SIZE, Math.floor(k / MAX_SIZE)];
const inRange = ([x, y]: Cell): boolean => x >= 0 && y >= 0 && x < MAX_SIZE && y < MAX_SIZE;

/** Binary min-heap of `[cost, cellKey]`, ordered by `(cost, y, x)`; the key is `y * 64 + x`. */
class Frontier {
  readonly #items: [number, number][] = [];

  get size(): number {
    return this.#items.length;
  }

  static #less(a: [number, number], b: [number, number]): boolean {
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  }

  push(item: [number, number]): void {
    const h = this.#items;
    h.push(item);
    for (let i = h.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (!Frontier.#less(h[i]!, h[p]!)) break;
      [h[i], h[p]] = [h[p]!, h[i]!];
      i = p;
    }
  }

  pop(): [number, number] {
    const h = this.#items;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && Frontier.#less(h[l]!, h[m]!)) m = l;
        if (r < h.length && Frontier.#less(h[r]!, h[m]!)) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m]!, h[i]!];
        i = m;
      }
    }
    return top;
  }
}

/**
 * The anchor may step from `from` by `step` when the whole footprint is open at the new anchor
 * and, for a diagonal step, no footprint cell cuts a blocked corner.
 */
function canStep(from: Cell, step: Cell, rules: MoveRules): boolean {
  const footprint = rules.footprint ?? UNIT;
  const to: Cell = [from[0] + step[0], from[1] + step[1]];
  if (!inRange(to)) return false;
  if (!footprintCells(to, footprint).every(rules.open)) return false;
  if (step[0] === 0 || step[1] === 0) return true;
  // engine.md, "Distance and adjacency": every footprint cell obeys the corner rule.
  return footprintCells(from, footprint).every(
    ([x, y]) => !rules.blocksMovement([x + step[0], y]) && !rules.blocksMovement([x, y + step[1]]),
  );
}

interface Search {
  cost: Map<number, number>;
  prev: Map<number, number>;
  goal: number | undefined;
}

function dijkstra(start: Cell, rules: MoveRules, isGoal: (k: number) => boolean, limit: number): Search {
  const steps = rules.metric === "chebyshev" ? [...ORTHOGONAL, ...DIAGONAL] : ORTHOGONAL;
  const cost = new Map<number, number>([[key(start), 0]]);
  const prev = new Map<number, number>();
  const frontier = new Frontier();
  frontier.push([0, key(start)]);
  while (frontier.size > 0) {
    const [c, k] = frontier.pop();
    if (c > cost.get(k)!) continue; // superseded entry
    if (isGoal(k)) return { cost, prev, goal: k };
    const here = cellOf(k);
    for (const step of steps) {
      if (!canStep(here, step, rules)) continue;
      const next: Cell = [here[0] + step[0], here[1] + step[1]];
      // engine.md, "Pathfinding": the cost is the new anchor cell's terrain cost.
      const nc = c + rules.cost(next);
      if (nc > limit) continue;
      const nk = key(next);
      const known = cost.get(nk);
      if (known === undefined || nc < known) {
        cost.set(nk, nc);
        prev.set(nk, k);
        frontier.push([nc, nk]);
      }
    }
  }
  return { cost, prev, goal: undefined };
}

function chain(search: Search, goal: number): Cell[] {
  const path: Cell[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = search.prev.get(k)) path.push(cellOf(k));
  return path.reverse();
}

/**
 * The cheapest path from `start` to the first goal taken from the frontier: lowest cost, then
 * lowest y, then lowest x. Cells are anchor cells of the mover's footprint. Null when no path exists.
 */
export function findPath(start: Cell, goals: Iterable<Cell>, rules: MoveRules): Cell[] | null {
  const wanted = new Set<number>();
  for (const g of goals) if (inRange(g)) wanted.add(key(g));
  if (wanted.size === 0) return null;
  const search = dijkstra(start, rules, (k) => wanted.has(k), Infinity);
  return search.goal === undefined ? null : chain(search, search.goal);
}

export interface Reachable {
  cell: Cell;
  cost: number;
  path: Cell[];
}

/** Every cell reachable from `start` at a cost of at most `limit`, with its cheapest path, in `(cost, y, x)` order. */
export function reachable(start: Cell, rules: MoveRules, limit = Infinity): Reachable[] {
  const search = dijkstra(start, rules, () => false, limit);
  return [...search.cost.entries()]
    .sort(([ka, ca], [kb, cb]) => ca - cb || ka - kb)
    .map(([k, c]) => ({ cell: cellOf(k), cost: c, path: chain(search, k) }));
}

export interface WalkRules {
  /** Movement available, or null for the whole path. */
  allowance: number | null;
  cost: (cell: Cell) => number;
  /** The mover may stop on the cell: it is open and no other creature occupies it. */
  free: CellTest;
  /** Stop on reaching the cell at `index` of the path, such as the first cell of an unvisited room. */
  stopAt?: (cell: Cell, index: number) => boolean;
}

export interface Walk {
  /** Index in the path of the cell the mover stops on. */
  index: number;
  /** Movement spent to reach that cell. */
  spent: number;
  /**
   * `arrived` at the last cell; `allowance` ran out; `early` by `stopAt`; `short` when the path
   * ends on cells that are not free, so the mover stops on the last free cell before them.
   */
  stopped: "arrived" | "allowance" | "early" | "short";
}

/**
 * Walks `path` one cell at a time, spending each cell's cost. The mover stops on the last free cell
 * it reaches within its allowance, or early on reaching a cell for which `stopAt` holds.
 */
export function walk(path: readonly Cell[], rules: WalkRules): Walk {
  let spent = 0;
  let last = { index: 0, spent: 0 };
  for (let i = 1; i < path.length; i++) {
    const cell = path[i]!;
    const next = spent + rules.cost(cell);
    if (rules.allowance !== null && next > rules.allowance) return { ...last, stopped: "allowance" };
    spent = next;
    if (rules.free(cell)) last = { index: i, spent };
    if (i === path.length - 1) break;
    // engine.md, "Movement": an early stop on a cell that is not free ends on the last free cell before it.
    if (rules.stopAt?.(cell, i)) return { ...last, stopped: "early" };
  }
  return { ...last, stopped: last.index === path.length - 1 ? "arrived" : "short" };
}
