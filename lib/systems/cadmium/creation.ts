// Cadmium's module fields on the creation form (docs/systems/cadmium.md, Components: the forms extend
// Quest's, adding module fields when the campaign enables their module). Characters are created
// without modules, so these describe what the sheet holds once the character joins the campaign's
// instance; they are not choices and are never submitted.

import { MODULE_DATA, MODULE_IDS } from "./data";

export interface ModuleField {
  module: (typeof MODULE_IDS)[number];
  label: string;
  value: string;
  note: string;
}

const { armor, stash } = MODULE_DATA;

const FIELDS: Record<ModuleField["module"], ModuleField> = {
  // Module armor, Sheet: default { value: 0, max: modules.armor.max }; Donning; Harm; Rest.
  armor: {
    module: "armor",
    label: "Armor",
    value: `0/${armor.max}`,
    note: `Starts empty. Donning armor fills the pool up to ${armor.max}; harm takes armor before hit points; rests do not restore it.`,
  },
  // Module stash, Limit: base_slots plus the slots of carried items with slots, at most max_containers.
  stash: {
    module: "stash",
    label: "Carrying limit",
    value: `${stash.base_slots} items`,
    note: `Each carried container adds its slots, up to ${stash.max_containers} containers.`,
  },
};

/** The fields for the modules a campaign enables, in canonical module order; unknown ids are ignored. */
export function creationModuleFields(enabled: readonly string[]): ModuleField[] {
  return MODULE_IDS.filter((m) => enabled.includes(m)).map((m) => FIELDS[m]);
}
