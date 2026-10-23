// Engine types: instance state (data-model.md, "Instance state"), tool calls (tools.md), and
// results (architecture.md, "Engine interface").

import type { AdventureBundle } from "../bundle/adventure";
import type { SettingBundle } from "../bundle/setting";
import type { Requirement } from "../bundle/types/defs";
import type { Cell, Footprint } from "../grid";
import type { GameEvent, PendingChoice, RulesSystem, Sheet } from "../systems";

export type { GameEvent, Cell, Footprint };

export type Mode = "exploration" | "combat";
export type LightLevel = "bright" | "dim" | "dark";

export type ErrorCode =
  | "invalid_call"
  | "unknown_id"
  | "not_reachable"
  | "not_your_turn"
  | "invalid_in_mode"
  | "requirement_unmet"
  | "blocked_by_condition"
  | "choice_pending"
  | "instance_not_active";

export interface EngineError {
  code: ErrorCode;
  detail: string;
}

export type Result = { ok: true; events: GameEvent[]; state: State } | { ok: false; error: EngineError };

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/** The materials and rules an instance plays: the configured system and the pinned bundles. */
export interface Bundles {
  system: RulesSystem;
  /** Setting bundles in campaign material order. */
  settings: readonly SettingBundle[];
  adventure: AdventureBundle;
}

export interface ConditionState {
  id: string;
  /** Rounds left, or null until removed. */
  remaining: number | null;
}

export interface RoomState {
  label: string;
  tags: string[];
  light: LightLevel;
  area: [number, number, number, number][];
  visited: boolean;
  /** Generated rooms only. */
  role?: string;
  depth?: number;
}

export interface LinkState {
  label: string;
  at: Cell;
  to: { location: string; link: string };
}

export interface LocationState {
  rows: string[];
  terrain: Record<string, { obstructs: ("movement" | "sight")[]; cost: number }>;
  /** Single-character terrain legend: `.` floor, `#` wall, ` ` void, and further characters. */
  legend: Record<string, string>;
  rooms: Record<string, RoomState>;
  links: Record<string, LinkState>;
  /** One string per row, `1` for each cell the party has seen. */
  seen: string[];
  /** Generated locations: room aliases `entry`, `boss`, anchor ids, and link ids, mapped to room ids. */
  aliases?: Record<string, string>;
}

// SPEC_ISSUES.md#engine-state-fields: `carrier`, `hostile`, `behavior`, `contents`, `uses`, and
// `next_entity` are not in data-model.md's example state.
export interface EntityState {
  ref: string;
  kind: "creature" | "item" | "container" | "fixture" | "obstacle" | "door";
  /** Location and anchor cell; absent while carried. */
  location?: string;
  at?: Cell;
  /** The character or container holding the item. */
  carrier?: string;
  /** NPC id for entities placed from an NPC. */
  npc?: string;
  open?: boolean;
  locked?: boolean;
  lock?: Requirement;
  sheet?: Sheet;
  conditions: ConditionState[];
  /** Overrides the template's `hostile` tag after `set_hostile`. */
  hostile?: boolean;
  behavior?: "aggressive" | "defensive" | "passive" | "fleeing";
  lit?: boolean;
  uses?: number | null;
  /** Item entity ids held by a container. */
  contents?: string[];
}

export interface CharacterState {
  user_id?: string;
  location: string;
  at: Cell;
  sheet: Sheet;
  conditions: ConditionState[];
  /** Carried item entity ids, in the order they were acquired. */
  items: string[];
}

export interface Declaration {
  tool: string;
  args: Record<string, unknown>;
}

export interface RoundState {
  number: number;
  mode: Mode;
  resolution: "sequential" | "simultaneous";
  participants: string[];
  declarations: Record<string, Declaration>;
  initiative: string[] | null;
  order: string[] | null;
  turn_index: number | null;
}

export interface State {
  rng_counter: number;
  mode: Mode;
  clock: { turn: number };
  locations: Record<string, LocationState>;
  entities: Record<string, EntityState>;
  characters: Record<string, CharacterState>;
  flags: Record<string, boolean | number | string>;
  character_flags: Record<string, Record<string, boolean | number | string>>;
  stages: Record<string, string>;
  fired_triggers: string[];
  /** Released secrets, as `npc.secret`. */
  revealed: string[];
  round: RoundState;
  pending_choices: Record<string, PendingChoice>;
  combat_area: string[];
  combatants: string[];
  improvise_streak: Record<string, number>;
  ended: { ending: string | null } | null;
  /** Counter for engine-created entity ids `_e<n>`. */
  next_entity: number;
}

/** A character as it joins an instance: its id, owner, and system sheet. */
export interface JoiningCharacter {
  id: string;
  user_id?: string;
  sheet: Sheet;
}

/** The illumination grid of one location, row-major. */
export type Illumination = LightLevel[];
