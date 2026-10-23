// Module `stash` (docs/systems/cadmium.md, "Module stash"): carried containers raise capacity.

import type { HeldItem } from "../contract";
import { MODULE_DATA } from "./data";

const STASH = MODULE_DATA.stash;

const slotsOf = (item: HeldItem): number | undefined => {
  const s = item.stats.slots;
  return typeof s === "number" && Number.isInteger(s) && s >= 2 && s <= 24 ? s : undefined;
};

/**
 * Holds while the inventory has at most `base_slots` items plus the `slots` of carried items with
 * `slots`, and at most `max_containers` such items. Each such item also occupies one slot itself.
 */
export function stashCanCarry(inventory: readonly HeldItem[]): boolean {
  let capacity = STASH.base_slots;
  let containers = 0;
  for (const item of inventory) {
    const slots = slotsOf(item);
    if (slots === undefined) continue;
    containers++;
    capacity += slots;
  }
  return containers <= STASH.max_containers && inventory.length <= capacity;
}
