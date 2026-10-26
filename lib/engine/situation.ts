// The situation passed to rolling system calls (engine.md, "Situation" and "Cover").

import { sightLine } from "../grid";
import type { Situation } from "../systems";
import type { Ctx } from "./ctx";
import { Perception, blocksSight, cellsOf, placement, key } from "./world";

/** Builds the situation for `actor`, aimed at `target` when there is one, with extra tags. */
export function situation(ctx: Ctx, actor: string, target: string | null, tags: readonly string[]): Situation {
  const conditions = ctx.state.characters[actor]?.conditions ?? ctx.state.entities[actor]?.conditions ?? [];
  let advantage = 0;
  let modifier = 0;
  for (const k of conditions) {
    const def = ctx.c.condition(k.id);
    advantage += def?.situation?.advantage ?? 0;
    modifier += def?.situation?.modifier ?? 0;
  }
  const out = new Set(tags);
  if (target !== null) {
    if (hasCover(ctx, actor, target)) out.add("cover");
    const p = placement(ctx.state, ctx.c, target);
    if (p) {
      const level = new Perception(ctx.state, ctx.c).level(p.location, p.at);
      if (level !== "bright") out.add(level);
    }
  }
  return { advantage: Math.max(-1, Math.min(1, advantage)), modifier, tags: [...out] };
}

/** A target has cover when a cover entity occupies a cell strictly between the endpoints of the sight line. */
function hasCover(ctx: Ctx, attacker: string, target: string): boolean {
  const a = placement(ctx.state, ctx.c, attacker);
  const t = placement(ctx.state, ctx.c, target);
  if (!a || !t || a.location !== t.location) return false;
  const coverCells = new Set<number>();
  for (const [id, e] of Object.entries(ctx.state.entities)) {
    if (e.location !== a.location || e.at === undefined || id === target || id === attacker) continue;
    if (e.kind !== "obstacle" && e.kind !== "container" && e.kind !== "fixture") continue;
    if ((ctx.c.template(e.ref) as { cover?: boolean }).cover) for (const cell of cellsOf(ctx.c, e)) coverCells.add(key(cell));
  }
  if (coverCells.size === 0) return false;
  const side = ctx.state.characters[attacker] ? "characters" : "entities";
  const line = sightLine(a.at, t.at, blocksSight(ctx.state, ctx.c, a.location, side));
  return line !== null && line.slice(1, -1).some((cell) => coverCells.has(key(cell)));
}
