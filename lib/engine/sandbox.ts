// Sandbox games (engine.md, Sandbox): `alter`, the tool that lets the model change the game. It applies
// up to three of the adventure effects below, after light checks: targets are the actor or what the
// actor sees, refs name templates that exist, amounts and durations are bounded, and rooms are in the
// actor's location. Flags, stages, endings, combat starts, and conditional effects stay with the
// adventure, so its plot and endings still hold.

import type { Effect } from "../systems";
import type { Bundles } from "./types";
import { reject, type Ctx } from "./ctx";
import { resolveRoom } from "./requirements";
import { Perception } from "./world";

/** The effects `alter` may apply, with the arguments each takes. */
export const SANDBOX_EFFECTS = {
  damage: ["target", "amount"],
  heal: ["target", "amount"],
  apply_condition: ["target", "condition", "duration"],
  remove_condition: ["target", "condition"],
  give_item: ["target", "ref"],
  remove_item: ["target", "ref"],
  spawn: ["ref", "room"],
  despawn: ["target"],
  move_entity: ["target", "room"],
  open_door: ["door"],
  close_door: ["door"],
  set_light: ["target", "lit"],
  set_room_light: ["room", "level"],
  set_hostile: ["target", "hostile"],
} as const satisfies Record<string, readonly string[]>;

export type SandboxEffect = keyof typeof SANDBOX_EFFECTS;

/** At most this many effects per `alter`, and these bounds on amounts and durations. */
export const ALTER_MAX_EFFECTS = 3;
const MAX_AMOUNT = 20;
const MAX_DURATION = 10;

/** How many templates the parser's catalog lists. */
const CATALOG_MAX = 60;

/** Item and creature templates `give_item` and `spawn` may name, for the parser: ref, label, and kind. */
export function catalog(bundles: Bundles): { ref: string; label: string; kind: "item" | "creature" }[] {
  const out: { ref: string; label: string; kind: "item" | "creature" }[] = [];
  for (const b of [bundles.adventure, ...bundles.settings]) {
    for (const [key, t] of Object.entries(b.entities ?? {})) {
      if (t.kind === "item" || t.kind === "creature") out.push({ ref: `${b.namespace}:${key}`, label: t.label, kind: t.kind });
    }
  }
  return out.slice(0, CATALOG_MAX);
}

const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Checks one effect's name and argument names; the checks against the state come in `alter`. */
export function validateEffect(effect: unknown): asserts effect is Effect {
  if (typeof effect !== "object" || effect === null || Array.isArray(effect)) reject("invalid_call", "each effect is an object with one effect name");
  const names = Object.keys(effect);
  if (names.length !== 1) reject("invalid_call", "each effect has exactly one effect name");
  const name = names[0]!;
  if (!Object.hasOwn(SANDBOX_EFFECTS, name)) reject("invalid_call", `alter cannot apply '${name}'; it applies ${Object.keys(SANDBOX_EFFECTS).join(", ")}`);
  const args = (effect as Record<string, unknown>)[name];
  if (typeof args !== "object" || args === null || Array.isArray(args)) reject("invalid_call", `${name} takes an object of arguments`);
  const allowed: readonly string[] = SANDBOX_EFFECTS[name as SandboxEffect];
  for (const k of Object.keys(args)) if (!allowed.includes(k)) reject("invalid_call", `${name} has no argument '${k}'; expected ${allowed.join(", ")}`);
}

/** Applies a sandbox `alter`: checks every effect against the state, then applies them in order. */
export function alter(ctx: Ctx, actor: string, effects: readonly Effect[], intent: string): void {
  if (!ctx.state.sandbox) reject("invalid_call", "alter is available only in sandbox games");
  const body = ctx.body(actor);
  if (!body) reject("unknown_id", `'${actor}' is not placed`);
  const perception = new Perception(ctx.state, ctx.c);
  const location = ctx.locationOf(actor);
  const seen = (id: unknown) => {
    if (id === "actor") return;
    if (typeof id !== "string") reject("invalid_call", "a target is 'actor' or an id from the context");
    const own = ctx.state.characters[actor]!.items.includes(id);
    if (!(ctx.state.entities[id] || ctx.state.characters[id])) reject("unknown_id", `'${id}' does not exist`);
    if (!own && id !== actor && !perception.visible(body, id)) reject("not_reachable", `'${id}' is not visible`);
  };
  const template = (ref: unknown, kinds: readonly string[]) => {
    if (typeof ref !== "string" || !ctx.c.hasTemplate(ref)) reject("unknown_id", `'${String(ref)}' is not a template`);
    if (!kinds.includes(ctx.c.template(ref).kind)) reject("invalid_call", `'${ref}' is not ${kinds.join(" or ")}`);
  };
  const room = (ref: unknown) => {
    if (typeof ref !== "string" || !resolveRoom(ctx.state, ref, location)?.room) reject("unknown_id", `'${String(ref)}' is not a room here`);
    if (resolveRoom(ctx.state, ref, location)!.location !== location) reject("not_reachable", `'${ref}' is in another location`);
  };
  for (const effect of effects) {
    const [name, a] = Object.entries(effect)[0] as [SandboxEffect, Record<string, unknown>];
    if ((SANDBOX_EFFECTS[name] as readonly string[]).includes("target")) seen(a.target);
    switch (name) {
      case "damage":
      case "heal":
        if (!int(a.amount, 1, MAX_AMOUNT)) reject("invalid_call", `${name}.amount is a whole number from 1 to ${MAX_AMOUNT}`);
        break;
      case "apply_condition":
      case "remove_condition":
        if (typeof a.condition !== "string" || !ctx.c.condition(a.condition)) reject("unknown_id", `'${String(a.condition)}' is not a condition`);
        if (a.duration !== undefined && !int(a.duration, 1, MAX_DURATION)) reject("invalid_call", `apply_condition.duration is a whole number from 1 to ${MAX_DURATION}`);
        break;
      case "give_item":
      case "remove_item":
        template(a.ref, ["item"]);
        if (a.target !== "actor" && !ctx.state.characters[a.target as string]) reject("invalid_call", `${name}.target is a character`);
        break;
      case "spawn":
        template(a.ref, ["item", "creature"]);
        room(a.room);
        break;
      case "despawn":
        if (a.target === "actor" || ctx.state.characters[a.target as string]) reject("invalid_call", "despawn removes things, not characters");
        break;
      case "move_entity":
        room(a.room);
        break;
      case "open_door":
      case "close_door":
        seen(a.door);
        if (ctx.state.entities[a.door as string]?.kind !== "door") reject("invalid_call", `'${String(a.door)}' is not a door`);
        break;
      case "set_light":
        if (typeof a.lit !== "boolean") reject("invalid_call", "set_light.lit is true or false");
        break;
      case "set_room_light":
        room(a.room);
        if (!["bright", "dim", "dark"].includes(a.level as string)) reject("invalid_call", "set_room_light.level is bright, dim, or dark");
        break;
      case "set_hostile":
        if (typeof a.hostile !== "boolean") reject("invalid_call", "set_hostile.hostile is true or false");
        break;
    }
  }
  ctx.emit({ type: "altered", actor, intent });
  ctx.runEffects(ctx, effects, { actor });
}
