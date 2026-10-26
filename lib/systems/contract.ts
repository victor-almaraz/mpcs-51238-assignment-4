// The rules-system contract (docs/systems/README.md, "Contract"; engine.md, "Combatants and sheets",
// "Situation", "Ordering policy").

import type { Rng } from "../rng";

export type Tier = "critical_failure" | "failure" | "partial" | "success" | "critical_success";

/** Ascending string order by UTF-16 code unit, the order of `<`: the same in every locale, unlike `localeCompare`. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Outcomes that pass requirements. */
export const PASSING: ReadonlySet<Tier> = new Set<Tier>(["partial", "success", "critical_success"]);

export type Side = "characters" | "entities";
export type CombatantKind = "character" | "creature" | "structure";

/** A sheet is owned by the rules system; the engine reads only `status`. */
export interface Sheet {
  status: string;
  [field: string]: unknown;
}

export interface Combatant<S extends Sheet = Sheet> {
  id: string;
  side: Side;
  kind: CombatantKind;
  sheet: S;
  /** Each carried item's ref mapped to its `system_stats`. */
  items: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface Situation {
  advantage: number;
  modifier: number;
  tags: readonly string[];
}

/** A held item as passed to `attack`, `use_item`, and `can_carry`. */
export interface HeldItem {
  ref: string;
  stats: Readonly<Record<string, unknown>>;
}

/** An event in the log: a type and a flat payload (engine.md, "Events"). */
export interface GameEvent {
  type: string;
  [field: string]: unknown;
}

/** A single-key engine effect, such as `{ drop_item: { target, ref } }` (engine.md, "Effects"). */
export type Effect = Readonly<Record<string, unknown>>;

export interface Roll {
  label: string;
  dice: number[];
  total: number;
}

export interface ChoiceOption {
  id: string;
  label: string;
  updates: Record<string, Sheet>;
  events: GameEvent[];
  effects: Effect[];
}

export interface PendingChoice {
  actor: string;
  prompt: string;
  options: ChoiceOption[];
}

export interface Resolution {
  outcome: Tier | null;
  rolls: Roll[];
  /** New sheets keyed by combatant id; the engine replaces each sheet. */
  updates: Record<string, Sheet>;
  events: GameEvent[];
  effects: Effect[];
  choice: PendingChoice | null;
}

/** `use_item` may also ask for the item to be removed. */
export interface ItemResolution extends Resolution {
  consume?: boolean;
}

export type ErrorCode = "invalid_call" | "requirement_unmet";

export class RulesError extends Error {
  readonly code: ErrorCode;
  readonly detail: string;

  constructor(code: ErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "RulesError";
    this.code = code;
    this.detail = detail;
  }
}

export type SortKey =
  | { key: "side"; first: Side }
  | { key: "initiative" }
  | { key: "tool_priority"; tools: readonly string[] };

export interface ModePolicy {
  resolution: "sequential" | "simultaneous";
  order: readonly SortKey[];
  reroll: "never" | "per_round" | "per_combat";
}

export interface OrderingPolicy {
  exploration: ModePolicy;
  combat: ModePolicy;
}

export interface Spatial {
  metric: "chebyshev" | "manhattan";
  approach: boolean;
  lighting: boolean;
}

export type SchemaKind = "character" | "creature" | "item" | "ability" | "check" | "structure";

export interface Summary {
  health: string;
  status: string;
  resources?: Record<string, string>;
}

/** A rules system. Every function is pure and draws randomness only from the `Rng` it receives. */
export interface RulesSystem {
  readonly ID: string;
  readonly VERSION: string;
  readonly SCHEMAS: Readonly<Record<SchemaKind, object>> & Readonly<Record<string, object>>;
  readonly ORDERING: OrderingPolicy;
  readonly STANDARD_CHECKS: Readonly<{ search: Readonly<Record<string, unknown>> } & Record<string, Readonly<Record<string, unknown>>>>;
  readonly MODULES: readonly string[];
  readonly SPATIAL: Spatial;

  configure(modules: readonly string[]): RulesSystem;
  create_character(name: string, choices: unknown, rng: Rng): Sheet;
  instantiate(stats: unknown, rng: Rng): Sheet;
  instantiate_structure(stats: unknown): Sheet;
  speed(combatant: Combatant): number;
  senses(combatant: Combatant): { darkvision: number };
  reach(combatant: Combatant, weapon: HeldItem | null): { range: number | null; tag: "melee" | "ranged" };
  summary(sheet: Sheet): Summary;
  check(actor: Combatant, spec: unknown, situation: Situation, rng: Rng): Resolution;
  attack(attacker: Combatant, defender: Combatant, weapon: HeldItem | null, situation: Situation, rng: Rng): Resolution;
  harm(target: Combatant, amount: number, rng: Rng, type: string | null): Resolution;
  heal(target: Combatant, amount: number): Resolution;
  rest(target: Combatant, kind: string): Resolution;
  tick(target: Combatant): Resolution;
  session_end(target: Combatant): Resolution;
  initiative(participants: readonly Combatant[], rng: Rng): string[];
  pay_cost(sheet: Sheet, cost: unknown): Sheet;
  can_carry(combatant: Combatant, inventory: readonly HeldItem[]): boolean;
  use_item(combatant: Combatant, item: HeldItem, rng: Rng): ItemResolution | null;
}

/** A resolution with nothing rolled and nothing changed. */
export function emptyResolution(): Resolution {
  return { outcome: null, rolls: [], updates: {}, events: [], effects: [], choice: null };
}
