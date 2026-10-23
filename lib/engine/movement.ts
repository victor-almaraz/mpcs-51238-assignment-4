// Movement (engine.md, "Pathfinding", "Movement", "Links", "Reach"): goal cells, walking a path,
// link travel, and approach.

import { adjacent, distance, findPath, footprintCells, footprintsAdjacent, footprintsOverlap, reachable, sightLine, type Cell, type MoveRules } from "../grid";
import { reject, rules, type Ctx } from "./ctx";
import { openDoor } from "./effects";
import { roomOf } from "./requirements";
import { Perception, blocksSight, bodiesIn, cellsOf, key, moverTests, placement, roomAt, roomCells, type Body } from "./world";

/** Whether an entity carries the `hostile` tag: its template's, its NPC's disposition, or `set_hostile`. */
export function isHostile(ctx: Ctx, id: string): boolean {
  const e = ctx.state.entities[id];
  if (!e || e.kind !== "creature") return false;
  if (e.hostile !== undefined) return e.hostile;
  if (e.npc !== undefined && ctx.c.npc(e.npc)?.disposition === "hostile") return true;
  return (ctx.c.template(e.ref).tags ?? []).includes("hostile");
}

/** Active hostile creatures visible to the body. */
export function visibleHostiles(ctx: Ctx, body: Body): Set<string> {
  const perception = new Perception(ctx.state, ctx.c);
  const out = new Set<string>();
  for (const b of bodiesIn(ctx.state, ctx.c, body.location)) {
    if (b.kind === "creature" && isHostile(ctx, b.id) && ctx.isActive(b.id) && perception.visible(body, b.id)) out.add(b.id);
  }
  return out;
}

/** Closed doors that do not block an exploration path: unlocked and closed. */
function passableDoors(ctx: Ctx, location: string): Set<string> {
  const out = new Set<string>();
  for (const [id, e] of Object.entries(ctx.state.entities)) if (e.kind === "door" && e.location === location && !e.open && !e.locked) out.add(id);
  return out;
}

export function rulesFor(ctx: Ctx, mover: Body, passable: ReadonlySet<string>): MoveRules & { free: (cell: Cell) => boolean } {
  const tests = moverTests(ctx.state, ctx.c, mover, passable);
  const g = ctx.state.locations[mover.location]!;
  const terrain = (cell: Cell) => {
    const ch = g.rows[cell[1]]?.[cell[0]];
    return g.terrain[g.legend[ch ?? " "] ?? "void"]?.cost ?? 1;
  };
  return { metric: ctx.system.SPATIAL.metric, footprint: mover.footprint, open: tests.open, blocksMovement: tests.blocksMovement, cost: terrain, free: tests.free };
}

/** Goal cells for a destination (engine.md, "Pathfinding", goal cells). */
export function goalCells(ctx: Ctx, mover: Body, to: string, free: (cell: Cell) => boolean, blocks: (cell: Cell) => boolean): Cell[] {
  const loc = ctx.state.locations[mover.location]!;
  if (loc.rooms[to]) return roomCells(loc, to).filter((cell) => footprintCells(cell, mover.footprint).every(free));
  const link = loc.links[to];
  if (link) return [link.at];
  const p = placement(ctx.state, ctx.c, to);
  if (!p || p.location !== mover.location) return [];
  const e = ctx.state.entities[to];
  const fits = (cell: Cell) => footprintCells(cell, mover.footprint).every(free);
  if (e?.kind === "item" && fits(p.at)) return [p.at];
  const metric = ctx.system.SPATIAL.metric;
  const goals: Cell[] = [];
  const g = loc.rows;
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < (g[0]?.length ?? 0); x++) {
      const cell: Cell = [x, y];
      if (!fits(cell)) continue;
      if (footprintsAdjacent(cell, mover.footprint, p.at, p.footprint, metric, blocks)) goals.push(cell);
    }
  }
  if (e?.kind === "door" && e.open && fits(p.at)) goals.push(p.at);
  return goals.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export interface Moved {
  steps: number;
  stopped: "arrived" | "allowance" | "new_room" | "hostile_seen";
  reachedEnd: boolean;
}

/**
 * Walks `path` (anchor cells from the mover's cell) under the mode's rules: spends terrain cost,
 * opens closed unlocked doors on the way in exploration, and stops on the last free cell reached.
 */
export function walk(ctx: Ctx, mover: Body, path: readonly Cell[], allowance: number | null, exploration: boolean): Moved {
  const state = ctx.state;
  const loc = state.locations[mover.location]!;
  const passable = exploration ? passableDoors(ctx, mover.location) : new Set<string>();
  const startRoom = roomAt(loc, mover.at);
  const seenAtStart = exploration ? visibleHostiles(ctx, mover) : new Set<string>();
  let spent = 0;
  let last = 0;
  let stopped: Moved["stopped"] = "arrived";
  const setAt = (cell: Cell) => {
    if (mover.kind === "character") state.characters[mover.id]!.at = [cell[0], cell[1]];
    else state.entities[mover.id]!.at = [cell[0], cell[1]];
    mover.at = [cell[0], cell[1]];
  };
  for (let i = 1; i < path.length; i++) {
    const cell = path[i]!;
    const r = rulesFor(ctx, mover, passable);
    const cost = r.cost(cell);
    if (allowance !== null && spent + cost > allowance) {
      stopped = "allowance";
      break;
    }
    spent += cost;
    for (const id of passable) {
      const door = state.entities[id]!;
      if (door.at && footprintCells(cell, mover.footprint).some((c) => c[0] === door.at![0] && c[1] === door.at![1])) {
        openDoor(ctx, id, mover.id);
        passable.delete(id);
      }
    }
    setAt(cell);
    if (r.free(cell)) last = i;
    if (i === path.length - 1) break;
    if (exploration) {
      const room = roomAt(loc, cell);
      if (mover.kind === "character" && room !== undefined && room !== startRoom && !loc.rooms[room]!.visited) {
        stopped = "new_room";
        break;
      }
      const now = visibleHostiles(ctx, mover);
      if ([...now].some((h) => !seenAtStart.has(h))) {
        stopped = "hostile_seen";
        break;
      }
    }
  }
  // SPEC_ISSUES.md#stopping-on-occupied-cells: the mover ends on the last free cell reached.
  setAt(path[last]!);
  for (let i = 1; i <= last; i++) markVisited(ctx, mover, path[i]!);
  return { steps: last, stopped, reachedEnd: last === path.length - 1 };
}

function markVisited(ctx: Ctx, mover: Body, cell: Cell): void {
  if (mover.kind !== "character") return;
  const loc = ctx.state.locations[mover.location]!;
  const room = roomAt(loc, cell);
  if (room !== undefined) loc.rooms[room]!.visited = true;
}

/** The movement allowance for the current mode: the whole path in exploration, `speed` in combat. */
export function allowanceFor(ctx: Ctx, mover: Body): number | null {
  if (ctx.state.round.mode === "exploration") return null;
  return rules(() => ctx.system.speed(ctx.combatant(mover.id)));
}

/** Moves the mover to `to` (a room, door, link, or entity), travelling a link it reaches. */
export function moveTo(ctx: Ctx, mover: Body, to: string): void {
  const exploration = ctx.state.round.mode === "exploration";
  const passable = exploration ? passableDoors(ctx, mover.location) : new Set<string>();
  const r = rulesFor(ctx, mover, passable);
  const goals = goalCells(ctx, mover, to, r.free, r.blocksMovement);
  const path = findPath(mover.at, goals, r);
  if (!path) reject("not_reachable", `no path leads to '${to}'`);
  const fromRoom = roomOf(ctx.state, mover.id)?.room ?? null;
  const fromLocation = mover.location;
  const moved = walk(ctx, mover, path, allowanceFor(ctx, mover), exploration);
  const link = ctx.state.locations[fromLocation]!.links[to];
  if (link && moved.reachedEnd && travel(ctx, mover, to)) {
    const where = roomOf(ctx.state, mover.id);
    ctx.emit({ type: "moved", actor: mover.id, location: mover.location, from: fromRoom, to: where?.room ?? null, at: [...mover.at], steps: moved.steps, stopped: "arrived", via: to });
    return;
  }
  const where = roomOf(ctx.state, mover.id);
  ctx.emit({ type: "moved", actor: mover.id, location: mover.location, from: fromRoom, to: where?.room ?? null, at: [...mover.at], steps: moved.steps, stopped: moved.stopped });
}

/** Travels the link the mover stands on to its paired link, or the nearest free cell to it. */
function travel(ctx: Ctx, mover: Body, linkId: string): boolean {
  const state = ctx.state;
  const link = state.locations[mover.location]!.links[linkId]!;
  const door = Object.values(state.entities).find((e) => e.kind === "door" && e.location === mover.location && e.at?.[0] === link.at[0] && e.at?.[1] === link.at[1]);
  if (door && !door.open) return false;
  const dest = state.locations[link.to.location];
  const pair = dest?.links[link.to.link];
  if (!dest || !pair) return false;
  const arriving: Body = { ...mover, location: link.to.location, at: pair.at };
  const r = rulesFor(ctx, arriving, new Set());
  let cell: Cell | undefined = r.free(pair.at) ? pair.at : undefined;
  if (!cell) {
    const all = reachable(pair.at, { ...r, open: (c) => r.open(c) || (c[0] === pair.at[0] && c[1] === pair.at[1]) });
    cell = all.find((x) => r.free(x.cell))?.cell;
  }
  if (!cell) return false;
  if (mover.kind === "character") {
    state.characters[mover.id]!.location = link.to.location;
    state.characters[mover.id]!.at = [cell[0], cell[1]];
  } else {
    state.entities[mover.id]!.location = link.to.location;
    state.entities[mover.id]!.at = [cell[0], cell[1]];
  }
  mover.location = link.to.location;
  mover.at = [cell[0], cell[1]];
  markVisited(ctx, mover, cell);
  return true;
}

/**
 * Moves to the free cell within the allowance farthest from the nearest of `threats`; ties go to the
 * cheaper path, then lowest y, then lowest x. Returns false when no cell is farther than the current one.
 */
export function moveAway(ctx: Ctx, mover: Body, threats: readonly string[]): boolean {
  const exploration = ctx.state.round.mode === "exploration";
  const r = rulesFor(ctx, mover, new Set());
  const allowance = allowanceFor(ctx, mover);
  const placed = threats.map((t) => placement(ctx.state, ctx.c, t)).filter((p): p is NonNullable<typeof p> => p !== undefined && p.location === mover.location);
  if (placed.length === 0) return false;
  const metric = ctx.system.SPATIAL.metric;
  const far = (cell: Cell) =>
    Math.min(...placed.flatMap((t) => footprintCells(t.at, t.footprint).flatMap((tc) => footprintCells(cell, mover.footprint).map((m) => distance(m, tc, metric)))));
  const here = far(mover.at);
  let best: { cell: Cell; cost: number; path: Cell[]; score: number } | undefined;
  for (const o of reachable(mover.at, r, allowance ?? Infinity)) {
    if (o.cost === 0 || !r.free(o.cell)) continue;
    const score = far(o.cell);
    if (score <= here) continue;
    const better =
      !best ||
      score > best.score ||
      (score === best.score && (o.cost < best.cost || (o.cost === best.cost && (o.cell[1] < best.cell[1] || (o.cell[1] === best.cell[1] && o.cell[0] < best.cell[0])))));
    if (better) best = { ...o, score };
  }
  if (!best) return false;
  const fromRoom = roomOf(ctx.state, mover.id)?.room ?? null;
  const moved = walk(ctx, mover, best.path, allowance, exploration);
  ctx.emit({ type: "moved", actor: mover.id, location: mover.location, from: fromRoom, to: roomOf(ctx.state, mover.id)?.room ?? null, at: [...mover.at], steps: moved.steps, stopped: moved.stopped });
  return true;
}

/** Whether `target` is in reach of `actor` for interact, take, give, and use: adjacent or sharing a cell. */
export function inTouch(ctx: Ctx, actor: string, target: string): boolean {
  const a = placement(ctx.state, ctx.c, actor);
  const t = placement(ctx.state, ctx.c, target);
  if (!a || !t || a.location !== t.location) return false;
  const blocks = moverTests(ctx.state, ctx.c, ctx.body(actor) ?? { id: actor, kind: "character", side: "characters", ...a }).blocksMovement;
  return footprintsOverlap(a.at, a.footprint, t.at, t.footprint) || footprintsAdjacent(a.at, a.footprint, t.at, t.footprint, ctx.system.SPATIAL.metric, blocks);
}

/** Attack reach: within `range` and visible; range 1 requires adjacency; null is any visible target. */
export function inAttackReach(ctx: Ctx, attacker: Body, target: string, range: number | null): boolean {
  const perception = new Perception(ctx.state, ctx.c);
  if (!perception.visible(attacker, target)) return false;
  if (range === null) return true;
  const t = placement(ctx.state, ctx.c, target)!;
  const metric = ctx.system.SPATIAL.metric;
  if (range === 1) {
    const blocks = moverTests(ctx.state, ctx.c, attacker).blocksMovement;
    return footprintsAdjacent(attacker.at, attacker.footprint, t.at, t.footprint, metric, blocks);
  }
  const d = Math.min(...footprintCells(attacker.at, attacker.footprint).flatMap((a) => footprintCells(t.at, t.footprint).map((b) => distance(a, b, metric))));
  return d <= range;
}

/**
 * Approach (engine.md, "Reach"): moves the actor toward the nearest cell from which `inReach` holds,
 * under the movement rules for the mode. Returns whether the target is then in reach.
 */
export function approach(ctx: Ctx, actor: Body, target: string, inReach: (at: Cell) => boolean): boolean {
  const exploration = ctx.state.round.mode === "exploration";
  const passable = exploration ? passableDoors(ctx, actor.location) : new Set<string>();
  const r = rulesFor(ctx, actor, passable);
  const loc = ctx.state.locations[actor.location]!;
  const goals: Cell[] = [];
  for (let y = 0; y < loc.rows.length; y++) {
    for (let x = 0; x < (loc.rows[0]?.length ?? 0); x++) {
      const cell: Cell = [x, y];
      if (footprintCells(cell, actor.footprint).every(r.free) && inReach(cell)) goals.push(cell);
    }
  }
  const path = findPath(actor.at, goals, r);
  if (!path) return false;
  const fromRoom = roomOf(ctx.state, actor.id)?.room ?? null;
  const moved = walk(ctx, actor, path, allowanceFor(ctx, actor), exploration);
  ctx.emit({ type: "moved", actor: actor.id, location: actor.location, from: fromRoom, to: roomOf(ctx.state, actor.id)?.room ?? null, at: [...actor.at], steps: moved.steps, stopped: moved.stopped });
  return inReach(actor.at);
}

/** Whether a cell sees any cell of the target's footprint, for a viewer on the actor's side. */
export function cellSees(ctx: Ctx, actor: Body, cell: Cell, target: string): boolean {
  const t = placement(ctx.state, ctx.c, target);
  if (!t) return false;
  const sight = blocksSight(ctx.state, ctx.c, actor.location, actor.side);
  return footprintCells(cell, actor.footprint).some((a) => footprintCells(t.at, t.footprint).some((b) => sightLine(a, b, sight) !== null));
}

export { adjacent, key, cellsOf };
