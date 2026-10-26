// Module `armor` (docs/systems/cadmium.md, "Module armor"): a consumable pool that absorbs harm
// before hit points.

import type { Rng } from "../../rng";
import { RulesError, type Combatant, type HeldItem, type ItemResolution, type Sheet } from "../contract";
import { emptyPart, harmSheet, merge, resolution, type Meter, type Part } from "../quest";
import { MODULE_DATA } from "./data";

const ARMOR = MODULE_DATA.armor;

const isInt = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;

/** The pool on a sheet, or the default `{ value: 0, max: armor.max }` for a character without one. */
export function pool(target: Combatant, sheet: Sheet): Meter | undefined {
  const own = sheet.armor as Meter | undefined;
  if (own && isInt(own.value, 0) && isInt(own.max, 0)) return own;
  return target.kind === "character" ? { value: 0, max: ARMOR.max } : undefined;
}

export const defaultPool = (): Meter => ({ value: 0, max: ARMOR.max });

/** A creature's starting pool from `system_stats.armor`. */
export function creaturePool(armor: unknown): Meter | undefined {
  if (armor === undefined) return undefined;
  if (!isInt(armor, 0) || armor > 40) throw new RulesError("invalid_call", "cadmium creature: armor must be 0 to 40");
  return { value: armor, max: armor };
}

/**
 * Harm through the pool: `armor.value` falls first and hit points take the remainder. Harm of a
 * type in `bypass_types` skips the pool; at death's door the pool absorbs only with
 * `absorbs_at_deaths_door`.
 */
export function armorHarmSheet(target: Combatant, sheet: Sheet, amount: number, rng: Rng, type: string | null): Part {
  const harmable = sheet.status === "active" || (target.kind === "character" && sheet.status === "deaths_door");
  const p = target.kind === "structure" || !harmable || amount <= 0 ? undefined : pool(target, sheet);
  const skips =
    p === undefined ||
    p.value === 0 ||
    (type !== null && ARMOR.bypass_types.includes(type)) ||
    (sheet.status === "deaths_door" && !ARMOR.absorbs_at_deaths_door);
  if (skips) return harmSheet(target, sheet, amount, rng);
  const absorbed = Math.min(p.value, amount);
  const value = p.value - absorbed;
  const after: Sheet = { ...sheet, armor: { ...p, value } };
  const part = emptyPart();
  part.events.push({ type: "resource_changed", target: target.id, resource: "armor", delta: -absorbed, value });
  // cadmium.md, "Module armor": `damaged` is emitted only for the remainder that reaches hit points.
  const rest = harmSheet(target, after, amount - absorbed, rng);
  merge(part, rest);
  part.updates[target.id] = rest.updates[target.id] ?? after;
  return part;
}

/** Donning: adds the item's points to the pool up to `max` and consumes the item. Null for items without `armor`. */
export function donArmor(combatant: Combatant, item: HeldItem): ItemResolution | null {
  const points = item.stats.armor;
  if (points === undefined) return null;
  if (!isInt(points, 1)) throw new RulesError("invalid_call", "cadmium item: armor must be 1 to 40");
  const p = pool(combatant, combatant.sheet) ?? defaultPool();
  if (p.value >= p.max) throw new RulesError("requirement_unmet", "the armor pool is full");
  const value = Math.min(p.max, p.value + points);
  const part = emptyPart();
  part.updates[combatant.id] = { ...combatant.sheet, armor: { ...p, value } };
  part.events.push({ type: "resource_changed", target: combatant.id, resource: "armor", delta: value - p.value, value });
  return { ...resolution(null, part), consume: true };
}
