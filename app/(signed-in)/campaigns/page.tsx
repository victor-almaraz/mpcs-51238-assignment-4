// Campaigns hub (docs/design/README.md, Page layouts: Hub): the campaigns the user runs and plays in,
// New campaign, and the code form for an invitation or invite link.
import { Castle, Plus } from "lucide-react";
import { CampaignCard, EnterCode } from "@/components/dashboard/hub";
import { ButtonLink } from "@/components/ui/button";
import { CardGrid } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { listCampaigns } from "@/lib/api/campaigns";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

export default async function Campaigns() {
  const user = await pageUser();
  const campaigns = await listCampaigns(serverStore(), user.id, { archived: false, limit: 100 });
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
        <EmptyState icon={<Castle {...ICON} />}>No campaigns yet. Create a campaign, or enter a code you were given.</EmptyState>
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
      <div className="mt-2 max-w-form">
        <EnterCode />
      </div>
    </Page>
  );
}
