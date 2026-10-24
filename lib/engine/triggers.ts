// Adventure triggers (adventure-packs.md, "Triggers" and "Evaluation order").

import type { Ctx } from "./ctx";
import { applyEffects } from "./effects";
import { holds } from "./requirements";
import type { GameEvent } from "./types";

/** Events whose payload names an actor (engine.md, "Events"). */
export function actorOf(event: GameEvent): string | undefined {
  return typeof event.actor === "string" ? event.actor : undefined;
}

const PASSES = 3;

/** Whether an event matches a trigger's `on`: its type, and every other key by equality. */
export function matches(on: Record<string, unknown>, event: GameEvent): boolean {
  for (const [key, value] of Object.entries(on)) if (event[key] !== value) return false;
  return true;
}

const cursors = new WeakMap<Ctx, number>();

/**
 * Tests every trigger against the events produced since the last evaluation, in event order; within
 * one event, arcs in file order and triggers in listed order. Events from fired triggers are tested in
 * a following pass, up to three passes; events of the third pass are committed but not tested.
 */
export function evaluateTriggers(ctx: Ctx): void {
  const arcs = ctx.c.adventure.arcs;
  let from = cursors.get(ctx) ?? 0;
  for (let pass = 0; pass < PASSES; pass++) {
    const to = ctx.events.length;
    if (from >= to) break;
    for (let i = from; i < to; i++) {
      const event = ctx.events[i]!;
      for (const arc of arcs) {
        for (const trigger of arc.triggers) {
          // SPEC_ISSUES.md#triggers-after-ending: an ending stops evaluation of this event and later passes.
          if (ctx.state.ended) {
            cursors.set(ctx, ctx.events.length);
            return;
          }
          if (trigger.once && ctx.state.fired_triggers.includes(trigger.id)) continue;
          if (!matches(trigger.on, event)) continue;
          const actor = actorOf(event);
          if (!holds(ctx, trigger.when, actor)) continue;
          if (!ctx.state.fired_triggers.includes(trigger.id)) ctx.state.fired_triggers.push(trigger.id);
          ctx.emit({ type: "trigger_fired", trigger: trigger.id });
          if (trigger.narrate) ctx.facts.push(trigger.narrate);
          applyEffects(ctx, trigger.effects as never, { actor, location: actor !== undefined ? ctx.locationOf(actor) : undefined });
          for (const choice of ctx.deferredChoices.splice(0)) if (choice) ctx.offerChoice(choice);
        }
      }
    }
    from = to;
  }
  cursors.set(ctx, ctx.events.length);
}
