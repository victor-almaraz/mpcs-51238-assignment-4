// The campaign a creation form may be filled for (app-flow.md, Character creation and editor: "A system
// with modules shows module fields only when ... for character creation the chosen campaign, enables the
// module"). The choice is information for the form; `create_character` takes no campaign.

/** A campaign the creation form offers, with the modules it enables. */
export interface CampaignChoice {
  id: string;
  title: string;
  modules: string[];
}

interface CampaignLike {
  id: string;
  title: string;
  system: string;
  modules: readonly string[];
  archived?: boolean;
}

/**
 * The caller's unarchived campaigns of `system`, the ones whose modules are this system's own. A
 * campaign of another system that accepts this one enables that system's modules, not this one's.
 */
export function campaignChoices(campaigns: readonly CampaignLike[], system: string): CampaignChoice[] {
  return campaigns.filter((c) => c.system === system && !c.archived).map((c) => ({ id: c.id, title: c.title, modules: [...c.modules] }));
}

/** The chosen campaign, or undefined when `id` names none of the choices. */
export function chosenCampaign(choices: readonly CampaignChoice[], id: string | undefined): CampaignChoice | undefined {
  return id ? choices.find((c) => c.id === id) : undefined;
}
