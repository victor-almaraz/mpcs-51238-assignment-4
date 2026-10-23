// Entity turns (engine.md, "Entity turns"): actions chosen from `behavior`, without a model.

import { findPath } from "../grid";
import { rules, type Ctx } from "./ctx";
import { attack } from "./actions";
import { goalCells, inAttackReach, moveAway, rulesFor, walk, allowanceFor } from "./movement";
import { roomOf } from "./requirements";
import { situation } from "./situation";
import { bodiesIn, type Body } from "./world";

/** Characters an entity may attack: in its location and not dead. */
function targetsOf(ctx: Ctx, body: Body): string[] {
  return bodiesIn(ctx.state, ctx.c, body.location)
    .filter((b) => b.kind === "character" && ctx.state.characters[b.id]!.sheet.status !== "dead")
    .map((b) => b.id);
}

function inReach(ctx: Ctx, body: Body): string[] {
  const { range } = rules(() => ctx.system.reach(ctx.combatant(body.id), null));
  return targetsOf(ctx, body).filter((id) => inAttackReach(ctx, body, id, range));
}

function strike(ctx: Ctx, body: Body, target: string): void {
  const { tag } = rules(() => ctx.system.reach(ctx.combatant(body.id), null));
  ctx.apply(rules(() => ctx.system.attack(ctx.combatant(body.id), ctx.combatant(target), null, situation(ctx, body.id, target, [tag]), ctx.rng)), body.id, target);
}

function wait(ctx: Ctx, id: string): void {
  ctx.emit({ type: "waited", actor: id });
}

/** Moves toward the character with the cheapest path, ties by ascending id. */
function advanceOn(ctx: Ctx, body: Body): boolean {
  const r = rulesFor(ctx, body, new Set());
  let best: { cost: number; path: ReturnType<typeof findPath> & object; id: string } | undefined;
  for (const id of targetsOf(ctx, body)) {
    const path = findPath(body.at, goalCells(ctx, body, id, r.free, r.blocksMovement), r);
    if (!path || path.length < 2) continue;
    const cost = path.slice(1).reduce((s, cell) => s + r.cost(cell), 0);
    if (!best || cost < best.cost) best = { cost, path, id };
  }
  if (!best) return false;
  const from = roomOf(ctx.state, body.id)?.room ?? null;
  const moved = walk(ctx, body, best.path, allowanceFor(ctx, body), false);
  ctx.emit({ type: "moved", actor: body.id, location: body.location, from, to: roomOf(ctx.state, body.id)?.room ?? null, at: [...body.at], steps: moved.steps, stopped: moved.stopped });
  return true;
}

/** Resolves one entity's turn at its resolution point. */
export function entityTurn(ctx: Ctx, id: string): void {
  const e = ctx.state.entities[id];
  const body = ctx.body(id);
  if (!e || !body) return;
  const behavior = e.behavior ?? "passive";
  if (behavior === "passive") return wait(ctx, id);
  if (behavior === "fleeing") {
    if (!moveAway(ctx, body, targetsOf(ctx, body))) wait(ctx, id);
    return;
  }
  const reachable = inReach(ctx, body);
  if (reachable.length > 0) return strike(ctx, body, ctx.rng.pick(reachable));
  if (behavior === "defensive") return wait(ctx, id);
  if (!advanceOn(ctx, body)) return wait(ctx, id);
  if (ctx.system.SPATIAL.approach) {
    const now = inReach(ctx, body);
    if (now.length > 0) strike(ctx, body, ctx.rng.pick(now));
  }
}

export { attack };
