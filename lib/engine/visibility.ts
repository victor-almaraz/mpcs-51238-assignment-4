// The events of a commit that every member may see (app-flow.md, Real-time channels: the `commit`
// message on the instance channel contains the events visible to every member).
// The rules are api.md, Messages, Event visibility.

import { content } from "./content";
import type { Bundles, GameEvent, State } from "./types";
import { Perception, bodyOf } from "./world";

/** Events that change only hidden bookkeeping, never shown to players. */
const INTERNAL = new Set(["flag_set", "stage_set", "trigger_fired"]);

/** Payload fields that name an entity, character, or item. */
const NAMES = ["actor", "target", "entity", "item", "door", "npc", "to", "participant"];

function partyCanSee(state: State, bundles: Bundles): (id: string) => boolean {
  const c = content(bundles);
  const perception = new Perception(state, c);
  const viewers = Object.keys(state.characters).map((id) => bodyOf(state, c, id)!);
  return (id) => {
    if (state.characters[id]) return true;
    const e = state.entities[id];
    if (!e) return false;
    // Items held by a character, or by a container the party sees, are seen with their holder.
    if (e.carrier) return state.characters[e.carrier] !== undefined || viewers.some((v) => perception.visible(v, e.carrier!));
    return viewers.some((v) => perception.visible(v, id));
  };
}

/**
 * Keeps an event when every entity it names was visible to some character before or after the commit.
 * Hidden bookkeeping events and secrets are dropped; rooms are named only once the party has seen them.
 */
export function sharedEvents(before: State | null, after: State, bundles: Bundles, events: readonly GameEvent[]): GameEvent[] {
  const seenAfter = partyCanSee(after, bundles);
  const seenBefore = before ? partyCanSee(before, bundles) : () => false;
  const known = (id: string) => seenAfter(id) || seenBefore(id);
  const roomSeen = (room: string) => Object.values(after.locations).some((l) => l.rooms[room]?.visited || false);
  return events.filter((e) => {
    if (INTERNAL.has(e.type)) return false;
    const p = e as Record<string, unknown>;
    if (e.type === "revealed" && p.secret !== undefined) return false;
    if (e.type === "room_light_changed" && typeof p.room === "string" && !roomSeen(p.room)) return false;
    // `to` names a room in `moved` and a recipient in `item_given`.
    const fields = e.type === "moved" ? NAMES.filter((f) => f !== "to") : NAMES;
    return fields.every((f) => typeof p[f] !== "string" || known(p[f] as string));
  });
}
