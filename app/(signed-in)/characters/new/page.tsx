// Character creation (app-flow.md, Character creation and editor; docs/design/README.md, Character
// creation): the System step first; once a system is chosen, its form's steps and summary, with the
// caller's campaigns whose games take the system, each with its settings.
import { notFound } from "next/navigation";
import { listSystems } from "@/lib/api/systems";
import { creationData } from "@/lib/server/creation-data";
import { safeNext } from "@/lib/server/forms";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { systemUi } from "@/components/systems";
import { CardLink } from "@/components/ui/card";
import { Page, PageHeader, Section } from "@/components/ui/page";

const crumbs = [{ label: "Characters", href: "/characters" }];

export default async function NewCharacter({ searchParams }: { searchParams: Promise<{ system?: string; campaign?: string; next?: string }> }) {
  const user = await pageUser();
  const { system, campaign, next } = await searchParams;
  // The page creation returns to, such as the campaign it was started from: only a path in this site.
  const returnTo = next && safeNext(next) === next ? next : undefined;
  // The campaign and the return path, kept when the system is chosen or changed.
  const kept = new URLSearchParams({ ...(campaign ? { campaign } : {}), ...(returnTo ? { next: returnTo } : {}) }).toString();
  const systems = listSystems();
  if (!system) {
    const keep = kept ? `&${kept}` : "";
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
  const data = await creationData(serverStore(), user.id, system);
  return (
    <Page>
      <PageHeader crumbs={crumbs} title={`New ${chosen.title} character`} description={`Choose a role, ${data.count} abilities, and a name. You can change any step before you create the character.`} />
      <ui.CreationForm
        {...data}
        campaign={campaign}
        returnTo={returnTo}
        systemTitle={chosen.title}
        systemCredit={chosen.credit}
        systemHref={kept ? `/characters/new?${kept}` : "/characters/new"}
      />
    </Page>
  );
}
