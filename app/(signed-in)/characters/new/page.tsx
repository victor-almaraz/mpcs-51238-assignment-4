// Character creation (app-flow.md, Character creation and editor): choose a system, then fill its form.
import Link from "next/link";
import { notFound } from "next/navigation";
import { listCampaigns } from "@/lib/api/campaigns";
import { abilityOptions } from "@/lib/api/characters";
import { campaignChoices } from "@/lib/systems/creation";
import { creationRules, listSystems } from "@/lib/api/systems";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { systemUi } from "@/components/systems";

export default async function NewCharacter({ searchParams }: { searchParams: Promise<{ system?: string; campaign?: string }> }) {
  const user = await pageUser();
  const { system, campaign } = await searchParams;
  const systems = listSystems();
  if (!system) {
    return (
      <div className="mx-auto max-w-page px-6 py-10">
        <h1 className="font-display text-title">New character</h1>
        <p className="mt-4">Choose a rules system.</p>
        <ul className="mt-4 flex flex-col gap-4">
          {systems.map((s) => (
            <li key={s.id}>
              <Link href={`/characters/new?system=${s.id}`} className="font-display text-heading text-accent underline">
                {s.title}
              </Link>
              <p className="font-ui text-caption text-muted">{s.credit}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const chosen = systems.find((s) => s.id === system);
  const ui = systemUi(system);
  if (!chosen || !ui) notFound();
  const rules = creationRules(system);
  const store = serverStore();
  // A system with modules shows module fields for the chosen campaign (app-flow.md): offer the caller's campaigns.
  const [abilities, campaigns] = await Promise.all([
    abilityOptions(store, system),
    chosen.modules.length > 0 ? listCampaigns(store, user.id, { archived: false, limit: 100 }).then((p) => campaignChoices(p.items, system)) : [],
  ]);
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">New {chosen.title} character</h1>
      <p className="mt-2 font-ui text-caption text-muted">{chosen.credit}</p>
      <ui.CreationForm system={system} roles={rules.roles} abilities={abilities} count={rules.starting_abilities} campaigns={campaigns} campaign={campaign} />
    </div>
  );
}
