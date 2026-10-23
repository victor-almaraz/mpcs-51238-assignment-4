// Lookups into the pinned bundles: templates, conditions, abilities, tables, NPCs, flags, and
// locations. Derived once per Bundles object; bundles never change during an instance.

import type { AdventureBundle, FlagDef, LocationDef, NpcDef } from "../bundle/adventure";
import type { AbilityDef, ConditionDef, EntityTemplate, SettingBundle, TableEntry, TerrainDef } from "../bundle/setting";
import type { Bundles } from "./types";

export interface Content {
  bundles: Bundles;
  adventure: AdventureBundle;
  template(ref: string): EntityTemplate;
  hasTemplate(ref: string): boolean;
  condition(id: string): ConditionDef | undefined;
  ability(ref: string): AbilityDef | undefined;
  table(ref: string): TableEntry[] | undefined;
  npc(id: string): NpcDef | undefined;
  flag(id: string): FlagDef | undefined;
  location(id: string): LocationDef | undefined;
  terrain(id: string): TerrainDef | undefined;
  /** The first setting, in material order, whose manifest declares `generation`. */
  generationSetting: SettingBundle | undefined;
}

const cache = new WeakMap<Bundles, Content>();

function split(ref: string): [string, string] {
  const i = ref.indexOf(":");
  return [ref.slice(0, i), ref.slice(i + 1)];
}

export function content(bundles: Bundles): Content {
  const hit = cache.get(bundles);
  if (hit) return hit;
  const byNamespace = new Map<string, SettingBundle>(bundles.settings.map((s) => [s.namespace, s]));
  const adventure = bundles.adventure;
  const lookup = <T>(ref: string, pick: (b: SettingBundle | AdventureBundle) => Record<string, T> | undefined): T | undefined => {
    const [ns, key] = split(ref);
    const bundle = ns === adventure.namespace ? adventure : byNamespace.get(ns);
    return bundle ? pick(bundle)?.[key] : undefined;
  };
  const conditions = new Map<string, ConditionDef>();
  const terrain = new Map<string, TerrainDef>();
  // Conditions and terrain are not namespaced; the first definition in material order wins.
  for (const s of bundles.settings) {
    for (const [id, c] of Object.entries(s.conditions)) if (!conditions.has(id)) conditions.set(id, c);
    for (const [id, t] of Object.entries(s.manifest.terrain)) if (!terrain.has(id)) terrain.set(id, t);
  }
  const c: Content = {
    bundles,
    adventure,
    template(ref) {
      const t = lookup(ref, (b) => b.entities);
      if (!t) throw new Error(`unknown template ${ref}`);
      return t;
    },
    hasTemplate: (ref) => lookup(ref, (b) => b.entities) !== undefined,
    condition: (id) => conditions.get(id),
    ability: (ref) => lookup(ref, (b) => ("abilities" in b ? b.abilities : undefined)),
    table: (ref) => lookup(ref, (b) => ("tables" in b ? (b.tables as Record<string, TableEntry[]>) : undefined)),
    npc: (id) => adventure.npcs[id],
    flag: (id) => adventure.flags[id],
    location: (id) => adventure.locations[id],
    terrain: (id) => terrain.get(id),
    generationSetting: bundles.settings.find((s) => s.manifest.generation !== undefined),
  };
  cache.set(bundles, c);
  return c;
}
