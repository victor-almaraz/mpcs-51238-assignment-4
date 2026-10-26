// Quest rules data and schemas, read from the specification at build time (docs/systems/quest.md).

import data from "../../../docs/spec/systems/quest/data.json";
import ability from "../../../docs/spec/systems/quest/ability.schema.json";
import character from "../../../docs/spec/systems/quest/character.schema.json";
import check from "../../../docs/spec/systems/quest/check.schema.json";
import creature from "../../../docs/spec/systems/quest/creature.schema.json";
import item from "../../../docs/spec/systems/quest/item.schema.json";
import structure from "../../../docs/spec/systems/quest/structure.schema.json";
import type { Tier } from "../contract";

export interface Setback {
  id: string;
  label: string;
  harm_actor?: number;
  lose_ap?: number;
  drop_item?: boolean;
}

export interface QuestData {
  confirm: string[];
  roles: string[];
  hp_max: number;
  inventory_max: number;
  starting_abilities: number;
  tiers: { min: number; tier: Tier }[];
  damage: { weapon: number; unarmed: number };
  npc_templates: Record<string, number>;
  npc_attack: Record<string, number>;
  setbacks: { tough_choice: Setback[]; severe: Setback[]; failure: Setback[] };
  ap_start: number;
  ap_award_per_session: number;
  spatial: {
    metric: "chebyshev" | "manhattan";
    speed: number;
    melee_reach: number;
    ranged_range: number | null;
    approach: boolean;
    lighting: boolean;
    darkvision: number;
  };
}

export const DATA = data as QuestData;

export const SCHEMAS = { character, creature, item, ability, check, structure } as const;
