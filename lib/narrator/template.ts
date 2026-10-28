// Template narration (architecture.md, Action pipeline: on narrator failure, template text generated
// from the event types; app-flow.md, Play interface: template narration is styled like model narration).
// It narrates only shared events, so it says nothing a member could not see.

import type { GameEvent } from "../engine";
import { capitalize } from "../text";

export interface Labels {
  /** A character, entity, or item. */
  entity(id: string): string;
  room(id: string): string;
  ability(ref: string): string;
  ending(id: string): string;
}

/** A tool call in words, for suggestions and action menus: "move to the hangar". */
export function describeCall(call: { tool: string; args: Record<string, unknown> }, l: Labels): string {
  const a = call.args;
  const n = (field: string) => (typeof a[field] === "string" ? l.entity(a[field] as string) : "");
  switch (call.tool) {
    case "move":
      return typeof a.to_id === "string" ? `move to ${l.room(a.to_id) !== a.to_id ? l.room(a.to_id) : n("to_id")}` : `move away from ${n("away_from_id")}`;
    case "attack":
      return `attack ${n("target_id")}`;
    case "ability":
      return `use ${l.ability(String(a.ability_id))}${typeof a.target_id === "string" ? ` on ${n("target_id")}` : ""}`;
    case "use":
      return `use ${n("item_id")}${typeof a.target_id === "string" ? ` on ${n("target_id")}` : ""}`;
    case "interact":
      return `${String(a.verb)} ${n("target_id")}`;
    case "examine":
      return typeof a.target_id === "string" ? `examine ${n("target_id")}` : "look around";
    case "take":
      return `take ${n("entity_id")}`;
    case "drop":
      return `drop ${n("item_id")}`;
    case "give":
      return `give ${n("item_id")} to ${n("target_id")}`;
    case "talk":
      return `talk to ${n("npc_id")}`;
    case "rest":
      return a.kind === "long" ? "take a long rest" : "take a short rest";
    case "choose":
      return `choose ${String(a.option_id)}`;
    default:
      return call.tool;
  }
}

const third = (verb: string) => (/(s|sh|ch|x|z)$/.test(verb) ? `${verb}es` : `${verb}s`);

type P = Record<string, unknown>;

/** One sentence per narratable event; bookkeeping events have none. */
function line(e: GameEvent, l: Labels): string | null {
  const p = e as unknown as P;
  const n = (field: string) => l.entity(p[field] as string);
  const on = (field: string) => (typeof p[field] === "string" ? ` on ${n(field)}` : "");
  switch (e.type) {
    case "moved":
      return p.from === p.to ? `${n("actor")} moves.` : `${n("actor")} moves to ${l.room(p.to as string)}.`;
    case "item_taken":
      return `${n("actor")} takes ${n("item")}.`;
    case "item_dropped":
      return `${n("actor")} drops ${n("item")}.`;
    case "item_given":
      return `${n("actor")} gives ${n("item")} to ${n("to")}.`;
    case "item_used":
      return `${n("actor")} uses ${n("item")}${on("target")}.`;
    case "ability_used":
      return `${n("actor")} uses ${l.ability(p.ability as string)}${on("target")}.`;
    case "interacted":
      return `${n("actor")} ${third(p.verb as string)} ${n("target")}.`;
    case "examined":
      return `${n("actor")} examines ${typeof p.target === "string" ? n("target") : "the surroundings"}.`;
    case "searched":
      return p.success && Array.isArray(p.revealed) && p.revealed.length > 0 ? `${n("actor")} searches and finds ${(p.revealed as string[]).map((id) => l.entity(id)).join(", ")}.` : `${n("actor")} searches and finds nothing.`;
    case "talked":
      return `${n("actor")} speaks with ${n("npc")}.`;
    case "waited":
      return `${n("actor")} waits.`;
    case "improvised": {
      const ideas = Array.isArray(p.suggestions) ? (p.suggestions as { tool: string; args: Record<string, unknown> }[]).map((c) => describeCall(c, l)) : [];
      return ideas.length > 0 ? `${n("actor")} hesitates. Perhaps ${ideas.join(", or ")}.` : `${n("actor")} hesitates.`;
    }
    case "altered":
      return `${n("actor")} makes it so: ${String(p.intent).replace(/[.!?]+$/, "")}.`;
    case "action_voided":
      return `${n("actor")}'s action comes to nothing.`;
    case "attacked":
      return `${n("actor")} attacks ${n("target")}.`;
    case "damaged":
      return `${n("target")} takes ${p.amount} damage.`;
    case "healed":
      return `${n("target")} recovers ${p.amount}.`;
    case "died":
      return `${n("target")} falls.`;
    case "condition_applied":
      return `${n("target")} is ${String(p.condition).replace(/_/g, " ")}.`;
    case "condition_removed":
      return `${n("target")} is no longer ${String(p.condition).replace(/_/g, " ")}.`;
    case "door_opened":
      return `${n("door")} opens.`;
    case "door_closed":
      return `${n("door")} closes.`;
    case "destroyed":
      return `${n("target")} is destroyed.`;
    case "light_changed":
      return p.lit ? `${n("target")} lights up.` : `${n("target")} goes dark.`;
    case "entity_spawned":
      return `${n("entity")} appears.`;
    case "entity_despawned":
      return `${n("entity")} is gone.`;
    case "revealed":
      return typeof p.target === "string" ? `${n("target")} is revealed.` : null;
    case "combat_started":
      return "Combat breaks out.";
    case "combat_ended":
      return "The fighting ends.";
    case "instance_ended":
      return p.ending ? `The adventure ends: ${l.ending(p.ending as string)}.` : "The adventure ends.";
    default:
      return null;
  }
}

/** Template narration for a commit's shared events, or null when nothing was resolved. */
export function templateNarration(events: readonly GameEvent[], labels: Labels): string | null {
  const lines = events.map((e) => line(e, labels)).filter((s): s is string => s !== null);
  return lines.length === 0 ? null : lines.map(capitalize).join(" ");
}
