// Party changes while an instance is paused (api.md, Instances: add_character and remove_character
// allowed in `paused`; data-model.md, Character: the sheet is copied in on joining and written back on
// leaving).
// SPEC_ISSUES.md#party-changes: where a joining character appears, and what leaving removes.

import { Ctx, reject } from "./ctx";
import { resolveRoom, roomOf } from "./requirements";
import { joinCharacter } from "./start";
import type { JoiningCharacter, State } from "./types";

/**
 * Places a character in the room of the party's first character in id order, or the adventure's start
 * room when the party is empty or that character is outside every room. In exploration it takes part in the current round.
 */
export function joinParty(ctx: Ctx, joining: JoiningCharacter): void {
  const s = ctx.state;
  if (s.characters[joining.id]) reject("invalid_call", `'${joining.id}' is already in the instance`);
  const first = Object.keys(s.characters).sort()[0];
  const start = ctx.c.adventure.manifest.start;
  const party = first ? roomOf(s, first) : undefined;
  const room = party?.room !== undefined ? { location: party.location, room: party.room } : resolveRoom(s, start.room, start.location);
  if (!room) reject("unknown_id", "the party's room does not exist");
  joinCharacter(ctx, joining, room.location, room.room);
  if (s.mode === "exploration" && !s.round.participants.includes(joining.id)) s.round.participants.push(joining.id);
}

/** Removes a character and the items it carries, which travel with its sheet's inventory. */
export function leaveParty(ctx: Ctx, characterId: string): void {
  const s = ctx.state;
  const ch = s.characters[characterId];
  if (!ch) reject("unknown_id", `'${characterId}' is not in the instance`);
  for (const item of ch.items) removeEntity(s, item);
  delete s.characters[characterId];
  delete s.character_flags[characterId];
  delete s.pending_choices[characterId];
  delete s.improvise_streak[characterId];
  delete s.round.declarations[characterId];
  s.round.participants = s.round.participants.filter((id) => id !== characterId);
  s.combatants = s.combatants.filter((id) => id !== characterId);
  for (const list of ["order", "initiative"] as const) {
    const ids = s.round[list];
    if (!ids) continue;
    const at = ids.indexOf(characterId);
    if (at < 0) continue;
    ids.splice(at, 1);
    if (list === "order" && s.round.turn_index !== null && at < s.round.turn_index) s.round.turn_index -= 1;
  }
}

function removeEntity(s: State, id: string): void {
  const e = s.entities[id];
  if (!e) return;
  for (const inner of e.contents ?? []) removeEntity(s, inner);
  delete s.entities[id];
}
