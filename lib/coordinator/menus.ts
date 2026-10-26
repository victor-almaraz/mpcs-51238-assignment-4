// Action menus (tools.md, improvise: at an improvise streak of 4 or more, and at every round and turn
// start in action-menu mode, the owner receives valid tool calls as selectable options).

import { labelsFor, submit, toolsFor, view, type Bundles, type GameEvent, type State } from "../engine";
import { userTopic } from "../broadcast";
import { describeCall } from "../narrator/template";
import { Rng } from "../rng";
import { capitalize } from "../text";
import { send, type Deps } from "./instance";

type Call = { tool: string; args: Record<string, unknown> };

/** Whether the engine would accept `call` now; the trial result is discarded. */
export function valid(state: State, bundles: Bundles, actor: string, call: Call): boolean {
  return submit(state, bundles, actor, call, new Rng(0n, state.rng_counter)).ok;
}

/** Up to `max` valid tool calls for the actor, each with a label. */
export function menuOptions(state: State, bundles: Bundles, actor: string, max = 6): { label: string; tool: string; args: Record<string, unknown> }[] {
  if (!state.characters[actor]) return [];
  const v = view(state, bundles, actor);
  const { tools } = toolsFor(state, bundles, actor);
  const candidates: Call[] = [
    ...(v.pending_choice?.options.map((o) => ({ tool: "choose", args: { option_id: o.id } })) ?? []),
    ...v.visible.filter((e) => e.in_reach).flatMap((e) => (e.verbs ?? []).map((verb) => ({ tool: "interact", args: { target_id: e.id, verb } }))),
    ...v.visible.filter((e) => e.in_reach && e.kind === "item").map((e) => ({ tool: "take", args: { entity_id: e.id } })),
    ...v.visible.filter((e) => e.kind === "creature").map((e) => ({ tool: "attack", args: { target_id: e.id } })),
    ...v.actions.npcs.map((n) => ({ tool: "talk", args: { npc_id: n.id, utterance: "Hello." } })),
    ...v.destinations.map((d) => ({ tool: "move", args: { to_id: d.id } })),
    ...v.visible.map((e) => ({ tool: "examine", args: { target_id: e.id } })),
    { tool: "search", args: {} },
    { tool: "wait", args: {} },
  ];
  const labels = labelsFor([state], bundles);
  const out: { label: string; tool: string; args: Record<string, unknown> }[] = [];
  for (const c of candidates) {
    if (out.length >= max) break;
    if (!tools.includes(c.tool) || !valid(state, bundles, actor, c)) continue;
    const label = describeCall(c, labels);
    out.push({ label: capitalize(label), ...c });
  }
  return out;
}

export async function sendActionMenus(deps: Deps, instanceId: string, version: number, bundles: Bundles, state: State, events: readonly GameEvent[], actor: string | undefined): Promise<void> {
  if (state.ended) return;
  const targets = new Set<string>();
  if (actor && events.some((e) => e.type === "improvised") && (state.improvise_streak[actor] ?? 0) >= 4) targets.add(actor);
  if (deps.actionMenuMode && events.some((e) => e.type === "round_started" || e.type === "turn_started")) {
    for (const id of state.round.participants) if (state.characters[id]) targets.add(id);
  }
  for (const id of targets) {
    const owner = state.characters[id]?.user_id;
    if (!owner) continue;
    await send(deps, userTopic(owner), [{ type: "action_menu", instance_id: instanceId, version, character_id: id, options: menuOptions(state, bundles, id) }]);
  }
}
