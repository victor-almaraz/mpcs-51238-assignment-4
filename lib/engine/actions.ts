// Tool calls (tools.md, "Tool set"; engine.md, "Action resolution"): argument validation and the
// resolution of each tool. Resolution functions mutate the context's state or throw `Reject`.

import type { Requirement } from "../bundle/types/defs";
import { PASSING } from "../systems";
import { reject, rules, type Ctx } from "./ctx";
import { applyEffects, carry, closeDoor, detach, dropAt, openDoor } from "./effects";
import { approach, cellSees, inAttackReach, inTouch, isHostile, moveAway, moveTo, visibleHostiles } from "./movement";
import { startCombat } from "./combat";
import { holds, roomOf } from "./requirements";
import { situation } from "./situation";
import type { ToolCall } from "./types";
import { Perception, cellsOfAny, footprintOf, placement, type Body } from "./world";
import { distance, footprintCells, type Cell } from "../grid";

export const TOOLS = ["move", "attack", "ability", "use", "interact", "examine", "search", "take", "drop", "give", "talk", "rest", "wait", "choose", "improvise"] as const;
export type Tool = (typeof TOOLS)[number];
export const FREE_TOOLS: ReadonlySet<string> = new Set(["examine", "improvise", "choose"]);
const EXPLORATION_ONLY: ReadonlySet<string> = new Set(["interact", "search", "take", "drop", "give", "rest"]);
const IMPROVISE_CATEGORIES = ["flavor", "impossible", "unsupported", "meta", "unclear", "overreach"];

type ArgSpec = Record<string, { type: "string" | "array"; required: boolean; max?: number; values?: readonly string[] }>;

const ARGS: Readonly<Record<Tool, ArgSpec>> = {
  move: { to_id: { type: "string", required: false }, away_from_id: { type: "string", required: false } },
  attack: { target_id: { type: "string", required: true }, item_id: { type: "string", required: false } },
  ability: { ability_id: { type: "string", required: true }, target_id: { type: "string", required: false } },
  use: { item_id: { type: "string", required: true }, target_id: { type: "string", required: false } },
  interact: { target_id: { type: "string", required: true }, verb: { type: "string", required: true } },
  examine: { target_id: { type: "string", required: false } },
  search: {},
  take: { entity_id: { type: "string", required: true } },
  drop: { item_id: { type: "string", required: true } },
  give: { item_id: { type: "string", required: true }, target_id: { type: "string", required: true } },
  talk: { npc_id: { type: "string", required: true }, topic_id: { type: "string", required: false }, utterance: { type: "string", required: true, max: 200 } },
  rest: { kind: { type: "string", required: true, values: ["short", "long"] } },
  wait: {},
  choose: { option_id: { type: "string", required: true } },
  improvise: {
    category: { type: "string", required: true, values: IMPROVISE_CATEGORIES },
    intent: { type: "string", required: true, max: 120 },
    suggestions: { type: "array", required: true, max: 2 },
  },
};

/** Schema validation of a tool call: name, argument names, types, and lengths. */
export function validateCall(call: unknown): asserts call is ToolCall {
  if (typeof call !== "object" || call === null) reject("invalid_call", "a tool call is an object with tool and args");
  const { tool, args } = call as { tool?: unknown; args?: unknown };
  if (typeof tool !== "string" || !(TOOLS as readonly string[]).includes(tool)) reject("invalid_call", `unknown tool '${String(tool)}'`);
  if (typeof args !== "object" || args === null || Array.isArray(args)) reject("invalid_call", "args must be an object");
  const spec = ARGS[tool as Tool];
  for (const [name, value] of Object.entries(args)) {
    const s = spec[name];
    if (!s) reject("invalid_call", `${tool} has no argument '${name}'; expected ${Object.keys(spec).join(", ") || "none"}`);
    if (s.type === "string" && typeof value !== "string") reject("invalid_call", `${tool}.${name} must be a string`);
    if (s.type === "array" && !Array.isArray(value)) reject("invalid_call", `${tool}.${name} must be a list`);
    if (s.max !== undefined && (value as string | unknown[]).length > s.max) reject("invalid_call", `${tool}.${name} is longer than ${s.max}`);
    if (s.values && !s.values.includes(value as string)) reject("invalid_call", `${tool}.${name} must be one of ${s.values.join(", ")}`);
  }
  for (const [name, s] of Object.entries(spec)) if (s.required && !(name in args)) reject("invalid_call", `${tool} needs '${name}'`);
  if (tool === "move" && ("to_id" in args) === ("away_from_id" in args)) reject("invalid_call", "move needs exactly one of to_id and away_from_id");
  if (tool === "improvise") {
    for (const s of (args as { suggestions: unknown[] }).suggestions) {
      const ok = typeof s === "object" && s !== null && typeof (s as ToolCall).tool === "string" && typeof (s as ToolCall).args === "object" && Object.keys(s).length === 2;
      if (!ok) reject("invalid_call", "each suggestion is { tool, args }");
    }
  }
}

/** Checks that apply to every tool before resolution: status, conditions, mode, and pending choices. */
export function checkActor(ctx: Ctx, actor: string, call: ToolCall): void {
  const ch = ctx.state.characters[actor];
  if (!ch) reject("unknown_id", `'${actor}' is not a character in this instance`);
  const free = FREE_TOOLS.has(call.tool);
  if (ctx.state.pending_choices[actor] && call.tool !== "choose" && !free) reject("choice_pending", "choose an option of the pending choice first");
  if (call.tool === "choose" && !ctx.state.pending_choices[actor]) reject("requirement_unmet", "there is no pending choice");
  if (free) return;
  if (ch.sheet.status !== "active") reject("blocked_by_condition", `the character is ${ch.sheet.status}`);
  for (const k of ch.conditions) {
    const blocks = ctx.c.condition(k.id)?.blocks ?? [];
    if (blocks.includes(call.tool)) reject("blocked_by_condition", `'${k.id}' blocks ${call.tool}`);
  }
  // engine.md, "Rounds": characters outside the combat area may use the exploration-only tools.
  if (ctx.state.round.mode === "combat" && EXPLORATION_ONLY.has(call.tool) && inCombatAreaOf(ctx, actor)) {
    reject("invalid_in_mode", `${call.tool} is not available in combat`);
  }
}

/**
 * The tools an actor may call now, before arguments: the checks of `checkActor`, plus turn order
 * under sequential resolution (tools.md, Parser context: `can_act` false offers only free tools).
 */
export function availableTools(ctx: Ctx, actor: string): { tools: string[]; can_act: boolean } {
  const s = ctx.state;
  const ch = s.characters[actor];
  if (!ch) return { tools: [], can_act: false };
  const all = Object.keys(ARGS);
  const free = all.filter((t) => FREE_TOOLS.has(t) && (t !== "choose" || s.pending_choices[actor]));
  const current = s.round.resolution === "sequential" && s.round.order && s.round.turn_index !== null ? s.round.order[s.round.turn_index] : undefined;
  const can_act = !(s.round.resolution === "sequential" && current !== actor) && ch.sheet.status === "active";
  if (!can_act || s.pending_choices[actor]) return { tools: free, can_act };
  const blocked = new Set(ch.conditions.flatMap((k) => ctx.c.condition(k.id)?.blocks ?? []));
  const combat = s.round.mode === "combat" && inCombatAreaOf(ctx, actor);
  const tools = all.filter((t) => t !== "choose" && !blocked.has(t) && !(combat && EXPLORATION_ONLY.has(t)));
  return { tools, can_act };
}

const str = (v: unknown) => v as string;

function inCombatAreaOf(ctx: Ctx, id: string): boolean {
  const room = roomOf(ctx.state, id)?.room;
  return room !== undefined && ctx.state.combat_area.includes(room);
}

function known(ctx: Ctx, id: string): void {
  if (!ctx.state.entities[id] && !ctx.state.characters[id]) {
    const inLinks = Object.values(ctx.state.locations).some((l) => l.links[id] || l.rooms[id]);
    if (!inLinks) reject("unknown_id", `'${id}' does not exist`);
  }
}

function bodyOrReject(ctx: Ctx, actor: string): Body {
  const b = ctx.body(actor);
  if (!b) reject("unknown_id", `'${actor}' is not placed`);
  return b;
}

function visibleOrReject(ctx: Ctx, body: Body, id: string): void {
  known(ctx, id);
  if (!new Perception(ctx.state, ctx.c).visible(body, id)) reject("not_reachable", `'${id}' is not visible`);
}

function heldOrReject(ctx: Ctx, actor: string, item: string): void {
  known(ctx, item);
  if (!ctx.state.characters[actor]!.items.includes(item)) reject("requirement_unmet", `'${item}' is not held`);
}

/** Resolves one ordered or free tool call for a character. */
export function resolve(ctx: Ctx, actor: string, call: ToolCall): void {
  const a = call.args;
  switch (call.tool as Tool) {
    case "move":
      return move(ctx, actor, a);
    case "attack":
      return attack(ctx, actor, str(a.target_id), a.item_id as string | undefined);
    case "ability":
      return ability(ctx, actor, str(a.ability_id), a.target_id as string | undefined);
    case "use":
      return applyUse(ctx, actor, str(a.item_id), a.target_id as string | undefined);
    case "interact":
      return interact(ctx, actor, str(a.target_id), str(a.verb));
    case "examine": {
      if (a.target_id !== undefined) {
        const t = str(a.target_id);
        const own = ctx.state.characters[actor]!.items.includes(t);
        if (!own) visibleOrReject(ctx, bodyOrReject(ctx, actor), t);
        ctx.emit({ type: "examined", actor, target: t });
      } else ctx.emit({ type: "examined", actor });
      return;
    }
    case "search":
      return search(ctx, actor);
    case "take":
      return take(ctx, actor, str(a.entity_id));
    case "drop": {
      const item = str(a.item_id);
      heldOrReject(ctx, actor, item);
      const rest = ctx.state.characters[actor]!.items.filter((i) => i !== item);
      if (!rules(() => ctx.system.can_carry(ctx.combatant(actor), ctx.inventory(rest)))) reject("requirement_unmet", "the remaining inventory cannot be carried");
      dropAt(ctx, item, actor);
      ctx.emit({ type: "item_dropped", actor, item, ref: ctx.state.entities[item]!.ref });
      return;
    }
    case "give":
      return give(ctx, actor, str(a.item_id), str(a.target_id));
    case "talk":
      return talk(ctx, actor, str(a.npc_id), a.topic_id as string | undefined, str(a.utterance));
    case "rest": {
      if (visibleHostiles(ctx, bodyOrReject(ctx, actor)).size > 0) reject("requirement_unmet", "a hostile creature is in sight");
      ctx.apply(rules(() => ctx.system.rest(ctx.combatant(actor), str(a.kind))), actor);
      return;
    }
    case "wait":
      ctx.emit({ type: "waited", actor });
      return;
    case "choose":
      return choose(ctx, actor, str(a.option_id));
    case "improvise":
      ctx.state.improvise_streak[actor] = (ctx.state.improvise_streak[actor] ?? 0) + 1;
      ctx.emit({ type: "improvised", actor, category: a.category, intent: a.intent, suggestions: a.suggestions });
      return;
  }
}

function move(ctx: Ctx, actor: string, a: Record<string, unknown>): void {
  const body = bodyOrReject(ctx, actor);
  if (typeof a.away_from_id === "string") {
    visibleOrReject(ctx, body, a.away_from_id);
    if (!ctx.state.entities[a.away_from_id] && !ctx.state.characters[a.away_from_id]) reject("unknown_id", `'${a.away_from_id}' is not a creature`);
    if (!moveAway(ctx, body, [a.away_from_id])) reject("not_reachable", "no free cell lies farther away");
    return;
  }
  const to = str(a.to_id);
  known(ctx, to);
  const loc = ctx.state.locations[body.location]!;
  if (loc.rooms[to]) {
    const seen = loc.rooms[to].visited || loc.rooms[to].area.some(([x, y, w, h]) => loc.seen.slice(y, y + h).some((row) => row.slice(x, x + w).includes("1")));
    if (!seen) reject("not_reachable", `'${to}' is not a known room`);
  } else if (loc.links[to]) {
    const [x, y] = loc.links[to].at;
    if (loc.seen[y]?.[x] !== "1") reject("not_reachable", `'${to}' has not been seen`);
  } else visibleOrReject(ctx, body, to);
  moveTo(ctx, body, to);
}

function weaponOf(ctx: Ctx, actor: string, item: string | undefined) {
  if (item === undefined) return null;
  heldOrReject(ctx, actor, item);
  return ctx.held(item);
}

/** Attacks, approaching first when the system's `approach` is true (engine.md, "Reach"). */
export function attack(ctx: Ctx, actor: string, target: string, item: string | undefined): void {
  const body = bodyOrReject(ctx, actor);
  visibleOrReject(ctx, body, target);
  const e = ctx.state.entities[target];
  const attackable = ctx.state.characters[target] !== undefined || e?.kind === "creature" || ((e?.kind === "obstacle" || e?.kind === "door") && e.sheet !== undefined);
  if (!attackable) reject("requirement_unmet", `'${target}' cannot be attacked`);
  const weapon = weaponOf(ctx, actor, item);
  const { range, tag } = rules(() => ctx.system.reach(ctx.combatant(actor), weapon));
  if (!inAttackReach(ctx, body, target, range)) {
    if (!ctx.system.SPATIAL.approach) reject("not_reachable", `'${target}' is out of reach`);
    const reachFrom = (at: Cell) => inAttackReach(ctx, { ...body, at }, target, range);
    if (!approach(ctx, body, target, reachFrom)) {
      ctx.emit({ type: "action_voided", actor, tool: "attack", reason: "not_reachable" });
      return;
    }
  }
  const result = rules(() => ctx.system.attack(ctx.combatant(actor), ctx.combatant(target), weapon, situation(ctx, actor, target, [tag]), ctx.rng));
  ctx.apply(result, actor, target);
  if (e?.kind === "creature") startCombat(ctx, actor);
}

function ability(ctx: Ctx, actor: string, abilityRef: string, target: string | undefined): void {
  const sheet = ctx.state.characters[actor]!.sheet;
  const def = ctx.c.ability(abilityRef);
  if (!def) reject("unknown_id", `ability '${abilityRef}' does not exist`);
  if (!((sheet.abilities as string[] | undefined) ?? []).includes(abilityRef)) reject("requirement_unmet", `'${abilityRef}' is not known`);
  const body = bodyOrReject(ctx, actor);
  let aim: string | undefined;
  if (def.target === "self") aim = actor;
  else if (def.target === "entity" || def.target === "door") {
    if (target === undefined) reject("invalid_call", `ability '${abilityRef}' needs a target_id`);
    visibleOrReject(ctx, body, target);
    if (def.target === "door" && ctx.state.entities[target]?.kind !== "door") reject("requirement_unmet", `'${target}' is not a door`);
    if (def.range !== undefined && def.range !== null) {
      const t = placement(ctx.state, ctx.c, target)!;
      const d = Math.min(...footprintCells(t.at, t.footprint).map((c) => distance(c, body.at, ctx.system.SPATIAL.metric)));
      if (d > def.range) reject("not_reachable", `'${target}' is beyond the ability's range of ${def.range}`);
    }
    aim = target;
  }
  const cost = (def.system_stats as { cost?: unknown }).cost;
  ctx.setSheet(actor, rules(() => ctx.system.pay_cost(ctx.combatant(actor).sheet, cost)));
  ctx.emit(aim !== undefined && aim !== actor ? { type: "ability_used", actor, ability: abilityRef, target: aim } : { type: "ability_used", actor, ability: abilityRef });
  // engine.md, "Action resolution": an ability is rolled when its system_stats set `roll: true`.
  if ((def.system_stats as { roll?: boolean }).roll === true) {
    const result = rules(() => ctx.system.check(ctx.combatant(actor), {}, situation(ctx, actor, aim ?? null, []), ctx.rng));
    ctx.apply({ ...result, choice: null }, actor, aim);
    const passed = result.outcome !== null && PASSING.has(result.outcome);
    if (passed) applyEffects(ctx, def.effects, { actor, target: aim });
    if (result.choice) ctx.offerChoice(result.choice);
    return;
  }
  applyEffects(ctx, def.effects, { actor, target: aim });
}

function applyUse(ctx: Ctx, actor: string, item: string, target: string | undefined): void {
  heldOrReject(ctx, actor, item);
  const e = ctx.state.entities[item]!;
  const t = ctx.c.template(e.ref) as { use?: { target: string; effects: unknown[] }; light?: unknown; kind: string };
  if (e.uses === 0) reject("requirement_unmet", `'${item}' has no uses left`);
  const body = bodyOrReject(ctx, actor);
  let aim: string | undefined;
  const kind = t.use?.target ?? (target !== undefined ? "entity" : "none");
  if (kind === "self") aim = actor;
  else if (kind === "none") aim = undefined;
  else {
    aim = target ?? (kind === "self_or_ally" ? actor : undefined);
    if (aim === undefined) reject("invalid_call", `using '${item}' needs a target_id`);
    if (aim !== actor) {
      visibleOrReject(ctx, body, aim);
      if (kind === "self_or_ally" && !ctx.state.characters[aim]) reject("requirement_unmet", `'${aim}' is not an ally`);
      if (kind === "door" && ctx.state.entities[aim]?.kind !== "door") reject("requirement_unmet", `'${aim}' is not a door`);
      if (!inTouch(ctx, actor, aim)) reject("not_reachable", `'${aim}' is out of reach`);
    }
  }
  const door = aim !== undefined ? ctx.state.entities[aim] : undefined;
  const opensDoor = door?.kind === "door" && door.locked === true && (door.lock as { has_item?: string } | undefined)?.has_item === e.ref;
  const result = rules(() => ctx.system.use_item(ctx.combatant(actor), ctx.held(item), ctx.rng));
  if (!t.use && !t.light && result === null && !opensDoor) reject("requirement_unmet", `'${item}' has no use`);
  ctx.emit(aim !== undefined ? { type: "item_used", actor, item, target: aim } : { type: "item_used", actor, item });
  if (result) {
    if (result.consume) {
      const rest = ctx.state.characters[actor]!.items.filter((i) => i !== item);
      if (!rules(() => ctx.system.can_carry(ctx.combatant(actor), ctx.inventory(rest)))) reject("requirement_unmet", "the remaining inventory cannot be carried");
    }
    ctx.apply(result, actor, aim);
    if (result.consume) {
      detach(ctx, item);
      delete ctx.state.entities[item];
      ctx.emit({ type: "entity_despawned", entity: item });
    }
  }
  if (opensDoor) openDoor(ctx, aim!, actor);
  if (t.use) applyEffects(ctx, t.use.effects as never, { actor, target: aim });
  else if (t.light && result === null && !opensDoor) {
    e.lit = !(e.lit ?? true);
    ctx.emit({ type: "light_changed", target: item, lit: e.lit, actor });
  }
  const still = ctx.state.entities[item];
  if (still && typeof still.uses === "number") still.uses -= 1;
}

function interact(ctx: Ctx, actor: string, target: string, verb: string): void {
  const body = bodyOrReject(ctx, actor);
  visibleOrReject(ctx, body, target);
  const e = ctx.state.entities[target];
  if (!e) reject("requirement_unmet", `'${target}' cannot be interacted with`);
  if (!inTouch(ctx, actor, target)) reject("not_reachable", `'${target}' is out of reach`);
  const t = ctx.c.template(e.ref) as { verbs?: Record<string, { requirement?: Requirement; effects: unknown[] }>; light?: unknown };
  const def = t.verbs?.[verb];
  if (def) {
    if (!holds(ctx, def.requirement, actor)) reject("requirement_unmet", `the requirement of '${verb}' does not hold`);
    ctx.emit({ type: "interacted", actor, target, verb });
    applyEffects(ctx, def.effects as never, { actor, target });
    for (const choice of ctx.deferredChoices.splice(0)) if (choice) ctx.offerChoice(choice);
    return;
  }
  if (e.kind === "door" && (verb === "open" || verb === "close")) {
    if (verb === "open") {
      if (e.locked && !holds(ctx, e.lock, actor)) reject("requirement_unmet", `'${target}' is locked`);
      ctx.emit({ type: "interacted", actor, target, verb });
      openDoor(ctx, target, actor);
    } else {
      if (!e.open) reject("requirement_unmet", `'${target}' is already closed`);
      ctx.emit({ type: "interacted", actor, target, verb });
      if (!closeDoor(ctx, target, actor)) reject("requirement_unmet", `something occupies the cell of '${target}'`);
    }
    for (const choice of ctx.deferredChoices.splice(0)) if (choice) ctx.offerChoice(choice);
    return;
  }
  if (t.light && e.kind !== "item" && (verb === "light" || verb === "extinguish")) {
    e.lit = verb === "light";
    ctx.emit({ type: "interacted", actor, target, verb });
    ctx.emit({ type: "light_changed", target, lit: e.lit, actor });
    return;
  }
  reject("requirement_unmet", `'${target}' has no verb '${verb}'`);
}

function search(ctx: Ctx, actor: string): void {
  const result = rules(() => ctx.system.check(ctx.combatant(actor), ctx.system.STANDARD_CHECKS.search, situation(ctx, actor, null, []), ctx.rng));
  ctx.apply({ ...result, choice: null }, actor);
  const success = result.outcome !== null && PASSING.has(result.outcome);
  const revealed: string[] = [];
  if (success) {
    const body = bodyOrReject(ctx, actor);
    const room = roomOf(ctx.state, actor)?.room;
    const perception = new Perception(ctx.state, ctx.c);
    for (const id of Object.keys(ctx.state.entities).sort()) {
      const e = ctx.state.entities[id]!;
      if (e.location !== body.location || !e.conditions.some((k) => k.id === "hidden") || roomOf(ctx.state, id)?.room !== room) continue;
      const cells = cellsOfAny(ctx.state, ctx.c, id)!.cells;
      if (!cells.some((cell) => perception.perceives(body, cell) || cellSees(ctx, body, body.at, id))) continue;
      e.conditions = e.conditions.filter((k) => k.id !== "hidden");
      revealed.push(id);
    }
  }
  ctx.emit({ type: "searched", actor, success, revealed });
  if (result.choice) ctx.offerChoice(result.choice);
}

function capacityOf(ctx: Ctx, id: string): number | undefined {
  const e = ctx.state.entities[id];
  return e?.kind === "container" ? (ctx.c.template(e.ref) as { capacity?: number }).capacity : undefined;
}

/** A locked container refuses take and give unless its lock holds; the first time it holds unlocks it. */
function openContainer(ctx: Ctx, container: string, actor: string): void {
  const e = ctx.state.entities[container]!;
  if (!e.locked) return;
  if (!holds(ctx, e.lock, actor)) reject("requirement_unmet", `'${container}' is locked`);
  e.locked = false;
}

function take(ctx: Ctx, actor: string, id: string): void {
  const body = bodyOrReject(ctx, actor);
  known(ctx, id);
  const e = ctx.state.entities[id];
  if (!e) reject("requirement_unmet", `'${id}' cannot be taken`);
  let items: string[];
  if (e.carrier !== undefined) {
    // An item inside a container with capacity.
    const holder = e.carrier;
    if (ctx.state.characters[holder]) reject("requirement_unmet", `'${id}' is carried by '${holder}'`);
    if (capacityOf(ctx, holder) === undefined) reject("unknown_id", `'${id}' does not exist`);
    visibleOrReject(ctx, body, holder);
    if (!inTouch(ctx, actor, holder)) reject("not_reachable", `'${holder}' is out of reach`);
    openContainer(ctx, holder, actor);
    items = [id];
  } else if (e.kind === "container") {
    visibleOrReject(ctx, body, id);
    if (!inTouch(ctx, actor, id)) reject("not_reachable", `'${id}' is out of reach`);
    openContainer(ctx, id, actor);
    items = [...(e.contents ?? [])];
  } else if (e.kind === "item") {
    visibleOrReject(ctx, body, id);
    if (!inTouch(ctx, actor, id)) reject("not_reachable", `'${id}' is out of reach`);
    items = [id];
  } else reject("requirement_unmet", `'${id}' cannot be taken`);
  const after = [...ctx.state.characters[actor]!.items, ...items];
  if (!rules(() => ctx.system.can_carry(ctx.combatant(actor), ctx.inventory(after)))) reject("requirement_unmet", "the inventory cannot hold it");
  for (const item of items) {
    carry(ctx, item, actor);
    ctx.emit({ type: "item_taken", actor, item, ref: ctx.state.entities[item]!.ref });
  }
}

function give(ctx: Ctx, actor: string, item: string, to: string): void {
  heldOrReject(ctx, actor, item);
  const body = bodyOrReject(ctx, actor);
  known(ctx, to);
  visibleOrReject(ctx, body, to);
  if (to === actor) reject("requirement_unmet", "an item cannot be given to its holder");
  if (!inTouch(ctx, actor, to)) reject("not_reachable", `'${to}' is out of reach`);
  const rest = ctx.state.characters[actor]!.items.filter((i) => i !== item);
  if (!rules(() => ctx.system.can_carry(ctx.combatant(actor), ctx.inventory(rest)))) reject("requirement_unmet", "the remaining inventory cannot be carried");
  const recipient = ctx.state.characters[to];
  if (recipient) {
    if (!rules(() => ctx.system.can_carry(ctx.combatant(to), ctx.inventory([...recipient.items, item])))) reject("requirement_unmet", `'${to}' cannot carry it`);
    carry(ctx, item, to);
  } else {
    const capacity = capacityOf(ctx, to);
    if (capacity === undefined) reject("requirement_unmet", `'${to}' cannot receive items`);
    const holder = ctx.state.entities[to]!;
    if ((holder.contents ?? []).length >= capacity) reject("requirement_unmet", `'${to}' is full`);
    openContainer(ctx, to, actor);
    detach(ctx, item);
    const e = ctx.state.entities[item]!;
    e.carrier = to;
    (holder.contents ??= []).push(item);
  }
  ctx.emit({ type: "item_given", actor, item, ref: ctx.state.entities[item]!.ref, to });
}

function talk(ctx: Ctx, actor: string, npc: string, topic: string | undefined, utterance: string): void {
  const body = bodyOrReject(ctx, actor);
  if (!ctx.c.npc(npc) || !ctx.state.entities[npc]) reject("unknown_id", `NPC '${npc}' does not exist`);
  visibleOrReject(ctx, body, npc);
  if (roomOf(ctx.state, npc)?.room !== roomOf(ctx.state, actor)?.room || ctx.locationOf(npc) !== body.location) reject("not_reachable", `'${npc}' is not in the room`);
  const def = topic !== undefined ? ctx.c.npc(npc)!.topics?.[topic] : undefined;
  if (topic !== undefined) {
    if (!def) reject("unknown_id", `'${npc}' has no topic '${topic}'`);
    if (!holds(ctx, def.when, actor)) reject("requirement_unmet", `topic '${topic}' is not available`);
  }
  ctx.emit(topic !== undefined ? { type: "talked", actor, npc, topic, utterance } : { type: "talked", actor, npc, utterance });
  if (def) {
    ctx.facts.push(def.brief);
    applyEffects(ctx, (def.effects ?? []) as never, { actor, target: npc });
  }
}

function choose(ctx: Ctx, actor: string, option: string): void {
  const choice = ctx.state.pending_choices[actor]!;
  const o = choice.options.find((x) => x.id === option);
  if (!o) reject("unknown_id", `the pending choice has no option '${option}'`);
  delete ctx.state.pending_choices[actor];
  ctx.apply({ outcome: null, rolls: [], updates: o.updates, events: o.events, effects: o.effects, choice: null }, actor);
  ctx.emit({ type: "choice_made", actor, option });
}

export { isHostile, footprintOf };
