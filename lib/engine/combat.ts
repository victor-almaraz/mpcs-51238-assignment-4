// Combat start (engine.md, "Modes"): an attack on a creature or the effect start_combat.

import type { Ctx } from "./ctx";
import { roomOf } from "./requirements";

/** Enters combat in the actor's room. The round in progress completes under its mode; the next starts in combat. */
export function startCombat(ctx: Ctx, actor: string | undefined): void {
  const state = ctx.state;
  if (actor === undefined) return;
  const room = roomOf(state, actor)?.room;
  if (room === undefined) return;
  if (state.mode === "combat") {
    if (!state.combat_area.includes(room)) state.combat_area.push(room);
    return;
  }
  state.mode = "combat";
  state.combat_area = [room];
  state.combatants = [];
  ctx.emit({ type: "combat_started", room });
}
