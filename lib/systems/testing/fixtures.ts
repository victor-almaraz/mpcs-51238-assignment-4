// Test fixtures shared by the conformance suite and per-system rule cases.

import { Rng } from "../../rng";
import type { Combatant, HeldItem, RulesSystem, Sheet, Situation } from "../contract";

export const NO_SITUATION: Situation = { advantage: 0, modifier: 0, tags: [] };

export const ABILITIES = ["crypt:a1", "crypt:a2", "crypt:a3", "crypt:a4", "crypt:a5", "crypt:a6"];

export function character(system: RulesSystem, id = "c_1", patch: Partial<Sheet> = {}): Combatant {
  const sheet = system.create_character("Vale", { role: "spy", abilities: ABILITIES }, new Rng(0));
  return { id, side: "characters", kind: "character", sheet: { ...sheet, ...patch } as Sheet, items: {} };
}

export function creature(system: RulesSystem, stats: Record<string, unknown> = { template: "minion" }, id = "e_1"): Combatant {
  return { id, side: "entities", kind: "creature", sheet: system.instantiate(stats, new Rng(0)), items: {} };
}

export function structure(system: RulesSystem, hp = 3, id = "s_1"): Combatant {
  return { id, side: "entities", kind: "structure", sheet: system.instantiate_structure({ hp }), items: {} };
}

export const WRENCH: HeldItem = { ref: "base:wrench", stats: { weapon: true, damage: 2 } };

/**
 * The first seed, counting from 0, whose d20 rolls from counter 0 begin with `rolls`.
 * Lets a test choose the dice without depending on the generator's internals.
 */
export function seedFor(...rolls: number[]): number {
  for (let seed = 0; seed < 5_000_000; seed++) {
    const rng = new Rng(seed);
    if (rolls.every((r) => rng.die(20) === r)) return seed;
  }
  throw new Error(`no seed gives d20 rolls ${rolls.join(", ")}`);
}

/** Deep-freezes a value, so that a mutation inside the code under test throws. */
export function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) frozen(v);
  }
  return value;
}

export const clone = <T>(value: T): T => structuredClone(value);
