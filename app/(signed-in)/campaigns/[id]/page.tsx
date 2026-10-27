// Campaign overview (app-flow.md, Route map: description, members, instances, materials; Instance
// lobby: Create instance lives here, author only). A detail page (docs/design/README.md, Campaign):
// tabs Overview, Members, Invitations (author only), and Materials; the aside holds the system,
// modules, adventure, and the next session.
import { Gamepad2, LogOut, Pencil, UserPlus } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ArchivedNotice } from "@/components/lifecycle";
import { NextSession } from "@/components/next-session";
import { formatWhen } from "@/components/when";
import { getCampaign } from "@/lib/api/campaigns";
import { listInstances } from "@/lib/api/instances";
import { systemView } from "@/lib/api/systems";
import { createInstanceAction, leaveCampaignAction } from "@/lib/server/campaign-actions";
import { ConfirmButton } from "@/components/ui/confirm";
import { orNotFound, origin, requestTime } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { nextOccurrence } from "@/lib/server/sessions";
import { serverStore } from "@/lib/server/supabase";
import { plural } from "@/lib/text";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, TextInput, described } from "@/components/ui/field";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { DescriptionList, List, ListRow } from "@/components/ui/list";
import { Page, PageHeader, Section, WithAside } from "@/components/ui/page";
import { Tabs } from "@/components/ui/tabs";
import { InvitationsPanel, MembersPanel } from "./panels";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const store = serverStore();
  const campaign = await orNotFound(getCampaign(store, user.id, id));
  const instances = await listInstances(store, user.id, campaign.id);
  const author = campaign.author_id === user.id;
  const system = systemView(campaign.system);
  // The next session of each game that has not ended, as the lobby shows it.
  const now = requestTime();
  const nextOf = new Map(await Promise.all(instances.filter((i) => i.status !== "ended").map(async (i) => [i.id, await nextOccurrence(store, user.id, i.id, now)] as const)));
  const upcoming = instances
    .map((i) => ({ instance: i, next: nextOf.get(i.id) }))
    .filter((x): x is { instance: (typeof instances)[number]; next: NonNullable<typeof x.next> } => !!x.next)
    .sort((a, b) => Date.parse(a.next.starts_at) - Date.parse(b.next.starts_at))[0];
  const moduleTitle = new Map(system.modules.map((m) => [m.id, m.title]));
  const adventure = campaign.materials.find((m) => m.kind === "adventure");
  const settings = campaign.materials.filter((m) => m.kind === "setting");
  const linkCode = "invite_link_code" in campaign ? (campaign.invite_link_code ?? null) : null;

  const overview = (
    <>
      {campaign.description && (
        <Section id="about" title="About">
          <p className="max-w-prose whitespace-pre-line">{campaign.description}</p>
        </Section>
      )}
      <Section id="games" title="Games">
        {instances.length === 0 ? (
          <EmptyState icon={<Gamepad2 {...ICON} />}>No games yet.{author && !campaign.archived && " Create one below."}</EmptyState>
        ) : (
          <List>
            {instances.map((i) => {
              const next = nextOf.get(i.id);
              return (
                <ListRow
                  key={i.id}
                  title={i.name}
                  href={`/instances/${i.id}`}
                  badge={<StatusBadge status={i.status} />}
                  meta={
                    <>
                      {plural(i.characters.length, "character")}
                      {next && ` · Next session ${formatWhen(next.starts_at, user.timezone)}`}
                    </>
                  }
                />
              );
            })}
          </List>
        )}
      </Section>
      {author && !campaign.archived && (
        <Section id="new-game" title="New game">
          <Card>
            <ActionForm action={createInstanceAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <Field id="game-name" label="Game name" className="sm:max-w-sm sm:flex-1">
                <TextInput {...described("game-name")} name="name" required maxLength={80} placeholder="Tuesday group" />
              </Field>
              <Button type="submit" variant="primary" className="h-10 self-start sm:self-auto">
                Create game
              </Button>
            </ActionForm>
          </Card>
        </Section>
      )}
    </>
  );

  const materials = (
    <Section id="materials" title="Materials" description="The adventure and settings new games are created with.">
      {campaign.materials.length === 0 ? (
        <EmptyState>No materials.</EmptyState>
      ) : (
        <List>
          {[...campaign.materials]
            .sort((a, b) => Number(b.kind === "adventure") - Number(a.kind === "adventure"))
            .map((m) => (
              <ListRow key={`${m.kind}:${m.id}`} title={<span className="font-mono text-code">{m.id}</span>} meta={`Version ${m.version}`} badge={<Badge tone={m.kind === "adventure" ? "accent" : "neutral"}>{m.kind}</Badge>} />
            ))}
        </List>
      )}
    </Section>
  );

  const tabs = [
    { id: "overview", label: "Overview", panel: overview },
    { id: "members", label: `Members (${campaign.members.length})`, panel: <MembersPanel campaignId={campaign.id} members={campaign.members} author={author} /> },
    ...(author ? [{ id: "invitations", label: "Invitations", panel: <InvitationsPanel campaignId={campaign.id} userId={user.id} archived={campaign.archived} linkCode={linkCode} origin={await origin()} timeZone={user.timezone} /> }] : []),
    { id: "materials", label: "Materials", panel: materials },
  ];

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: "Campaigns", href: "/campaigns" }]}
        title={campaign.title}
        status={campaign.archived ? <StatusBadge status="archived" /> : undefined}
        description={`${system.title} ${campaign.system_versions} · ${author ? "You are the author" : "You are a player"}`}
        actions={
          author ? (
            <ButtonLink href={`/campaigns/${campaign.id}/edit`} icon={<Pencil {...ICON_DENSE} />}>
              Edit campaign
            </ButtonLink>
          ) : (
            <ActionForm action={leaveCampaignAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <ConfirmButton
                label="Leave campaign"
                icon={<LogOut {...ICON_DENSE} />}
                title={`Leave ${campaign.title}?`}
                description="Your characters leave its games, and you need a new invitation or the invite link to come back."
                confirm="Leave"
              />
            </ActionForm>
          )
        }
      />
      {campaign.archived && <ArchivedNotice kind="campaign" id={campaign.id} unarchive={author} className="mb-6" />}
      <WithAside
        aside={
          <>
            <Panel title="Next session">
              {upcoming ? (
                <NextSession startsAt={upcoming.next.starts_at} timezone={user.timezone} now={now}>
                  <p className="text-caption text-muted">
                    {upcoming.instance.name} ·{" "}
                    <Link href={`/instances/${upcoming.instance.id}/schedule`} className="text-accent underline">
                      Schedule
                    </Link>
                  </p>
                </NextSession>
              ) : (
                <p className="text-muted">None scheduled.</p>
              )}
            </Panel>
            <Panel title="Campaign">
              <DescriptionList
                items={[
                  ["System", `${system.title} ${campaign.system_versions}`],
                  ["Modules", campaign.modules.length > 0 ? campaign.modules.map((m) => moduleTitle.get(m) ?? m).join(", ") : "None"],
                  ["Adventure", adventure ? <span key="a" className="font-mono text-code">{`${adventure.id} ${adventure.version}`}</span> : "None"],
                  ["Settings", settings.length > 0 ? settings.map((s) => s.id).join(", ") : "None"],
                  ["Members", String(campaign.members.length)],
                ]}
              />
              <p className="text-caption text-muted">{system.credit}</p>
              {!campaign.archived && (
                <ButtonLink href={`/characters/new?system=${campaign.system}&campaign=${campaign.id}`} size="sm" icon={<UserPlus {...ICON_DENSE} />} className="self-start">
                  New character for this campaign
                </ButtonLink>
              )}
            </Panel>
          </>
        }
      >
        <Tabs label="Campaign" tabs={tabs} />
      </WithAside>
    </Page>
  );
}
