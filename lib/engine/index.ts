// The engine (architecture.md, "Engine interface"): submit and advance. Pure: no I/O, no clock;
// randomness only from the Rng argument. Each call returns a complete result or an error.

import type { Rng } from "../rng";
import { FREE_TOOLS, checkActor, resolve, validateCall } from "./actions";
import { content } from "./content";
import { Ctx, Reject, reject } from "./ctx";
import { applyEffects } from "./effects";
import { afterAction, beginTurns, closeRound, currentParticipant, dryRun, finishRoundIfReady, takeTurn, turnStart } from "./rounds";
import type { Bundles, Result, State, ToolCall } from "./types";

export * from "./types";
export { startInstance, type StartInput } from "./start";
export { view, type View } from "./view";

function run(state: State, bundles: Bundles, rng: Rng, body: (ctx: Ctx) => void): Result {
  const ctx = new Ctx(structuredClone(state), content(bundles), rng, applyEffects);
  try {
    if (ctx.state.ended) reject("instance_not_active", "the instance has ended");
    body(ctx);
    ctx.state.rng_counter = rng.counter;
    return { ok: true, events: ctx.events, state: ctx.state };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, error: e.error };
    throw e;
  }
}

/** Handles one character action: resolves it, stores it as a declaration, or rejects it. */
export function submit(state: State, bundles: Bundles, actor: string, call: unknown, rng: Rng): Result {
  return run(state, bundles, rng, (ctx) => {
    validateCall(call);
    const tool = (call as ToolCall).tool;
    checkActor(ctx, actor, call);
    const s = ctx.state;
    if (tool !== "improvise") s.improvise_streak[actor] = 0;
    if (FREE_TOOLS.has(tool)) {
      resolve(ctx, actor, call);
      afterAction(ctx);
      if (tool === "choose") {
        if (s.round.resolution === "simultaneous") closeIfComplete(ctx);
        finishRoundIfReady(ctx);
      }
      return;
    }
    if (s.round.resolution === "sequential") {
      if (currentParticipant(s) !== actor) reject("not_your_turn", "it is not this character's turn");
      // A rejection here rejects the submission; the turn is not consumed.
      resolveTurn(ctx, actor, call);
      return;
    }
    if (!s.round.participants.includes(actor)) reject("requirement_unmet", "the character does not take part in this round");
    dryRun(ctx, actor, call);
    s.round.declarations[actor] = { tool: call.tool, args: structuredClone(call.args) };
    ctx.emit({ type: "action_declared", actor });
    closeIfComplete(ctx);
  });
}

/** Ends the current wait: skips the sequential participant, or closes the simultaneous round. */
export function advance(state: State, bundles: Bundles, rng: Rng): Result {
  return run(state, bundles, rng, (ctx) => {
    const s = ctx.state;
    // Pending choices resolve with their first option when a timeout expires.
    for (const actor of Object.keys(s.pending_choices).sort()) {
      const first = s.pending_choices[actor]!.options[0];
      if (first) resolve(ctx, actor, { tool: "choose", args: { option_id: first.id } });
    }
    if (s.round.resolution === "sequential") {
      const current = currentParticipant(s);
      if (current !== undefined) takeTurn(ctx, current, undefined);
      else finishRoundIfReady(ctx);
      return;
    }
    if (s.round.order === null) closeRound(ctx);
    else finishRoundIfReady(ctx);
  });
}

/** A simultaneous round closes when every character has declared and no choice is pending. */
function closeIfComplete(ctx: Ctx): void {
  const r = ctx.state.round;
  if (r.order !== null) return;
  if (Object.keys(ctx.state.pending_choices).length > 0) return;
  const characters = r.participants.filter((id) => ctx.state.characters[id]);
  if (characters.every((id) => r.declarations[id] !== undefined)) closeRound(ctx);
}

/** Resolves the current character's sequential turn, then the entity turns that follow it. */
function resolveTurn(ctx: Ctx, actor: string, call: ToolCall): void {
  turnStart(ctx, actor);
  checkActor(ctx, actor, call);
  resolve(ctx, actor, call);
  afterAction(ctx);
  ctx.state.round.turn_index! += 1;
  beginTurns(ctx);
}
