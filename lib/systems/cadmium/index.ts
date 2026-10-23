// The Cadmium rules system (docs/systems/cadmium.md): Quest with the optional modules `armor` and
// `stash`. Every contract function delegates to Quest; a module overrides or extends a function only
// while it is enabled, so `configure([])` returns results identical to Quest's.

import type { Rng } from "../../rng";
import { RulesError, type Combatant, type HeldItem, type RulesSystem, type Sheet } from "../contract";
import * as quest from "../quest";
import { armorHarmSheet, creaturePool, defaultPool, donArmor, pool } from "./armor";
import { DATA, MODULE_DATA, MODULE_IDS, schemasFor, type ModuleId } from "./data";
import { stashCanCarry } from "./stash";

export { DATA, MODULE_DATA, MODULE_IDS, schemasFor };
export type { ModuleId };

export const ID = "cadmium";
export const VERSION = "1.0.0";

/** A configured Cadmium system; `ENABLED` lists its modules in canonical order. */
export interface CadmiumSystem extends RulesSystem {
  readonly ENABLED: readonly ModuleId[];
}

function canonical(modules: readonly string[]): ModuleId[] {
  for (const m of modules) {
    if (!(MODULE_IDS as readonly string[]).includes(m)) throw new RulesError("invalid_call", `cadmium has no module '${m}'`);
  }
  return MODULE_IDS.filter((m) => modules.includes(m));
}

const cache = new Map<string, CadmiumSystem>();

function build(enabled: readonly ModuleId[]): CadmiumSystem {
  const key = enabled.join(",");
  const hit = cache.get(key);
  if (hit) return hit;
  const armor = enabled.includes("armor");
  const stash = enabled.includes("stash");

  const system: CadmiumSystem = {
    ID,
    VERSION,
    SCHEMAS: schemasFor(enabled),
    ORDERING: quest.ORDERING,
    STANDARD_CHECKS: quest.STANDARD_CHECKS,
    MODULES: MODULE_IDS,
    SPATIAL: quest.SPATIAL,
    ENABLED: enabled,

    configure: (modules) => build(canonical(modules)),

    create_character(name: string, choices: unknown, rng: Rng): Sheet {
      const sheet = quest.create_character(name, choices, rng);
      return armor ? { ...sheet, armor: defaultPool() } : sheet;
    },

    instantiate(stats: unknown, rng: Rng): Sheet {
      if (!armor || typeof stats !== "object" || stats === null || !("armor" in stats)) return quest.instantiate(stats, rng);
      const { armor: points, ...rest } = stats as Record<string, unknown>;
      const sheet: Sheet = quest.instantiate(rest, rng);
      return { ...sheet, armor: creaturePool(points) };
    },

    instantiate_structure: quest.instantiate_structure,
    speed: quest.speed,
    senses: quest.senses,
    reach: quest.reach,

    summary(sheet: Sheet) {
      const out = quest.summary(sheet);
      const p = sheet.armor as quest.Meter | undefined;
      if (armor && p) out.resources = { ...out.resources, armor: `${p.value}/${p.max}` };
      return out;
    },

    check: quest.check,
    attack: armor ? quest.attackWith(armorHarmSheet) : quest.attack,

    harm(target: Combatant, amount: number, rng: Rng, type: string | null) {
      return armor ? quest.resolution(null, armorHarmSheet(target, target.sheet, amount, rng, type)) : quest.harm(target, amount, rng, type);
    },

    heal: quest.heal,
    rest: quest.rest,
    tick: quest.tick,
    session_end: quest.session_end,
    initiative: quest.initiative,
    pay_cost: quest.pay_cost,

    can_carry(combatant: Combatant, inventory: readonly HeldItem[]): boolean {
      return stash ? stashCanCarry(inventory) : quest.can_carry(combatant, inventory);
    },

    use_item(combatant: Combatant, item: HeldItem, rng: Rng) {
      return armor ? donArmor(combatant, item) : quest.use_item(combatant, item, rng);
    },
  };
  cache.set(key, system);
  return system;
}

/** Cadmium with no module enabled. */
export const CADMIUM: CadmiumSystem = build([]);

export { pool as armorPool };
