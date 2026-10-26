// Effects (engine.md, "Effects"): the only way materials change state.

import type { Requirement } from "../bundle/types/defs";
import { footprintCells, type Cell } from "../grid";
import type { Effect } from "../systems";
import { rules, type Ctx, type Scope } from "./ctx";
import { startCombat } from "./combat";
import { holds, resolveRoom, roomOf } from "./requirements";
import type { ConditionState } from "./types";
import { bodiesIn, cellsOf, footprintOf, moverTests, roomCells } from "./world";

type Args = Record<string, unknown>;

/** Applies effects in order. System-returned effects use the same rules (engine.md, "Effects"). */
export function applyEffects(ctx: Ctx, effects: readonly Effect[], scope: Scope): void {
  for (const effect of effects) {
    if (ctx.state.ended) return;
    const [name] = Object.keys(effect);
    if (name === undefined) continue;
    apply(ctx, name, (effect[name] ?? {}) as Args, scope);
  }
}

/** The ids a `target` names: an entity id, `actor`, `target`, or `room` (every creature in the actor's room). */
export function targets(ctx: Ctx, target: unknown, scope: Scope): string[] {
  if (target === "actor") return scope.actor !== undefined ? [scope.actor] : [];
  if (target === "target") return scope.target !== undefined ? [scope.target] : [];
  if (target === "room") {
    if (scope.actor === undefined) return [];
    const where = roomOf(ctx.state, scope.actor);
    if (!where) return [];
    return bodiesIn(ctx.state, ctx.c, where.location)
      .filter((b) => roomOf(ctx.state, b.id)?.room === where.room)
      .map((b) => b.id);
  }
  if (typeof target !== "string") return [];
  return ctx.state.characters[target] || ctx.state.entities[target] ? [target] : [];
}

function amountOf(ctx: Ctx, args: Args): number {
  return typeof args.amount === "number" ? args.amount : ctx.rng.roll(args.dice as string).total;
}

/** The location unqualified room references resolve in. */
function scopeLocation(ctx: Ctx, scope: Scope): string | undefined {
  return scope.location ?? (scope.actor !== undefined ? ctx.locationOf(scope.actor) : undefined);
}

/** Free cells of a room for a creature of the given template, in row-major order. */
function freeCells(ctx: Ctx, location: string, room: string, ref: string): Cell[] {
  const t = ctx.c.template(ref);
  const footprint = t.kind === "item" || t.kind === "door" ? ([1, 1] as const) : t.footprint;
  const probe = { id: "", kind: "creature" as const, side: "entities" as const, location, at: [0, 0] as Cell, footprint };
  const tests = moverTests(ctx.state, ctx.c, probe);
  const loc = ctx.state.locations[location]!;
  return roomCells(loc, room).filter((cell) => footprintCells(cell, footprint).every(tests.free));
}

function addCondition(ctx: Ctx, id: string, condition: string, duration: number | null | undefined): void {
  const list: ConditionState[] = ctx.state.characters[id]?.conditions ?? ctx.state.entities[id]?.conditions ?? [];
  const def = ctx.c.condition(condition);
  const remaining = duration !== undefined ? duration : (def?.duration ?? null);
  const existing = list.find((k) => k.id === condition);
  if (existing) existing.remaining = remaining;
  else list.push({ id: condition, remaining });
  ctx.emit({ type: "condition_applied", target: id, condition });
}

export function removeCondition(ctx: Ctx, id: string, condition: string): void {
  const holder = ctx.state.characters[id] ?? ctx.state.entities[id];
  if (!holder) return;
  const before = holder.conditions.length;
  holder.conditions = holder.conditions.filter((k) => k.id !== condition);
  if (holder.conditions.length !== before) ctx.emit({ type: "condition_removed", target: id, condition });
}

/** Moves a carried item to the cell of `holder`. */
export function dropAt(ctx: Ctx, item: string, holder: string): void {
  const e = ctx.state.entities[item]!;
  const ch = ctx.state.characters[holder];
  const where = ch ? { location: ch.location, at: ch.at } : { location: ctx.state.entities[holder]?.location, at: ctx.state.entities[holder]?.at };
  detach(ctx, item);
  e.location = where.location;
  e.at = where.at === undefined ? undefined : [where.at[0], where.at[1]];
}

/** Removes an item from whoever carries it. */
export function detach(ctx: Ctx, item: string): void {
  const e = ctx.state.entities[item];
  if (!e || e.carrier === undefined) return;
  const ch = ctx.state.characters[e.carrier];
  if (ch) {
    ch.items = ch.items.filter((i) => i !== item);
    ctx.syncInventory(e.carrier);
  } else {
    const holder = ctx.state.entities[e.carrier];
    if (holder?.contents) holder.contents = holder.contents.filter((i) => i !== item);
  }
  delete e.carrier;
}

/** Gives an item to a character, or drops it at their cell when `can_carry` refuses it. */
export function carry(ctx: Ctx, item: string, character: string): boolean {
  const ch = ctx.state.characters[character]!;
  const ok = rules(() => ctx.system.can_carry(ctx.combatant(character), ctx.inventory([...ch.items, item])));
  if (!ok) return false;
  detach(ctx, item);
  const e = ctx.state.entities[item]!;
  delete e.location;
  delete e.at;
  e.carrier = character;
  ch.items.push(item);
  ctx.syncInventory(character);
  return true;
}

export function openDoor(ctx: Ctx, door: string, actor?: string): void {
  const e = ctx.state.entities[door];
  if (!e || e.kind !== "door" || (e.open && !e.locked)) return;
  e.open = true;
  e.locked = false;
  ctx.emit(actor !== undefined ? { type: "door_opened", door, actor } : { type: "door_opened", door });
}

/** Closes a door unless a creature or item occupies its cell. Returns whether it closed. */
export function closeDoor(ctx: Ctx, door: string, actor?: string): boolean {
  const e = ctx.state.entities[door];
  if (!e || e.kind !== "door" || !e.open || e.at === undefined) return false;
  const [x, y] = e.at;
  const occupied =
    Object.values(ctx.state.characters).some((ch) => ch.location === e.location && ch.at[0] === x && ch.at[1] === y) ||
    Object.entries(ctx.state.entities).some(
      ([id, o]) => id !== door && o.location === e.location && (o.kind === "creature" || o.kind === "item") && cellsOf(ctx.c, o).some(([cx, cy]) => cx === x && cy === y),
    );
  if (occupied) return false;
  e.open = false;
  ctx.emit(actor !== undefined ? { type: "door_closed", door, actor } : { type: "door_closed", door });
  return true;
}

/** Places an entity at `at`, or on a free cell of the room chosen by RNG; no effect without a free cell. */
function place(ctx: Ctx, ref: string, roomRef: string, at: unknown, scope: Scope): { location: string; at: Cell } | undefined {
  const where = resolveRoom(ctx.state, roomRef, scopeLocation(ctx, scope));
  if (!where) return undefined;
  if (Array.isArray(at)) return { location: where.location, at: [at[0] as number, at[1] as number] };
  const cells = freeCells(ctx, where.location, where.room, ref);
  if (cells.length === 0) return undefined;
  return { location: where.location, at: ctx.rng.pick(cells) };
}

function setFlag(ctx: Ctx, flag: string, value: unknown, adding: boolean, args: Args, scope: Scope): void {
  const def = ctx.c.flag(flag);
  if (!def) return;
  const clamp = (v: unknown) => (def.type === "int" && typeof v === "number" ? Math.max(def.min, Math.min(def.max, v)) : v) as boolean | number | string;
  if (def.scope === "character") {
    const holders = args.target === "room" ? targets(ctx, "room", scope).filter((id) => ctx.state.characters[id]) : scope.actor !== undefined && ctx.state.characters[scope.actor] ? [scope.actor] : [];
    for (const id of holders) {
      const values = (ctx.state.character_flags[id] ??= {});
      const next = clamp(adding ? (values[flag] as number) + (value as number) : value);
      values[flag] = next;
      ctx.emit({ type: "flag_set", flag, value: next });
    }
    return;
  }
  const next = clamp(adding ? (ctx.state.flags[flag] as number) + (value as number) : value);
  ctx.state.flags[flag] = next;
  ctx.emit({ type: "flag_set", flag, value: next });
}

function apply(ctx: Ctx, name: string, args: Args, scope: Scope): void {
  const state = ctx.state;
  switch (name) {
    case "damage":
      for (const id of targets(ctx, args.target, scope)) {
        if (!ctx.sheet(id)) continue;
        const amount = amountOf(ctx, args);
        ctx.apply(rules(() => ctx.system.harm(ctx.combatant(id), amount, ctx.rng, (args.type as string | undefined) ?? null)), id);
      }
      return;
    case "heal":
      for (const id of targets(ctx, args.target, scope)) {
        if (!ctx.sheet(id)) continue;
        const amount = amountOf(ctx, args);
        ctx.apply(rules(() => ctx.system.heal(ctx.combatant(id), amount)), id);
      }
      return;
    case "apply_condition":
      for (const id of targets(ctx, args.target, scope)) addCondition(ctx, id, args.condition as string, args.duration as number | null | undefined);
      return;
    case "remove_condition":
      for (const id of targets(ctx, args.target, scope)) removeCondition(ctx, id, args.condition as string);
      return;
    case "give_item":
      for (const id of targets(ctx, args.target, scope)) {
        if (!state.characters[id]) continue;
        const item = ctx.createEntity(args.ref as string, { location: state.characters[id].location, at: state.characters[id].at });
        ctx.emit({ type: "entity_spawned", entity: item });
        carry(ctx, item, id);
      }
      return;
    case "remove_item":
      for (const id of targets(ctx, args.target, scope)) {
        const item = state.characters[id]?.items.find((i) => state.entities[i]!.ref === args.ref);
        if (item === undefined) continue;
        detach(ctx, item);
        delete state.entities[item];
        ctx.emit({ type: "entity_despawned", entity: item });
      }
      return;
    case "drop_item":
      for (const id of targets(ctx, args.target, scope)) {
        const item = state.characters[id]?.items.find((i) => state.entities[i]!.ref === args.ref);
        if (item === undefined) continue;
        dropAt(ctx, item, id);
        ctx.emit({ type: "item_dropped", actor: id, item, ref: args.ref });
      }
      return;
    case "spawn": {
      const at = place(ctx, args.ref as string, args.room as string, args.at, scope);
      if (!at) return;
      const id = ctx.createEntity(args.ref as string, at, args.id as string | undefined);
      ctx.emit({ type: "entity_spawned", entity: id });
      return;
    }
    case "despawn":
      for (const id of targets(ctx, args.target, scope)) {
        if (!state.entities[id]) continue;
        detach(ctx, id);
        delete state.entities[id];
        ctx.emit({ type: "entity_despawned", entity: id });
      }
      return;
    case "move_entity":
      for (const id of targets(ctx, args.target, scope)) {
        const e = state.entities[id];
        const ch = state.characters[id];
        if (!e && !ch) continue;
        const ref = e?.ref ?? "";
        const from = roomOf(state, id);
        const where = e ? place(ctx, ref, args.room as string, args.at, scope) : placeCharacter(ctx, args.room as string, args.at, scope);
        if (!where) continue;
        if (e) {
          e.location = where.location;
          e.at = where.at;
        } else {
          ch!.location = where.location;
          ch!.at = where.at;
        }
        const to = roomOf(state, id);
        ctx.emit({ type: "moved", actor: id, location: where.location, from: from?.room ?? null, to: to?.room ?? null, at: where.at, steps: 0, stopped: "arrived" });
      }
      return;
    case "open_door":
      openDoor(ctx, args.door as string);
      return;
    case "close_door":
      closeDoor(ctx, args.door as string);
      return;
    case "set_light":
      for (const id of targets(ctx, args.target, scope)) {
        const e = state.entities[id];
        if (!e || !("light" in ctx.c.template(e.ref))) continue;
        e.lit = args.lit as boolean;
        ctx.emit({ type: "light_changed", target: id, lit: e.lit });
      }
      return;
    case "set_room_light": {
      const where = resolveRoom(state, args.room as string, scopeLocation(ctx, scope));
      if (!where) return;
      state.locations[where.location]!.rooms[where.room]!.light = args.level as "bright" | "dim" | "dark";
      ctx.emit({ type: "room_light_changed", room: where.room, level: args.level });
      return;
    }
    case "set_flag":
      setFlag(ctx, args.flag as string, args.value, false, args, scope);
      return;
    case "add_flag":
      setFlag(ctx, args.flag as string, args.value, true, args, scope);
      return;
    case "set_hostile":
      for (const id of targets(ctx, args.target, scope)) if (state.entities[id]) state.entities[id].hostile = args.hostile as boolean;
      return;
    case "set_stage":
      state.stages[args.arc as string] = args.stage as string;
      ctx.emit({ type: "stage_set", arc: args.arc, stage: args.stage });
      return;
    case "reveal":
      if (typeof args.secret === "string") {
        if (!state.revealed.includes(args.secret)) state.revealed.push(args.secret);
        const [npc, secret] = args.secret.split(".") as [string, string];
        const text = ctx.c.npc(npc)?.secrets?.[secret];
        if (text) ctx.facts.push(text);
        ctx.emit({ type: "revealed", secret: args.secret });
        return;
      }
      for (const id of targets(ctx, args.target, scope)) {
        const holder = state.entities[id] ?? state.characters[id];
        if (!holder?.conditions.some((k) => k.id === "hidden")) continue;
        holder.conditions = holder.conditions.filter((k) => k.id !== "hidden");
        ctx.emit({ type: "revealed", target: id });
      }
      return;
    case "start_combat":
      startCombat(ctx, scope.actor);
      return;
    case "end_campaign":
      state.ended = { ending: args.ending as string };
      ctx.emit({ type: "instance_ended", ending: args.ending });
      return;
    case "if": {
      const branch = holds(ctx, args.when as Requirement, scope.actor) ? args.then : args.else;
      if (Array.isArray(branch)) applyEffects(ctx, branch as Effect[], scope);
      return;
    }
  }
}

function placeCharacter(ctx: Ctx, roomRef: string, at: unknown, scope: Scope): { location: string; at: Cell } | undefined {
  const where = resolveRoom(ctx.state, roomRef, scopeLocation(ctx, scope));
  if (!where) return undefined;
  if (Array.isArray(at)) return { location: where.location, at: [at[0] as number, at[1] as number] };
  const probe = { id: "", kind: "character" as const, side: "characters" as const, location: where.location, at: [0, 0] as Cell, footprint: [1, 1] as const };
  const tests = moverTests(ctx.state, ctx.c, probe);
  const cells = roomCells(ctx.state.locations[where.location]!, where.room).filter(tests.free);
  return cells.length > 0 ? { location: where.location, at: ctx.rng.pick(cells) } : undefined;
}

export { footprintOf };
