// Campaigns hub (docs/design/README.md, Page layouts: Hub): the campaigns the user runs and plays in,
// New campaign, and the code form for an invitation or invite link; then archived campaigns, with
// Unarchive for the author, and the author's recently deleted campaigns, with Restore
// (SPEC_ISSUES.md#campaign-unarchive).
import { Archive, Castle, Plus, Trash2 } from "lucide-react";
import { RestoreForm, UnarchiveForm } from "@/components/campaign-lifecycle";
import { formatWhen } from "@/components/when";
import { List, ListRow } from "@/components/ui/list";
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
      <Section id="join" title="Join a campaign" description="With the code or link from an invitation.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <EnterCode />
          </div>
        </div>
      </Section>
      <Section id="archived" title={`Archived (${archived.items.length})`} description="Archived campaigns keep their games and members, and accept no new games, members, or invitations.">
        {archived.items.length === 0 ? (
          <EmptyState icon={<Archive {...ICON} />}>No archived campaigns. Archive a campaign from its editor; you can unarchive it here.</EmptyState>
        ) : (
          <List>
            {archived.items.map((c) => (
              <ListRow
                key={c.id}
                icon={<Archive {...ICON_DENSE} />}
                title={c.title}
                href={`/campaigns/${c.id}`}
                meta={c.author_id === user.id ? "You run it" : "You play in it"}
                actions={c.author_id === user.id ? <UnarchiveForm campaignId={c.id} title={c.title} /> : undefined}
              />
            ))}
          </List>
        )}
      </Section>
      {deleted.length > 0 && (
        <Section id="deleted" title={`Recently deleted (${deleted.length})`} description="Deleted campaigns are hidden from every member. You can restore one for 30 days; within 90 days it is erased with its games.">
          <List>
            {deleted.map((c) => (
              <ListRow
                key={c.id}
                icon={<Trash2 {...ICON_DENSE} />}
                title={c.title}
                meta={`Deleted ${formatWhen(c.deleted_at, user.timezone)} · restore until ${formatWhen(c.restorable_until, user.timezone)}`}
                actions={<RestoreForm campaignId={c.id} title={c.title} />}
              />
            ))}
          </List>
        </Section>
      )}
    </Page>
  );
}
