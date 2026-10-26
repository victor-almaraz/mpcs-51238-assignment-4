// The campaign a creation form may be filled for (app-flow.md, Character creation and editor: "A system
// with modules shows module fields only when ... for character creation the chosen campaign, enables the
// module"; SPEC_ISSUES.md#creation-chosen-campaign). With a campaign chosen, the form offers only the
// abilities of the campaign's settings, so the character can join its games. `create_character` takes
// no campaign; the server action checks the abilities against the chosen one.

/** A campaign the creation form offers: the modules it enables for this system, and its settings. */
export interface CampaignChoice {
  id: string;
  title: string;
  modules: string[];
  settings: { namespace: string; title: string }[];
}

interface CampaignLike {
  id: string;
  title: string;
  system: string;
  modules: readonly string[];
  archived?: boolean;
  settings: readonly { namespace: string; title: string }[];
}

/**
 * The caller's unarchived campaigns whose games take a `system` character: those of a system whose
 * `accepts(system)` list includes it. Only a campaign of `system` itself enables this system's modules.
 */
export function campaignChoices(campaigns: readonly CampaignLike[], system: string, accepts: (campaignSystem: string) => readonly string[]): CampaignChoice[] {
  return campaigns
    .filter((c) => !c.archived && accepts(c.system).includes(system))
    .map((c) => ({ id: c.id, title: c.title, modules: c.system === system ? [...c.modules] : [], settings: c.settings.map((x) => ({ ...x })) }));
}

/** The chosen campaign, or undefined when `id` names none of the choices. */
export function chosenCampaign(choices: readonly CampaignChoice[], id: string | undefined): CampaignChoice | undefined {
  return id ? choices.find((c) => c.id === id) : undefined;
}

/** The abilities a character for `campaign` may take: those of its settings; every one without a campaign. */
export function abilitiesFor<T extends { ref: string }>(abilities: readonly T[], campaign: CampaignChoice | undefined): T[] {
  if (!campaign) return [...abilities];
  const namespaces = new Set(campaign.settings.map((s) => s.namespace));
  return abilities.filter((a) => namespaces.has(a.ref.slice(0, a.ref.indexOf(":"))));
}

/**
 * A role's quick start: the abilities one setting tags for that role alone, when that setting has
 * exactly `count` of them. Settings are taken in the order given; abilities other settings tag for the
 * role do not count, so a second setting with one more such ability leaves the quick start intact.
 */
export function quickStartFor(role: string, abilities: readonly { ref: string; roles: readonly string[]; setting: string }[], count: number): string[] {
  const bySetting = new Map<string, string[]>();
  for (const a of abilities) if (a.roles.length === 1 && a.roles[0] === role) bySetting.set(a.setting, [...(bySetting.get(a.setting) ?? []), a.ref]);
  return [...bySetting.values()].find((refs) => refs.length === count) ?? [];
}
