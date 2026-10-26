// Character creation (app-flow.md, Character creation and editor; docs/design/README.md, Character
// creation): the System step first; once a system is chosen, its form's steps and summary.
import { notFound } from "next/navigation";
import { listCampaigns } from "@/lib/api/campaigns";
import { abilityOptions } from "@/lib/api/characters";
import { campaignChoices } from "@/lib/systems/creation";
import { creationRules, listSystems } from "@/lib/api/systems";
import { withDescriptions } from "@/lib/server/ability-descriptions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { systemUi } from "@/components/systems";
import { CardLink } from "@/components/ui/card";
import { Page, PageHeader, Section } from "@/components/ui/page";

const crumbs = [{ label: "Characters", href: "/characters" }];

export default async function NewCharacter({ searchParams }: { searchParams: Promise<{ system?: string; campaign?: string }> }) {
  const user = await pageUser();
  const { system, campaign } = await searchParams;
  const systems = listSystems();
  if (!system) {
    const keep = campaign ? `&campaign=${encodeURIComponent(campaign)}` : "";
    return (
      <Page>
        <PageHeader crumbs={crumbs} title="New character" description="Choose a rules system. Role, abilities, and a name come next." />
        <Section id="step-system" title="System">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {systems.map((s) => (
              <li key={s.id} className="grid">
                <CardLink href={`/characters/new?system=${s.id}${keep}`} title={s.title} meta={s.credit} />
              </li>
            ))}
          </ul>
        </Section>
      </Page>
    );
  }
  const chosen = systems.find((s) => s.id === system);
  const ui = systemUi(system);
  if (!chosen || !ui) notFound();
  const rules = creationRules(system);
  const store = serverStore();
  // A system with modules shows module fields for the chosen campaign (app-flow.md): offer the caller's campaigns.
  const [abilities, campaigns] = await Promise.all([
    abilityOptions(store, system).then(withDescriptions),
    chosen.modules.length > 0 ? listCampaigns(store, user.id, { archived: false, limit: 100 }).then((p) => campaignChoices(p.items, system)) : [],
  ]);
  return (
    <Page>
      <PageHeader crumbs={crumbs} title={`New ${chosen.title} character`} description={`Choose a role, ${rules.starting_abilities} abilities, and a name. You can change any step before you create the character.`} />
      <ui.CreationForm
        system={system}
        roles={rules.roles}
        abilities={abilities}
        count={rules.starting_abilities}
        hp={rules.hp_max}
        ap={rules.ap_start}
        campaigns={campaigns}
        campaign={campaign}
        systemTitle={chosen.title}
        systemCredit={chosen.credit}
        systemHref={campaign ? `/characters/new?campaign=${encodeURIComponent(campaign)}` : "/characters/new"}
      />
    </Page>
  );
}
