// Layout, connectivity, roles, and depth (generation.md, "Pipeline", steps 1 to 3).

import type { Cell } from "../grid";
import type { Rng } from "../rng";
import type { RoomRole } from "./types";

/** A region: a rectangle of cells including its boundary walls. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A failed attempt; the generator retries with the next attempt seed. */
export class AttemptFailed extends Error {}

const interiorArea = (r: Region): number => (r.w - 2) * (r.h - 2);

/**
 * Step 1: binary space partition of a `width` × `height` map into at most `count` regions.
 * Regions are returned in row-major order of their top-left cell.
 */
export function partition(width: number, height: number, count: number, minRoom: number, rng: Rng): Region[] {
  const regions: (Region & { created: number })[] = [{ x: 0, y: 0, w: width, h: height, created: 0 }];
  let created = 1;
  const need = 2 * minRoom + 1;
  // SPEC_ISSUES.md#bsp-split-candidates: the largest region is taken among those that can split.
  const splittable = (r: Region) => r.w - 2 >= need || r.h - 2 >= need;
  while (regions.length < count) {
    let best = -1;
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i]!;
      if (!splittable(r)) continue;
      const b = regions[best];
      if (!b || interiorArea(r) > interiorArea(b) || (interiorArea(r) === interiorArea(b) && r.created < b.created)) best = i;
    }
    if (best < 0) break;
    const r = regions[best]!;
    const iw = r.w - 2;
    const ih = r.h - 2;
    // SPEC_ISSUES.md#generator-orderings: on equal sides the RNG picks from [vertical wall, horizontal wall].
    const vertical = iw > ih ? true : ih > iw ? false : rng.pick([true, false]);
    const length = vertical ? r.w : r.h;
    const origin = vertical ? r.x : r.y;
    const lines: number[] = [];
    for (let s = origin + minRoom + 1; s <= origin + length - 2 - minRoom; s++) lines.push(s);
    const s = rng.pick(lines);
    // SPEC_ISSUES.md#generator-orderings: the west or north child is created first.
    const a = vertical ? { x: r.x, y: r.y, w: s - r.x + 1, h: r.h } : { x: r.x, y: r.y, w: r.w, h: s - r.y + 1 };
    const b = vertical ? { x: s, y: r.y, w: r.x + r.w - s, h: r.h } : { x: r.x, y: s, w: r.w, h: r.y + r.h - s };
    regions.splice(best, 1, { ...a, created: created++ }, { ...b, created: created++ });
  }
  // SPEC_ISSUES.md#generator-orderings: before renumbering, room ids follow row-major order of the region's top-left cell.
  return regions.map(({ x, y, w, h }) => ({ x, y, w, h })).sort((p, q) => p.y - q.y || p.x - q.x);
}

export interface Adjacency {
  /** Room indices, `a < b`. */
  a: number;
  b: number;
  /** Candidate doorways in row-major order. */
  cells: Cell[];
  weight: number;
}

/** Step 2.1–2.2: adjacencies between regions, with candidate doorways and weights, ordered by `(a, b)`. */
export function adjacencies(regions: readonly Region[], width: number, height: number): Adjacency[] {
  const owner = new Int16Array(width * height).fill(-1);
  regions.forEach((r, i) => {
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) owner[y * width + x] = i;
  });
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : owner[y * width + x]!);
  const found = new Map<number, Adjacency>();
  const add = (p: number, q: number, cell: Cell) => {
    if (p < 0 || q < 0 || p === q) return;
    const [a, b] = p < q ? [p, q] : [q, p];
    const key = a * 256 + b;
    let adj = found.get(key);
    if (!adj) {
      const ra = regions[a]!;
      const rb = regions[b]!;
      const dx = 2 * ra.x + ra.w - (2 * rb.x + rb.w);
      const dy = 2 * ra.y + ra.h - (2 * rb.y + rb.h);
      adj = { a, b, cells: [], weight: dx * dx + dy * dy };
      found.set(key, adj);
    }
    adj.cells.push(cell);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (owner[y * width + x] !== -1) continue;
      add(at(x - 1, y), at(x + 1, y), [x, y]);
      add(at(x, y - 1), at(x, y + 1), [x, y]);
    }
  }
  return [...found.values()].sort((p, q) => p.a - q.a || p.b - q.b);
}

function find(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]!]!;
    i = parent[i]!;
  }
  return i;
}

/**
 * Step 2.3–2.4: Kruskal's minimum spanning tree, ties by the pair of room ids, plus
 * `round(loopRatio × (adjacencies − tree edges))` further adjacencies by RNG. Returns the selected
 * adjacencies ordered by `(a, b)`, or fails the attempt when the rooms are not connected.
 */
export function connect(count: number, adjs: readonly Adjacency[], loopRatio: number, rng: Rng): Adjacency[] {
  const parent = Array.from({ length: count }, (_, i) => i);
  const byWeight = [...adjs].sort((p, q) => p.weight - q.weight || p.a - q.a || p.b - q.b);
  const tree = new Set<Adjacency>();
  for (const adj of byWeight) {
    const ra = find(parent, adj.a);
    const rb = find(parent, adj.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    tree.add(adj);
  }
  if (tree.size !== count - 1) throw new AttemptFailed("the rooms are not connected");
  const rest = adjs.filter((adj) => !tree.has(adj));
  // SPEC_ISSUES.md#generator-orderings: `round` rounds halves up.
  const loops = Math.round(loopRatio * rest.length);
  const selected = new Set(tree);
  for (let i = 0; i < loops; i++) {
    const adj = rng.pick(rest);
    rest.splice(rest.indexOf(adj), 1);
    selected.add(adj);
  }
  return adjs.filter((adj) => selected.has(adj));
}

export interface Doorway {
  cell: Cell;
  /** Room indices after renumbering. */
  a: number;
  b: number;
  /** The room the doorway cell belongs to. */
  owner: number;
}

export interface Layout {
  /** Regions in room order: index `i` is room `r{i + 1}`. */
  regions: Region[];
  depth: number[];
  roles: Set<RoomRole>[];
  /** Index of the room with role `boss`. */
  boss: number;
  /** Doorways in row-major order: index `i` is door `d{i + 1}`. */
  doorways: Doorway[];
  /** BFS predecessor of each room; -1 for the entry. */
  parent: number[];
}

/**
 * Step 2.5 and step 3: doorways, the entry, BFS depth and renumbering, roles, and doorway ownership.
 */
export function assignRoles(regions: readonly Region[], selected: readonly Adjacency[], width: number, height: number, rng: Rng): Layout {
  // SPEC_ISSUES.md#generator-orderings: doorways are chosen for selected adjacencies in `(a, b)` order.
  const chosen = selected.map((adj) => ({ adj, cell: rng.pick(adj.cells) }));

  const touching = regions.map((_, i) => i).filter((i) => {
    const r = regions[i]!;
    return r.x === 0 || r.y === 0 || r.x + r.w === width || r.y + r.h === height;
  });
  const entry = rng.pick(touching);

  const neighbours: number[][] = regions.map(() => []);
  for (const { adj } of chosen) {
    neighbours[adj.a]!.push(adj.b);
    neighbours[adj.b]!.push(adj.a);
  }
  for (const list of neighbours) list.sort((p, q) => p - q);
  const order = [entry];
  const oldDepth = regions.map(() => -1);
  const oldParent = regions.map(() => -1);
  oldDepth[entry] = 0;
  for (let i = 0; i < order.length; i++) {
    const room = order[i]!;
    for (const n of neighbours[room]!) {
      if (oldDepth[n] !== -1) continue;
      oldDepth[n] = oldDepth[room]! + 1;
      oldParent[n] = room;
      order.push(n);
    }
  }
  if (order.length !== regions.length) throw new AttemptFailed("the rooms are not connected");

  const renumber = regions.map(() => 0);
  order.forEach((old, i) => (renumber[old] = i));
  const depth = order.map((old) => oldDepth[old]!);
  const parent = order.map((old) => (oldParent[old] === -1 ? -1 : renumber[oldParent[old]!]!));
  const doors = order.map(() => 0);
  const doorways: Doorway[] = chosen.map(({ adj, cell }) => {
    const a = renumber[adj.a]!;
    const b = renumber[adj.b]!;
    doors[a]!++;
    doors[b]!++;
    const owner = depth[a]! < depth[b]! || (depth[a] === depth[b] && a < b) ? a : b;
    return { cell, a, b, owner };
  });
  doorways.sort((p, q) => p.cell[1] - q.cell[1] || p.cell[0] - q.cell[0]);

  // SPEC_ISSUES.md#generated-room-roles: roles accumulate; a room may hold several.
  const roles = order.map(() => new Set<RoomRole>());
  roles[0]!.add("entry");
  doors.forEach((n, i) => n === 1 && roles[i]!.add("dead_end"));
  const max = Math.max(...depth);
  const deepest = depth.map((_, i) => i).filter((i) => depth[i] === max);
  // SPEC_ISSUES.md#generator-orderings: the RNG breaks a tie only when several rooms share the maximum depth.
  const boss = deepest.length > 1 ? rng.pick(deepest) : deepest[0]!;
  roles[boss]!.add("boss");

  return { regions: order.map((old) => regions[old]!), depth, roles, boss, doorways, parent };
}
