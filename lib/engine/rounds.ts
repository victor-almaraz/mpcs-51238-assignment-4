// Rounds (engine.md, "Modes", "Rounds", "Resolution methods", "Ordering policy", "Pending choices").

import { Rng } from "../rng";
import type { SortKey } from "../systems";
import { checkActor, resolve } from "./actions";
import { Ctx, Reject, rules } from "./ctx";
import { applyEffects, removeCondition } from "./effects";
import { entityTurn } from "./entities";
import { isHostile } from "./movement";
import { roomOf } from "./requirements";
import { evaluateTriggers } from "./triggers";
import type { Declaration, State, ToolCall } from "./types";
import { Perception, updateSeen } from "./world";

/** Restores `state` in place to `snapshot`. */
function restore(state: State, snapshot: State): void {
  for (const key of Object.keys(state) as (keyof State)[]) delete state[key];
  Object.assign(state, snapshot);
}

/**
 * Resolves one action transactionally: on a rejection the state is restored and the rejection
 * returned; draws already taken stay taken.
 */
export function attempt(ctx: Ctx, fn: () => void): Reject | null {
  const snapshot = structuredClone(ctx.state);
  const events = ctx.events.length;
  const facts = ctx.facts.length;
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof Reject)) throw e;
    restore(ctx.state, snapshot);
    ctx.events.length = events;
    ctx.facts.length = facts;
    return e;
  }
}

/** Validates a declaration by resolving it on a scratch copy of state with a scratch Rng. */
export function dryRun(ctx: Ctx, actor: string, call: ToolCall): void {
  const scratch = new Ctx(structuredClone(ctx.state), ctx.c, new Rng(ctx.rng.seed, ctx.rng.counter), ctx.runEffects);
  checkActor(scratch, actor, call);
  resolve(scratch, actor, call);
}

/** After each resolved action: triggers, seen cells, combat end, and the automatic ending. */
export function afterAction(ctx: Ctx): void {
  evaluateTriggers(ctx);
  updateSeen(ctx.state, ctx.c);
  checkCombatEnd(ctx);
  checkLost(ctx);
}

/** The instance ends with `lost` when no character is active, if declared; otherwise with no ending. */
function checkLost(ctx: Ctx): void {
  if (ctx.state.ended) return;
  if (Object.values(ctx.state.characters).some((ch) => ch.sheet.status === "active")) return;
  const ending = "lost" in ctx.c.adventure.manifest.endings ? "lost" : null;
  ctx.state.ended = { ending };
  ctx.emit({ type: "instance_ended", ending });
}

/** Combat ends when no combatant entity can act, or no character is in the combat area or visible to a combatant. */
export function checkCombatEnd(ctx: Ctx): void {
  const state = ctx.state;
  if (state.mode !== "combat" || state.ended) return;
  const acting = state.combatants.filter((id) => state.entities[id] && ctx.isActive(id));
  const perception = new Perception(state, ctx.c);
  const charactersInArea = Object.keys(state.characters).filter((id) => {
    const room = roomOf(state, id)?.room;
    return room !== undefined && state.combat_area.includes(room);
  });
  const seen = acting.some((e) => {
    const body = ctx.body(e);
    return body !== undefined && Object.keys(state.characters).some((ch) => perception.visible(body, ch));
  });
  const participantsRecruitable = state.combatants.length === 0 && hostilesInArea(ctx).length > 0;
  if (participantsRecruitable) return;
  if (acting.length === 0 || (charactersInArea.length === 0 && !seen)) {
    const room = state.combat_area[0] ?? null;
    state.mode = "exploration";
    state.combat_area = [];
    state.combatants = [];
    ctx.emit({ type: "combat_ended", room });
  }
}

function hostilesInArea(ctx: Ctx): string[] {
  const state = ctx.state;
  return Object.keys(state.entities)
    .filter((id) => isHostile(ctx, id) && ctx.isActive(id))
    .filter((id) => {
      const room = roomOf(state, id)?.room;
      return room !== undefined && state.combat_area.includes(room);
    });
}

/** Hostile active entities join as combatants at round start when in the combat area or seeing a character in it. */
function recruitCombatants(ctx: Ctx): void {
  const state = ctx.state;
  const perception = new Perception(state, ctx.c);
  const inArea = (id: string) => {
    const room = roomOf(state, id)?.room;
    return room !== undefined && state.combat_area.includes(room);
  };
  const charactersInArea = Object.keys(state.characters).filter(inArea);
  for (const id of Object.keys(state.entities).sort()) {
    if (state.combatants.includes(id) || !isHostile(ctx, id) || !ctx.isActive(id)) continue;
    const body = ctx.body(id);
    if (!body) continue;
    if (inArea(id) || charactersInArea.some((ch) => perception.visible(body, ch))) state.combatants.push(id);
  }
}

/** Starts the next round: mode, participants, initiative, and `round_started`. */
export function startRound(ctx: Ctx): void {
  const state = ctx.state;
  if (state.ended) return;
  const mode = state.mode;
  if (mode === "combat") recruitCombatants(ctx);
  const policy = ctx.system.ORDERING[mode];
  const characters = Object.keys(state.characters).filter((id) => state.characters[id]!.sheet.status === "active").sort();
  const entities = mode === "combat" ? state.combatants.filter((id) => ctx.isActive(id)).sort() : [];
  const participants = [...characters, ...entities];
  const usesInitiative = policy.order.some((k) => k.key === "initiative");
  let initiative = state.round.initiative;
  const reroll = policy.reroll === "per_round" || initiative === null || (policy.reroll === "per_combat" && state.round.mode !== mode);
  if (usesInitiative && reroll) {
    initiative = rules(() => ctx.system.initiative(participants.map((id) => ctx.combatant(id)), ctx.rng));
  }
  state.round = {
    number: state.round.number + 1,
    mode,
    resolution: policy.resolution,
    participants,
    declarations: {},
    initiative: usesInitiative ? initiative : null,
    order: null,
    turn_index: null,
  };
  if (policy.resolution === "sequential") {
    state.round.order = orderOf(ctx, participants, {});
    state.round.turn_index = 0;
    ctx.emit({ type: "round_started", number: state.round.number, mode, resolution: "sequential", order: [...state.round.order] });
    beginTurns(ctx);
  } else {
    ctx.emit({ type: "round_started", number: state.round.number, mode, resolution: "simultaneous" });
  }
}

/** Resolution order from the ordering policy, with ascending participant id as the final key. */
export function orderOf(ctx: Ctx, participants: readonly string[], declarations: Record<string, Declaration>): string[] {
  const state = ctx.state;
  const keys: readonly SortKey[] = ctx.system.ORDERING[state.round.mode].order;
  const rank = (id: string, k: SortKey): number => {
    switch (k.key) {
      case "side":
        return (state.characters[id] ? "characters" : "entities") === k.first ? 0 : 1;
      case "initiative": {
        const i = state.round.initiative?.indexOf(id) ?? -1;
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
      }
      case "tool_priority": {
        const tool = declarations[id]?.tool ?? "wait";
        const i = k.tools.indexOf(tool);
        // SPEC_ISSUES.md#quest-tool-priority: tools missing from the list sort after every listed tool.
        return i < 0 ? k.tools.length : i;
      }
    }
  };
  return [...participants].sort((a, b) => {
    for (const k of keys) {
      const d = rank(a, k) - rank(b, k);
      if (d !== 0) return d;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Conditions' `on_turn_start` effects, applied when the bearer's action resolves, before the action. */
export function turnStart(ctx: Ctx, id: string): void {
  const holder = ctx.state.characters[id] ?? ctx.state.entities[id];
  if (!holder) return;
  for (const k of [...holder.conditions]) {
    const effects = ctx.c.condition(k.id)?.on_turn_start;
    if (effects && effects.length > 0) applyEffects(ctx, effects, { actor: id });
  }
}

/** Resolves one participant's action at its resolution point; a failed validation voids it. */
function actFor(ctx: Ctx, id: string, call: ToolCall | undefined): void {
  if (ctx.state.ended || !ctx.isActive(id)) return;
  turnStart(ctx, id);
  if (ctx.state.ended || !ctx.isActive(id)) return;
  if (!ctx.state.characters[id]) {
    entityTurn(ctx, id);
    afterAction(ctx);
    return;
  }
  const action = call ?? { tool: "wait", args: {} };
  const failed = attempt(ctx, () => {
    checkActor(ctx, id, action);
    resolve(ctx, id, action);
  });
  if (failed) ctx.emit({ type: "action_voided", actor: id, tool: action.tool, reason: failed.code });
  afterAction(ctx);
}

export function inCombatArea(ctx: Ctx, id: string): boolean {
  const room = roomOf(ctx.state, id)?.room;
  return room !== undefined && ctx.state.combat_area.includes(room);
}

/** Closes a simultaneous round: computes the order and resolves every action. */
export function closeRound(ctx: Ctx): void {
  const round = ctx.state.round;
  const order = orderOf(ctx, round.participants, round.declarations);
  round.order = order;
  round.turn_index = 0;
  for (const id of order) {
    actFor(ctx, id, round.declarations[id]);
    round.turn_index += 1;
    if (ctx.state.ended) return;
  }
  finishRoundIfReady(ctx);
}

/** Ends the round once every action has resolved and no choice is pending, then starts the next. */
export function finishRoundIfReady(ctx: Ctx): void {
  const round = ctx.state.round;
  if (ctx.state.ended || round.order === null || round.turn_index === null || round.turn_index < round.order.length) return;
  if (Object.keys(ctx.state.pending_choices).length > 0) return;
  endRound(ctx);
  evaluateTriggers(ctx);
  checkLost(ctx);
  startRound(ctx);
  evaluateTriggers(ctx);
}

/** Round end: `tick`, condition durations, the clock, and `round_ended`. */
function endRound(ctx: Ctx): void {
  const state = ctx.state;
  for (const id of state.round.participants) {
    if (!ctx.sheet(id)) continue;
    ctx.apply(rules(() => ctx.system.tick(ctx.combatant(id))), id);
  }
  for (const id of state.round.participants) {
    const holder = state.characters[id] ?? state.entities[id];
    if (!holder) continue;
    for (const k of [...holder.conditions]) {
      if (k.remaining === null) continue;
      k.remaining -= 1;
      if (k.remaining <= 0) removeCondition(ctx, id, k.id);
    }
  }
  state.clock.turn += 1;
  ctx.emit({ type: "clock_tick", turn: state.clock.turn });
  ctx.emit({ type: "round_ended", number: state.round.number });
}

// ---------------------------------------------------------------------------------------------
// Sequential resolution

/** The participant whose turn it is under sequential resolution. */
export function currentParticipant(state: State): string | undefined {
  const r = state.round;
  return r.resolution === "sequential" && r.order && r.turn_index !== null ? r.order[r.turn_index] : undefined;
}

/** Emits `turn_started` and resolves entity turns and skipped participants until a character must act. */
export function beginTurns(ctx: Ctx): void {
  const round = ctx.state.round;
  while (!ctx.state.ended && round.order && round.turn_index !== null && round.turn_index < round.order.length) {
    const id = round.order[round.turn_index]!;
    if (!ctx.isActive(id)) {
      round.turn_index += 1;
      continue;
    }
    ctx.emit({ type: "turn_started", participant: id, number: round.number });
    if (ctx.state.characters[id]) return;
    actFor(ctx, id, undefined);
    round.turn_index += 1;
  }
  finishRoundIfReady(ctx);
}

/** Resolves the current character's sequential turn, then the following entity turns. */
export function takeTurn(ctx: Ctx, id: string, call: ToolCall | undefined): void {
  actFor(ctx, id, call);
  ctx.state.round.turn_index! += 1;
  beginTurns(ctx);
}

export { attempt as transact };
