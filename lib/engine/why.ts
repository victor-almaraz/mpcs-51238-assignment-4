// Why a trigger whose event matched did not fire, for the editor's playtest trace (app-flow.md,
// Adventure editor: Playtest: "the conditions that failed"). Pure and read-only: it evaluates the
// trigger's `when` against a copy of a state with the engine's own `holds`, part by part, and never
// rolls; it does not change how the engine evaluates triggers. SPEC_ISSUES.md#playtest-failed-conditions.

import type { Requirement } from "../bundle/types/defs";
import { Rng } from "../rng";
import { content } from "./content";
import { Ctx } from "./ctx";
import { applyEffects } from "./effects";
import { flagValue, holds, resolveRoom, roomOf } from "./requirements";
import { actorOf } from "./triggers";
import type { Bundles, GameEvent, State } from "./types";
import { Perception, entityDistance } from "./world";

/** A trigger as the engine tests it. */
export interface HeldTrigger {
  id: string;
  when?: Requirement;
  once?: boolean;
}

/** `true` holds, `false` fails, `null` is a check whose roll is not repeated here. */
type Verdict = { ok: boolean | null; why: string[] };

const show = (v: unknown): string => (v === undefined ? "unset" : typeof v === "string" ? v : JSON.stringify(v));

/**
 * The readable reasons a trigger matched by `event` did not fire, such as `flag clues ≥ 3 (is 1)`.
 * `before` is the state the action started from, for `once`; `after` is the state the action produced,
 * against which conditions are evaluated. Conditions are read after the action, so a value an effect
 * changed later in the same action is reported as it ended.
 */
export function whyHeld(trigger: HeldTrigger, event: GameEvent, before: State, after: State, bundles: Bundles): string[] {
  if (trigger.once && before.fired_triggers.includes(trigger.id)) return ["once: it fired earlier"];
  if (trigger.when === undefined) return after.ended ? ["the instance ended first"] : ["it has no conditions; another trigger ended or changed the action first"];
  const ctx = new Ctx(structuredClone(after), content(bundles), new Rng(0), applyEffects);
  const v = judge(ctx, trigger.when, actorOf(event));
  if (v.ok === true) return ["its conditions hold after the action; they did not when the event occurred"];
  return v.why;
}

/** The parts of `req` that fail for `actor`, outermost group first; empty when it holds. */
export function unmetParts(ctx: Ctx, req: Requirement | undefined, actor: string | undefined): string[] {
  const v = judge(ctx, req, actor);
  return v.ok === true ? [] : v.why;
}

function judge(ctx: Ctx, req: Requirement | undefined, actor: string | undefined): Verdict {
  if (req === undefined) return { ok: true, why: [] };
  const r = req as Record<string, unknown>;
  if (Array.isArray(r.all)) {
    const parts = (r.all as Requirement[]).map((x) => judge(ctx, x, actor));
    const failed = parts.filter((p) => p.ok === false);
    if (failed.length > 0) return { ok: false, why: failed.flatMap((p) => p.why) };
    const unknown = parts.filter((p) => p.ok === null);
    if (unknown.length > 0) return { ok: null, why: unknown.flatMap((p) => p.why) };
    return { ok: true, why: [] };
  }
  if (Array.isArray(r.any)) {
    const parts = (r.any as Requirement[]).map((x) => judge(ctx, x, actor));
    if (parts.some((p) => p.ok === true)) return { ok: true, why: [] };
    const why = [`none of: ${parts.map((p) => p.why.join(" and ")).join("; ")}`];
    return { ok: parts.some((p) => p.ok === null) ? null : false, why };
  }
  if ("not" in r) {
    const inner = r.not as Requirement;
    const v = judge(ctx, inner, actor);
    if (v.ok === null) return { ok: null, why: [`not ${describe(inner)}: the check's result decides`] };
    return v.ok ? { ok: false, why: [`not ${describe(inner)} (it holds${detail(ctx, inner, actor)})`] } : { ok: true, why: [] };
  }
  // A check rolls and changes state; its result is in the action's events, not repeated here.
  if ("check" in r) return { ok: null, why: [`${describe(req)} did not pass`] };
  if (holds(ctx, req, actor)) return { ok: true, why: [] };
  return { ok: false, why: [`${describe(req)} (${detail(ctx, req, actor).replace(/^, /, "") || "fails"})`] };
}

/** The condition in words, without the current state. */
export function describe(req: Requirement): string {
  const r = req as Record<string, unknown>;
  if (Array.isArray(r.all)) return `all of (${(r.all as Requirement[]).map(describe).join("; ")})`;
  if (Array.isArray(r.any)) return `any of (${(r.any as Requirement[]).map(describe).join("; ")})`;
  if ("not" in r) return `not ${describe(r.not as Requirement)}`;
  if (typeof r.flag === "string") {
    if ("eq" in r) return `flag ${r.flag} = ${show(r.eq)}`;
    if ("gte" in r) return `flag ${r.flag} ≥ ${show(r.gte)}`;
    if ("lte" in r) return `flag ${r.flag} ≤ ${show(r.lte)}`;
    return `flag ${r.flag}`;
  }
  if (Array.isArray(r.stage)) return `arc ${String(r.stage[0])} at ${String(r.stage[1])}`;
  if ("defeated" in r) return `${String(r.defeated)} defeated`;
  if (typeof r.has_item === "string") return `has_item ${r.has_item}`;
  if (typeof r.location === "string") return `in location ${r.location}`;
  if (typeof r.room === "string") return `in room ${r.room}`;
  if (typeof r.near === "string") return `near ${r.near} within ${show(r.within)}`;
  if (typeof r.illumination === "string") return `illumination ${r.illumination}`;
  if ("check" in r) return `check ${JSON.stringify(r.check)}`;
  return JSON.stringify(req);
}

/** The state the condition read, as `, is 1`; empty for groups. */
function detail(ctx: Ctx, req: Requirement, actor: string | undefined): string {
  const r = req as Record<string, unknown>;
  const state = ctx.state;
  if (typeof r.flag === "string") {
    const scoped = ctx.c.flag(r.flag)?.scope === "character";
    return `, is ${show(flagValue(ctx, r.flag, actor))}${scoped && actor ? ` for ${actor}` : ""}`;
  }
  if (Array.isArray(r.stage)) return `, is at ${show(state.stages[r.stage[0] as string])}`;
  if ("defeated" in r) {
    const sheet = ctx.sheet(r.defeated as string);
    return sheet ? `, is ${sheet.status}` : ", not present";
  }
  if (!("has_item" in r || "location" in r || "room" in r || "near" in r || "illumination" in r)) return "";
  if (actor === undefined) return ", the event has no actor";
  if (typeof r.has_item === "string") {
    const items = (state.characters[actor]?.items ?? []).map((i) => state.entities[i]?.ref ?? i);
    return `, ${actor} carries ${items.length ? items.join(", ") : "nothing"}`;
  }
  if (typeof r.location === "string") return `, ${actor} is in ${show(ctx.locationOf(actor))}`;
  if (typeof r.room === "string") {
    const where = roomOf(state, actor);
    const target = resolveRoom(state, r.room, where?.location);
    const at = where ? `${where.location}.${where.room ?? "no room"}` : "no location";
    return `, ${actor} is in ${at}${target ? "" : `; ${r.room} names no room there`}`;
  }
  if (typeof r.near === "string") {
    const d = entityDistance(state, ctx.c, actor, r.near);
    return d === undefined ? `, ${r.near} is not in ${actor}'s location` : `, distance ${d}`;
  }
  if (typeof r.illumination === "string") {
    const body = ctx.body(actor);
    return body ? `, is ${new Perception(state, ctx.c).level(body.location, body.at)}` : `, ${actor} is not placed`;
  }
  return "";
}
