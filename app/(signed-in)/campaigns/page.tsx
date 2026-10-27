// Campaigns hub (docs/design/README.md, Page layouts: Hub): the campaigns the user runs and plays in,
// New campaign, and the code form for an invitation or invite link; then archived campaigns, with
// Unarchive for the author, and the author's recently deleted campaigns, with Restore
// (app-flow.md, Characters, Campaigns, and My adventures).
import { Castle, Plus } from "lucide-react";
import { ArchivedSection, DeletedSection } from "@/components/lifecycle";
import { CampaignCard, EnterCode } from "@/components/dashboard/hub";
import { ButtonLink } from "@/components/ui/button";
import { CardGrid } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { listCampaigns, listDeletedCampaigns } from "@/lib/api/campaigns";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

export default async function Campaigns() {
  const user = await pageUser();
  const store = serverStore();
  const [campaigns, archived, deleted] = await Promise.all([
    listCampaigns(store, user.id, { archived: false, limit: 100 }),
    listCampaigns(store, user.id, { archived: true, limit: 100 }),
    listDeletedCampaigns(store, user.id),
  ]);
  const run = campaigns.items.filter((c) => c.author_id === user.id);
  const play = campaigns.items.filter((c) => c.author_id !== user.id);

  return (
    <Page>
      <PageHeader
        title="Campaigns"
        description="The campaigns you run and the ones you play in."
        actions={
          <ButtonLink href="/campaigns/new" variant="primary" icon={<Plus {...ICON_DENSE} />}>
            New campaign
          </ButtonLink>
        }
      />
      {campaigns.items.length === 0 ? (
        <EmptyState icon={<Castle {...ICON} />} className="mb-10">
          No campaigns yet. Create a campaign, or enter a code you were given.
        </EmptyState>
      ) : (
        <>
          <Section id="run" title={`You run (${run.length})`}>
            {run.length === 0 ? (
              <EmptyState icon={<Castle {...ICON} />}>You don&rsquo;t run a campaign yet. New campaign starts one.</EmptyState>
            ) : (
              <CardGrid>
                {run.map((c) => (
                  <CampaignCard key={c.id} campaign={c} userId={user.id} />
                ))}
              </CardGrid>
            )}
          </Section>
          <Section id="play" title={`You play (${play.length})`}>
            {play.length === 0 ? (
              <EmptyState icon={<Castle {...ICON} />}>You haven&rsquo;t joined a campaign yet. Enter the code from an invitation below.</EmptyState>
            ) : (
              <CardGrid>
                {play.map((c) => (
                  <CampaignCard key={c.id} campaign={c} userId={user.id} />
                ))}
              </CardGrid>
            )}
          </Section>
        </>
      )}
      <Section id="join" title="Join a campaign" description="With the code or link from an invitation.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <EnterCode />
          </div>
        </div>
      </Section>
      <ArchivedSection
        kind="campaign"
        items={archived.items.map((c) => ({ id: c.id, title: c.title, href: `/campaigns/${c.id}`, meta: c.author_id === user.id ? "You run it" : "You play in it", unarchive: c.author_id === user.id }))}
      />
      <DeletedSection kind="campaign" items={deleted} timezone={user.timezone} />
    </Page>
  );
}
