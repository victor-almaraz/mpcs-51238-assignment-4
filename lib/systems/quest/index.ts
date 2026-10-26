// The Quest rules system (docs/systems/quest.md), implementing docs/systems/README.md, "Contract".
// Pure: no I/O, no clock; randomness only from the Rng argument.

import type { Rng } from "../../rng";
// SPEC_ISSUES.md#systems-generated-types: a type-only import of the generated sheet type.
import type { QuestCharacterSheet } from "../../bundle/types/questCharacter";
import {
  RulesError,
  compareText,
  emptyResolution,
  type ChoiceOption,
  type Combatant,
  type Effect,
  type GameEvent,
  type HeldItem,
  type OrderingPolicy,
  type Resolution,
  type Roll,
  type RulesSystem,
  type Sheet,
  type Summary,
  type Tier,
} from "../contract";
import { DATA, SCHEMAS, type QuestData, type Setback } from "./data";

export { DATA, SCHEMAS };
export type { QuestData, Setback };

export const ID = "quest";
export const VERSION = "1.2.0";

export interface Meter {
  value: number;
  max: number;
}

export type CharacterSheet = QuestCharacterSheet & Sheet;

export interface CreatureSheet extends Sheet {
  template: string;
  hp: Meter;
  damage: number;
  speed?: number;
  ranged?: boolean;
  status: "active" | "dead";
}

export interface StructureSheet extends Sheet {
  hp: Meter;
  status: "active" | "destroyed";
}

/** Creature damage per hit without a `damage` override (quest.md, "Creatures and items"). */
const CREATURE_DAMAGE = 2;

// SPEC_ISSUES.md#quest-npc-attack: the Creators Resource's NPC templates give attack ratings
// (commoner 1, minion 2, boss 4); a creature without its own `damage` deals its template's rating.
const NPC_ATTACK: Readonly<Record<string, number>> = { commoner: 1, minion: 2, boss: 4 };

/** Prompt of a tough choice (api.md, `choice` message example). */
const TOUGH_CHOICE_PROMPT = "Success, at a cost. Choose a setback.";

// SPEC_ISSUES.md#quest-tool-priority: quest.md names `tool_priority` without its list; this is the
// list from engine.md, "Ordering policy".
export const ORDERING: OrderingPolicy = {
  exploration: {
    resolution: "simultaneous",
    order: [
      { key: "tool_priority", tools: ["move", "talk", "interact", "take", "give", "drop", "use", "ability", "attack", "search", "wait"] },
    ],
    reroll: "never",
  },
  combat: { resolution: "simultaneous", order: [{ key: "side", first: "characters" }], reroll: "never" },
};

export const STANDARD_CHECKS = { search: { tags: ["search"] } } as const;
export const MODULES: readonly string[] = [];
export const SPATIAL = {
  metric: DATA.spatial.metric,
  approach: DATA.spatial.approach,
  lighting: DATA.spatial.lighting,
} as const;

// ---------------------------------------------------------------------------------------------
// Validation helpers

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max = Infinity): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function onlyKeys(v: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const k of Object.keys(v)) {
    if (!allowed.includes(k)) throw new RulesError("invalid_call", `${what}: unknown field '${k}'; expected ${allowed.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Rolls and tiers

export function tierOf(roll: number): Tier {
  for (const { min, tier } of DATA.tiers) if (roll >= min) return tier;
  throw new RangeError(`d20 result ${roll} is below every tier`);
}

function d20(rng: Rng, label: string): Roll {
  const n = rng.die(20);
  return { label, dice: [n], total: n };
}

// ---------------------------------------------------------------------------------------------
// Harm and healing

export interface Part {
  updates: Record<string, Sheet>;
  events: GameEvent[];
  effects: Effect[];
  rolls: Roll[];
}

export const emptyPart = (): Part => ({ updates: {}, events: [], effects: [], rolls: [] });

export function merge(into: Part, part: Part): void {
  Object.assign(into.updates, part.updates);
  into.events.push(...part.events);
  into.effects.push(...part.effects);
  into.rolls.push(...part.rolls);
}

export function hpOf(sheet: Sheet): Meter {
  const hp = sheet.hp as Meter | undefined;
  if (!hp || !isInt(hp.value, 0) || !isInt(hp.max, 1)) throw new RulesError("invalid_call", "sheet has no hp meter");
  return hp;
}

/** Applies `amount` of harm to the target's sheet (quest.md, "Harm, death, and healing"). */
export function harmSheet(target: Combatant, sheet: Sheet, amount: number, rng: Rng): Part {
  const part = emptyPart();
  if (!isInt(amount, 0)) throw new RulesError("invalid_call", `harm amount ${amount} is not a non-negative integer`);
  const harmable = sheet.status === "active" || (target.kind === "character" && sheet.status === "deaths_door");
  if (amount === 0 || !harmable) return part;
  const hp = hpOf(sheet);
  // SPEC_ISSUES.md#quest-event-payloads: `damaged.amount` is the harm dealt.
  if (target.kind === "character" && sheet.status === "deaths_door") {
    const roll = d20(rng, "death's door");
    part.rolls.push(roll);
    part.events.push({ type: "damaged", target: target.id, amount, remaining: 0 });
    if (roll.total <= amount) {
      part.updates[target.id] = { ...sheet, status: "dead" };
      part.events.push({ type: "died", target: target.id });
    }
    return part;
  }
  const value = Math.max(0, hp.value - amount);
  const next: Sheet = { ...sheet, hp: { ...hp, value } };
  part.events.push({ type: "damaged", target: target.id, amount, remaining: value });
  if (value === 0) {
    if (target.kind === "character") next.status = "deaths_door";
    else if (target.kind === "creature") {
      next.status = "dead";
      part.events.push({ type: "died", target: target.id });
    } else next.status = "destroyed";
  }
  part.updates[target.id] = next;
  return part;
}

/** Restores up to `amount` HP and returns a character at death's door to `active`. */
export function healSheet(target: Combatant, sheet: Sheet, amount: number, revive = false): Part {
  const part = emptyPart();
  if (!isInt(amount, 0)) throw new RulesError("invalid_call", `heal amount ${amount} is not a non-negative integer`);
  if (target.kind === "structure" || (amount === 0 && !revive)) return part;
  if (sheet.status !== "active" && sheet.status !== "deaths_door") return part;
  const hp = hpOf(sheet);
  const value = Math.min(hp.max, hp.value + amount);
  if (value === hp.value && sheet.status === "active") return part;
  part.updates[target.id] = { ...sheet, hp: { ...hp, value }, status: "active" };
  part.events.push({ type: "healed", target: target.id, amount: value - hp.value });
  return part;
}

export function resolution(outcome: Tier | null, part: Part, choice: Resolution["choice"] = null): Resolution {
  return { outcome, rolls: part.rolls, updates: part.updates, events: part.events, effects: part.effects, choice };
}

// ---------------------------------------------------------------------------------------------
// Setbacks (quest.md, "Checks", "Attacks", "Automation adaptations")

// SPEC_ISSUES.md#quest-setbacks: a setback applies when it can change something; only tough
// choices exclude setbacks that do not apply.
function applies(setback: Setback, sheet: Sheet, item: HeldItem | null): boolean {
  if (setback.drop_item) return item !== null;
  if (setback.lose_ap !== undefined) return isInt(sheet.ap, 1);
  return true;
}

function setbackPart(actor: Combatant, sheet: Sheet, setback: Setback, item: HeldItem | null): Part {
  const part = emptyPart();
  if (setback.harm_actor !== undefined) part.effects.push({ damage: { target: actor.id, amount: setback.harm_actor } });
  if (setback.lose_ap !== undefined && isInt(sheet.ap, 1)) {
    const value = Math.max(0, sheet.ap - setback.lose_ap);
    part.updates[actor.id] = { ...sheet, ap: value };
    part.events.push({ type: "resource_changed", target: actor.id, resource: "ap", delta: value - sheet.ap, value });
  }
  if (setback.drop_item && item !== null) part.effects.push({ drop_item: { target: actor.id, ref: item.ref } });
  return part;
}

/** Setbacks for a character's roll; `sheet` is the actor's sheet after the rest of the resolution. */
function setbacks(actor: Combatant, sheet: Sheet, tier: Tier, item: HeldItem | null, rng: Rng): { part: Part; choice: Resolution["choice"] } {
  const part = emptyPart();
  if (actor.kind !== "character") return { part, choice: null };
  if (tier === "partial") {
    const pool = DATA.setbacks.tough_choice.filter((s) => applies(s, sheet, item));
    const drawn: Setback[] = [];
    while (drawn.length < 2 && pool.length > 0) drawn.push(pool.splice(rng.die(pool.length) - 1, 1)[0]!);
    const options: ChoiceOption[] = drawn.map((s) => {
      const p = setbackPart(actor, sheet, s, item);
      return { id: s.id, label: s.label, updates: p.updates, events: p.events, effects: p.effects };
    });
    return { part, choice: { actor: actor.id, prompt: TOUGH_CHOICE_PROMPT, options } };
  }
  const list = tier === "failure" ? DATA.setbacks.failure : tier === "critical_failure" ? DATA.setbacks.severe : null;
  if (list) merge(part, setbackPart(actor, sheet, rng.pick(list), item));
  return { part, choice: null };
}

// ---------------------------------------------------------------------------------------------
// Contract functions

export function configure(modules: readonly string[]): RulesSystem {
  for (const m of modules) throw new RulesError("invalid_call", `quest has no module '${m}'`);
  return QUEST;
}

const CHOICE_KEYS = ["role", "abilities", "items", "profile"] as const;

export function create_character(name: string, choices: unknown, rng: Rng): CharacterSheet {
  void rng;
  if (typeof name !== "string" || name.length < 1 || name.length > 40) {
    throw new RulesError("invalid_call", "name must have 1 to 40 characters");
  }
  if (!isObject(choices)) throw new RulesError("invalid_call", "choices must be an object");
  onlyKeys(choices, CHOICE_KEYS, "choices");
  const { role, abilities, items = [], profile } = choices;
  if (typeof role !== "string" || !DATA.roles.includes(role)) {
    throw new RulesError("invalid_call", `role must be one of ${DATA.roles.join(", ")}`);
  }
  if (
    !Array.isArray(abilities) ||
    abilities.length !== DATA.starting_abilities ||
    !abilities.every((a) => typeof a === "string") ||
    new Set(abilities).size !== abilities.length
  ) {
    throw new RulesError("invalid_call", `choose exactly ${DATA.starting_abilities} distinct abilities`);
  }
  // SPEC_ISSUES.md#quest-creation-items: `items` is read as a list of item refs.
  if (!Array.isArray(items) || !items.every((i) => typeof i === "string") || items.length > DATA.inventory_max) {
    throw new RulesError("invalid_call", `items must be at most ${DATA.inventory_max} item refs`);
  }
  if (profile !== undefined && (!isObject(profile) || !Object.values(profile).every((v) => typeof v === "string" && v.length <= 200))) {
    throw new RulesError("invalid_call", "profile answers must be strings of at most 200 characters");
  }
  const sheet: CharacterSheet = {
    name,
    role: role as QuestCharacterSheet["role"],
    hp: { value: DATA.hp_max, max: DATA.hp_max },
    ap: DATA.ap_start,
    abilities: [...(abilities as string[])],
    // Length checked above; the generated type spells `maxItems: 12` as tuples.
    inventory: (items as string[]).map((ref) => ({ ref })) as QuestCharacterSheet["inventory"],
    status: "active",
  };
  if (profile !== undefined) sheet.profile = { ...(profile as Record<string, string>) };
  return sheet;
}

export function instantiate(stats: unknown, rng: Rng): CreatureSheet {
  void rng;
  if (!isObject(stats)) throw new RulesError("invalid_call", "quest creature: system_stats must be an object");
  onlyKeys(stats, ["template", "hp", "damage", "speed", "ranged"], "quest creature");
  const { template, hp, damage, speed, ranged } = stats;
  if (typeof template !== "string" || !(template in DATA.npc_templates)) {
    throw new RulesError("invalid_call", `quest creature: template must be one of ${Object.keys(DATA.npc_templates).join(", ")}`);
  }
  if (hp !== undefined && !isInt(hp, 1)) throw new RulesError("invalid_call", "quest creature: hp must be an integer of at least 1");
  if (damage !== undefined && !isInt(damage, 0)) throw new RulesError("invalid_call", "quest creature: damage must be a non-negative integer");
  if (speed !== undefined && !isInt(speed, 1, 24)) throw new RulesError("invalid_call", "quest creature: speed must be 1 to 24");
  if (ranged !== undefined && typeof ranged !== "boolean") throw new RulesError("invalid_call", "quest creature: ranged must be a boolean");
  const max = (hp as number | undefined) ?? DATA.npc_templates[template]!;
  const sheet: CreatureSheet = { template, hp: { value: max, max }, damage: (damage as number | undefined) ?? NPC_ATTACK[template] ?? CREATURE_DAMAGE, status: "active" };
  if (speed !== undefined) sheet.speed = speed as number;
  if (ranged !== undefined) sheet.ranged = ranged as boolean;
  return sheet;
}

export function instantiate_structure(stats: unknown): StructureSheet {
  if (!isObject(stats)) throw new RulesError("invalid_call", "quest structure: system_stats must be an object");
  onlyKeys(stats, ["hp"], "quest structure");
  if (!isInt(stats.hp, 1)) throw new RulesError("invalid_call", "quest structure: hp must be an integer of at least 1");
  return { hp: { value: stats.hp, max: stats.hp }, status: "active" };
}

export function speed(combatant: Combatant): number {
  const own = combatant.kind === "creature" ? combatant.sheet.speed : undefined;
  return isInt(own, 1) ? own : DATA.spatial.speed;
}

export function senses(combatant: Combatant): { darkvision: number } {
  void combatant;
  return { darkvision: DATA.spatial.darkvision };
}

export function reach(combatant: Combatant, weapon: HeldItem | null): { range: number | null; tag: "melee" | "ranged" } {
  const ranged = combatant.kind === "creature" ? combatant.sheet.ranged === true : weapon?.stats.ranged === true;
  return ranged ? { range: DATA.spatial.ranged_range, tag: "ranged" } : { range: DATA.spatial.melee_reach, tag: "melee" };
}

const STATUS_LABELS: Readonly<Record<string, string>> = {
  active: "active",
  deaths_door: "at death's door",
  dead: "dead",
  destroyed: "destroyed",
};

export function summary(sheet: Sheet): Summary {
  const hp = sheet.hp as Meter | undefined;
  const out: Summary = {
    health: hp ? `${hp.value}/${hp.max} HP` : "",
    status: STATUS_LABELS[sheet.status] ?? sheet.status,
  };
  if (typeof sheet.ap === "number") out.resources = { AP: String(sheet.ap) };
  return out;
}

export function check(actor: Combatant, spec: unknown, situation: unknown, rng: Rng): Resolution {
  void situation; // Quest never modifies the roll.
  if (!isObject(spec)) throw new RulesError("invalid_call", "quest check: specification must be an object");
  onlyKeys(spec, ["tags"], "quest check");
  if (spec.tags !== undefined && !(Array.isArray(spec.tags) && spec.tags.every((t) => typeof t === "string"))) {
    throw new RulesError("invalid_call", "quest check: tags must be strings");
  }
  const roll = d20(rng, "check");
  const tier = tierOf(roll.total);
  const part: Part = { ...emptyPart(), rolls: [roll] };
  part.events.push({ type: "check_rolled", target: actor.id, outcome: tier, roll: roll.total });
  const { part: sb, choice } = setbacks(actor, actor.sheet, tier, null, rng);
  merge(part, sb);
  return resolution(tier, part, choice);
}

const MULTIPLIER: Readonly<Record<Tier, number>> = {
  critical_success: 2,
  success: 1,
  partial: 1,
  failure: 0,
  critical_failure: 0,
};

/** Standard damage: a creature's `damage`, the weapon's `damage` (default 2), or 1 unarmed. */
function standardDamage(attacker: Combatant, weapon: HeldItem | null): number {
  if (attacker.kind === "creature") return isInt(attacker.sheet.damage, 0) ? attacker.sheet.damage : CREATURE_DAMAGE;
  if (weapon === null) return DATA.damage.unarmed;
  return isInt(weapon.stats.damage, 0) ? weapon.stats.damage : DATA.damage.weapon;
}

/** Harm applied to a sheet: Quest's `harmSheet`, or a module's wrapper of it. */
export type HarmSheet = (target: Combatant, sheet: Sheet, amount: number, rng: Rng, type: string | null) => Part;

/** `attack` with the given harm, so that modules that change harm also change attack damage. */
export function attackWith(harmFn: HarmSheet) {
  return (attacker: Combatant, defender: Combatant, weapon: HeldItem | null, situation: unknown, rng: Rng): Resolution =>
    resolveAttack(harmFn, attacker, defender, weapon, situation, rng);
}

export function attack(attacker: Combatant, defender: Combatant, weapon: HeldItem | null, situation: unknown, rng: Rng): Resolution {
  return resolveAttack(harmSheet, attacker, defender, weapon, situation, rng);
}

function resolveAttack(
  harmFn: HarmSheet,
  attacker: Combatant,
  defender: Combatant,
  weapon: HeldItem | null,
  situation: unknown,
  rng: Rng,
): Resolution {
  void situation;
  const roll = d20(rng, "attack");
  const tier = tierOf(roll.total);
  const base = standardDamage(attacker, weapon) * MULTIPLIER[tier];
  // SPEC_ISSUES.md#quest-npc-tough-choice: an NPC's tough choice deals half damage, rounded up.
  const damage = attacker.kind === "creature" && tier === "partial" ? Math.ceil(base / 2) : base;
  const part: Part = { ...emptyPart(), rolls: [roll] };
  part.events.push({ type: "attacked", actor: attacker.id, target: defender.id, roll: roll.total, outcome: tier, damage });
  merge(part, harmFn(defender, defender.sheet, damage, rng, null));
  const attackerSheet = part.updates[attacker.id] ?? attacker.sheet;
  const { part: sb, choice } = setbacks(attacker, attackerSheet, tier, weapon, rng);
  merge(part, sb);
  return resolution(tier, part, choice);
}

export function harm(target: Combatant, amount: number, rng: Rng, type: string | null): Resolution {
  void type; // Quest has no damage types.
  return resolution(null, harmSheet(target, target.sheet, amount, rng));
}

export function heal(target: Combatant, amount: number): Resolution {
  return resolution(null, healSheet(target, target.sheet, amount));
}

export function rest(target: Combatant, kind: string): Resolution {
  if (kind !== "short" && kind !== "long") throw new RulesError("invalid_call", `rest kind must be short or long, not '${kind}'`);
  if (target.kind === "structure") return emptyResolution();
  const hp = hpOf(target.sheet);
  // SPEC_ISSUES.md#quest-regroup: a regroup restores HP up to half the maximum, not by half of it.
  const amount = kind === "short" ? Math.max(0, Math.floor(hp.max / 2) - hp.value) : hp.max;
  // At death's door with nothing to restore, the regroup still ends death's door.
  if (amount === 0 && target.sheet.status === "deaths_door") return resolution(null, healSheet(target, target.sheet, 0, true));
  return resolution(null, healSheet(target, target.sheet, amount));
}

export function tick(target: Combatant): Resolution {
  void target;
  return emptyResolution();
}

export function session_end(target: Combatant): Resolution {
  if (target.kind !== "character" || !isInt(target.sheet.ap, 0)) return emptyResolution();
  const value = target.sheet.ap + DATA.ap_award_per_session;
  const part = emptyPart();
  part.updates[target.id] = { ...target.sheet, ap: value };
  part.events.push({ type: "resource_changed", target: target.id, resource: "ap", delta: DATA.ap_award_per_session, value });
  return resolution(null, part);
}

/** Quest has no initiative: participants in ascending id order, with no draws. */
export function initiative(participants: readonly Combatant[], rng: Rng): string[] {
  void rng;
  return participants.map((p) => p.id).sort(compareText);
}

export function pay_cost(sheet: Sheet, cost: unknown): Sheet {
  if (cost === undefined || cost === null) return { ...sheet };
  if (!isObject(cost)) throw new RulesError("invalid_call", "quest cost must be an object");
  onlyKeys(cost, ["ap"], "quest cost");
  if (!isInt(cost.ap, 0)) throw new RulesError("invalid_call", "quest cost: ap must be a non-negative integer");
  const ap = isInt(sheet.ap, 0) ? sheet.ap : 0;
  if (cost.ap > ap) throw new RulesError("requirement_unmet", `needs ${cost.ap} AP, has ${ap}`);
  return { ...sheet, ap: ap - cost.ap };
}

export function can_carry(combatant: Combatant, inventory: readonly HeldItem[]): boolean {
  void combatant;
  return inventory.length <= DATA.inventory_max;
}

export function use_item(combatant: Combatant, item: HeldItem, rng: Rng): null {
  // Quest items have no rules effect when used.
  void combatant;
  void item;
  void rng;
  return null;
}

export const QUEST: RulesSystem = {
  ID,
  VERSION,
  SCHEMAS,
  ORDERING,
  STANDARD_CHECKS,
  MODULES,
  SPATIAL,
  configure,
  create_character,
  instantiate,
  instantiate_structure,
  speed,
  senses,
  reach,
  summary,
  check,
  attack,
  harm,
  heal,
  rest,
  tick,
  session_end,
  initiative,
  pay_cost,
  can_carry,
  use_item,
};
