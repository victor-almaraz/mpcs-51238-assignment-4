// Requirements (engine.md, "Requirements") and room references (adventure-packs.md, "Room references").

import type { Requirement } from "../bundle/types/defs";
import { PASSING } from "../systems";
import { rules, type Ctx } from "./ctx";
import { situation } from "./situation";
import type { State } from "./types";
import { Perception, entityDistance, roomAt } from "./world";

/** Resolves `room` or `location.room` to a room id, following generated-room aliases. */
export function resolveRoom(state: State, ref: string, location: string | undefined): { location: string; room: string } | undefined {
  const [loc, name] = ref.includes(".") ? (ref.split(".") as [string, string]) : [location, ref];
  if (loc === undefined) return undefined;
  const l = state.locations[loc];
  if (!l) return undefined;
  const room = l.rooms[name] ? name : l.aliases?.[name];
  return room && l.rooms[room] ? { location: loc, room } : undefined;
}

/** The room a character or placed entity is in: the room holding its anchor cell. */
export function roomOf(state: State, id: string): { location: string; room: string | undefined } | undefined {
  const ch = state.characters[id];
  const e = state.entities[id];
  const location = ch?.location ?? e?.location;
  const at = ch?.at ?? e?.at;
  if (location === undefined || at === undefined) return undefined;
  return { location, room: roomAt(state.locations[location]!, at) };
}

/** A flag's value for the actor: party flags, or the actor's character-scoped value. */
export function flagValue(ctx: Ctx, flag: string, actor: string | undefined): boolean | number | string | undefined {
  const def = ctx.c.flag(flag);
  if (def?.scope === "character") return actor !== undefined ? ctx.state.character_flags[actor]?.[flag] : undefined;
  return ctx.state.flags[flag];
}

/** Evaluates a requirement for `actor`; requirements about the actor are false without one. */
export function holds(ctx: Ctx, req: Requirement | undefined, actor: string | undefined): boolean {
  if (req === undefined) return true;
  const r = req as Record<string, unknown>;
  if (Array.isArray(r.all)) return (r.all as Requirement[]).every((x) => holds(ctx, x, actor));
  if (Array.isArray(r.any)) return (r.any as Requirement[]).some((x) => holds(ctx, x, actor));
  if ("not" in r) return !holds(ctx, r.not as Requirement, actor);
  const state = ctx.state;
  if (typeof r.flag === "string") {
    const v = flagValue(ctx, r.flag, actor);
    if ("eq" in r) return v === r.eq;
    if ("gte" in r) return typeof v === "number" && v >= (r.gte as number);
    if ("lte" in r) return typeof v === "number" && v <= (r.lte as number);
    return Boolean(v);
  }
  if (Array.isArray(r.stage)) return state.stages[r.stage[0] as string] === r.stage[1];
  if ("defeated" in r) {
    const sheet = ctx.sheet(r.defeated as string);
    return sheet !== undefined && sheet.status !== "active";
  }
  if (actor === undefined) return false;
  if (typeof r.has_item === "string") return (state.characters[actor]?.items ?? []).some((i) => state.entities[i]?.ref === r.has_item);
  if (typeof r.location === "string") return ctx.locationOf(actor) === r.location;
  if (typeof r.room === "string") {
    const where = roomOf(state, actor);
    const target = resolveRoom(state, r.room, where?.location);
    return target !== undefined && where?.location === target.location && where.room === target.room;
  }
  if (typeof r.near === "string") {
    const d = entityDistance(state, ctx.c, actor, r.near);
    return d !== undefined && d <= (r.within as number);
  }
  if (typeof r.illumination === "string") {
    const body = ctx.body(actor);
    return body !== undefined && new Perception(state, ctx.c).level(body.location, body.at) === r.illumination;
  }
  if ("check" in r) {
    // A `partial` that carries a pending choice passes; the choice is offered after evaluation.
    const result = rules(() => ctx.system.check(ctx.combatant(actor), r.check, situation(ctx, actor, null, []), ctx.rng));
    for (const [id, sheet] of Object.entries(result.updates)) ctx.setSheet(id, sheet);
    for (const event of result.events) ctx.emit(event);
    if (result.effects.length > 0) ctx.runEffects(ctx, result.effects, { actor });
    if (result.choice) ctx.deferredChoices.push(result.choice);
    return result.outcome !== null && PASSING.has(result.outcome);
  }
  return false;
}
