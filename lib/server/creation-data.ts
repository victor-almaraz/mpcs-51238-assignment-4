// What a system's creation form needs, for creating a character and for rebuilding one: the system's
// rules, its abilities with their descriptions, and the caller's campaigns whose games take the
// system, each with its settings.
import { listCampaigns } from "../api/campaigns";
import { abilityOptions } from "../api/characters";
import { settingsOf } from "../api/instances";
import { accepted, creationRules } from "../api/systems";
import { campaignChoices } from "../systems/creation";
import type { Store } from "../store";
import { withDescriptions } from "./ability-descriptions";

/** The creation form's props that come from the system and the caller's campaigns. */
export async function creationData(store: Store, userId: string, system: string) {
  const rules = creationRules(system);
  const [abilities, joined] = await Promise.all([abilityOptions(store, system).then(withDescriptions), listCampaigns(store, userId, { archived: false, limit: 100 })]);
  const candidates = joined.items.filter((c) => accepted(c.system).includes(system));
  const campaigns = campaignChoices(await Promise.all(candidates.map(async (c) => ({ ...c, settings: await settingsOf(store, c.materials) }))), system, accepted);
  return { system, roles: rules.roles, abilities, count: rules.starting_abilities, hp: rules.hp_max, ap: rules.ap_start, campaigns };
}
