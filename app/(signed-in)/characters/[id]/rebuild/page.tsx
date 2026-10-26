// Change role and abilities (SPEC_ISSUES.md#character-rebuild): the system's creation form, filled with
// the character's choices, for a character that is available and has never joined a game.
import { notFound } from "next/navigation";
import { listCampaigns } from "@/lib/api/campaigns";
import { abilityOptions, characterRebuildable, getCharacter } from "@/lib/api/characters";
import { settingsOf } from "@/lib/api/instances";
import { accepted, creationRules, systemView } from "@/lib/api/systems";
import { campaignChoices } from "@/lib/systems/creation";
import { withDescriptions } from "@/lib/server/ability-descriptions";
import { orNotFound } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { systemUi } from "@/components/systems";
import { Page, PageHeader } from "@/components/ui/page";

export default async function RebuildCharacter({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const store = serverStore();
  const character = await orNotFound(getCharacter(store, user.id, id));
  const ui = systemUi(character.system);
  if (!ui || !(await characterRebuildable(store, user.id, id))) notFound();
  const system = systemView(character.system);
  const rules = creationRules(character.system);
  const [abilities, joined] = await Promise.all([abilityOptions(store, character.system).then(withDescriptions), listCampaigns(store, user.id, { archived: false, limit: 100 })]);
  const candidates = joined.items.filter((c) => accepted(c.system).includes(character.system));
  const campaigns = campaignChoices(await Promise.all(candidates.map(async (c) => ({ ...c, settings: await settingsOf(store, c.materials) }))), character.system, accepted);
  const sheet = character.sheet as unknown as { role: string; abilities: string[]; profile?: { manner?: string; look?: string } };
  return (
    <Page>
      <PageHeader
        crumbs={[
          { label: "Characters", href: "/characters" },
          { label: character.name, href: `/characters/${character.id}` },
        ]}
        title="Change role and abilities"
        description="Until the character first joins a game, you can choose again. The sheet is built anew from these choices."
      />
      <ui.CreationForm
        system={character.system}
        roles={rules.roles}
        abilities={abilities}
        count={rules.starting_abilities}
        hp={rules.hp_max}
        ap={rules.ap_start}
        campaigns={campaigns}
        systemTitle={system.title}
        systemCredit={system.credit}
        rebuild={{ id: character.id, name: character.name, role: sheet.role, abilities: sheet.abilities, manner: sheet.profile?.manner, look: sheet.profile?.look }}
      />
    </Page>
  );
}
