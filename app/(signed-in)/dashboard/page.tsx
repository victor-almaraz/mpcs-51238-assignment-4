// Dashboard (app-flow.md, "Dashboard"; docs/design/README.md, Screens: Dashboard): a hub. Needs you,
// the next session with RSVP, your games, then campaigns, characters, and adventures. Sessions and games
// come from all the user's campaigns, archived ones included, as reminders and the calendar feed do;
// a game of an archived campaign is marked so. The campaign cards show unarchived campaigns.
import Link from "next/link";
import { ElementTile, elementSymbol } from "@/components/ui/tile";
import { ArrowRight, BookOpen, CalendarClock, CalendarDays, Castle, CircleAlert, Gamepad2, History, Play, Plus, Users } from "lucide-react";
import { CampaignCard, CharacterCard, DraftCard, EnterCode, gamesOf, type GameItem } from "@/components/dashboard/hub";
import { NextSession } from "@/components/next-session";
import { Rsvp, answerOf, type Response } from "@/components/rsvp";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardGrid } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE, IconLink } from "@/components/ui/icon-button";
import { List, ListRow } from "@/components/ui/list";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { formatWhen } from "@/components/when";
import { listCampaigns } from "@/lib/api/campaigns";
import { listCharacters } from "@/lib/api/characters";
import { listOccurrences } from "@/lib/api/schedules";
import { listDrafts } from "@/lib/api/drafts";
import { requestTime } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { plural } from "@/lib/text";

/** How many cards each grid shows here; the hub pages list the rest. */
const SHOWN = 6;

interface Upcoming {
  session_id: string;
  occurrence_start: string;
  starts_at: string;
  ends_at: string;
  status: string;
  instance: GameItem;
  mine: Response | undefined;
}

function SectionAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={buttonClass("quiet", "sm")}>
      {label}
      <ArrowRight {...ICON_DENSE} />
    </Link>
  );
}

function GameCard({ game: i, userId, archived }: { game: GameItem; userId: string; archived: boolean }) {
  const mine = i.characters.filter((c) => c.user_id === userId).map((c) => c.name);
  const action = i.status === "active" ? { href: `/instances/${i.id}/play`, label: "Continue", icon: <Play {...ICON_DENSE} /> } : { href: `/instances/${i.id}`, label: i.status === "lobby" ? "Open lobby" : "Open", icon: <ArrowRight {...ICON_DENSE} /> };
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ElementTile symbol={elementSymbol(i.name)} tone={i.status === "active" ? "pigment" : i.status === "lobby" ? "accent" : "neutral"} size="sm" />
          <div className="min-w-0">
            <h3 className="text-heading font-semibold text-ink">
              <Link href={`/instances/${i.id}`} className="hover:text-accent hover:underline">
                {i.name}
              </Link>
            </h3>
            <p className="text-caption text-muted">
              {i.campaign}
              {mine.length > 0 && (
                <>
                  {" · "}
                  <span className="whitespace-nowrap">as {mine.join(", ")}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {archived && <Badge>Archived campaign</Badge>}
          <StatusBadge status={i.status} />
        </div>
      </div>
      <div className="mt-auto">
        <ButtonLink href={action.href} size="sm" icon={action.icon} aria-label={`${action.label}: ${i.name}`}>
          {action.label}
        </ButtonLink>
      </div>
    </Card>
  );
}

export default async function Dashboard() {
  const user = await pageUser();
  const store = serverStore();
  const [characters, every, drafts] = await Promise.all([listCharacters(store, user.id, { archived: false, limit: 100 }), listCampaigns(store, user.id, { limit: 100 }), listDrafts(store, user.id, { archived: false, limit: 20 })]);
  const campaigns = { items: every.items.filter((c) => !c.archived) };
  const archived = new Set(every.items.filter((c) => c.archived).map((c) => c.id));
  const instances = await gamesOf(store, user.id, every.items);
  const active = instances.filter((i) => i.status !== "ended");
  const finished = instances.filter((i) => i.status === "ended");
  const where = new Map(instances.map((i) => [i.id, i.name]));
  // The next 7 days across all instances (app-flow.md, Dashboard: Upcoming sessions).
  const now = requestTime();
  const window = { from: new Date(now).toISOString(), to: new Date(now + 7 * 86_400_000).toISOString() };
  const sessions = await Promise.all(active.map((i) => listOccurrences(store, user.id, { instance_id: i.id, ...window }).then((list) => list.map((o) => ({ ...o, instance: i })))));
  const upcoming: Upcoming[] = sessions
    .flat()
    .filter((o) => o.status !== "cancelled")
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map((o) => ({ ...o, mine: answerOf(o, user.id) }));
  const [next, ...later] = upcoming;
  const live = next && next.instance.status === "active" && Date.parse(next.starts_at) <= now && now < Date.parse(next.ends_at);
  const unanswered = upcoming.filter((o) => !o.mine);
  const troubled = drafts.items.filter((d) => d.problems > 0);
  const when = (o: Upcoming) => formatWhen(o.starts_at, user.timezone);

  return (
    <Page>
      <PageHeader title="Dashboard" description={`Welcome back, ${user.display_name}. Times are in ${user.timezone}.`} />

      {(unanswered.length > 0 || troubled.length > 0) && (
        <Section id="needs-you" title="Needs you">
          <List className="border-accent-line">
            {unanswered.map((o) => (
              <ListRow
                key={`rsvp:${o.session_id}:${o.occurrence_start}`}
                icon={<CalendarClock {...ICON_DENSE} />}
                title={`RSVP for ${o.instance.name}`}
                href={`/instances/${o.instance.id}/schedule`}
                meta={`${when(o)} · ${o.instance.campaign}`}
                actions={<Rsvp instanceId={o.instance.id} occurrence={o} mine={o.mine} label={`RSVP for ${o.instance.name}, ${when(o)}`} />}
              />
            ))}
            {troubled.map((d) => (
              <ListRow
                key={`draft:${d.id}`}
                icon={<CircleAlert {...ICON_DENSE} className="text-danger" />}
                title={d.title}
                href={`/adventures/${d.id}/edit`}
                meta={`Adventure draft with ${plural(d.problems, "problem")}`}
                actions={
                  <ButtonLink href={`/adventures/${d.id}/edit`} size="sm" aria-label={`Fix problems in ${d.title}`}>
                    Fix problems
                  </ButtonLink>
                }
              />
            ))}
          </List>
        </Section>
      )}

      <Section id="next-session" title="Next session" description="Sessions in the next 7 days.">
        {!next ? (
          <EmptyState icon={<CalendarDays {...ICON} />}>No sessions in the next 7 days. A game&rsquo;s schedule page is where sessions are planned.</EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            <Card className="flex flex-col gap-4 border-accent-line sm:flex-row sm:items-center sm:justify-between">
              <NextSession startsAt={next.starts_at} timezone={user.timezone} now={now} live={live} size="lg">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/instances/${next.instance.id}/schedule`} className="font-medium text-accent hover:underline">
                    {next.instance.name}
                  </Link>
                  <span className="text-caption text-muted">{next.instance.campaign}</span>
                  {next.status === "moved" && <Badge tone="warning">Moved</Badge>}
                  {live && (
                    <Badge tone="pigment" dot>
                      Live now
                    </Badge>
                  )}
                </p>
              </NextSession>
              <div className="flex flex-col gap-2 sm:items-end">
                <span className="text-caption text-muted">{next.mine ? "Your answer" : "Will you come?"}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Rsvp instanceId={next.instance.id} occurrence={next} mine={next.mine} label={`RSVP for ${next.instance.name}, ${when(next)}`} />
                  {live && (
                    <ButtonLink href={`/instances/${next.instance.id}/play`} variant="primary" size="sm" icon={<Play {...ICON_DENSE} />}>
                      Join
                    </ButtonLink>
                  )}
                </div>
              </div>
            </Card>
            {later.length > 0 && (
              <List>
                {later.map((o) => (
                  <ListRow
                    key={`${o.session_id}:${o.occurrence_start}`}
                    title={o.instance.name}
                    href={`/instances/${o.instance.id}/schedule`}
                    meta={`${when(o)} · ${o.instance.campaign}`}
                    badge={o.status === "moved" ? <Badge tone="warning">Moved</Badge> : undefined}
                    actions={<Rsvp instanceId={o.instance.id} occurrence={o} mine={o.mine} label={`RSVP for ${o.instance.name}, ${when(o)}`} />}
                  />
                ))}
              </List>
            )}
          </div>
        )}
      </Section>

      <Section id="games" title="Your games">
        {active.length === 0 ? (
          <EmptyState icon={<Gamepad2 {...ICON} />}>No games in progress. Games start from a campaign&rsquo;s page.</EmptyState>
        ) : (
          <CardGrid>
            {active.map((i) => (
              <GameCard key={i.id} game={i} userId={user.id} archived={archived.has(i.campaign_id)} />
            ))}
          </CardGrid>
        )}
        {finished.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-label font-medium text-muted">Finished</h3>
            <List>
              {finished.map((i) => (
                <ListRow key={i.id} icon={<History {...ICON_DENSE} />} title={i.name} href={`/instances/${i.id}/history`} meta={archived.has(i.campaign_id) ? `${i.campaign} (archived)` : i.campaign} badge={<StatusBadge status="ended" label="Ended" />} />
              ))}
            </List>
          </div>
        )}
      </Section>

      <Section
        id="campaigns"
        title="Campaigns"
        actions={
          <>
            {campaigns.items.length > SHOWN && <SectionAll href="/campaigns" label={`All ${campaigns.items.length}`} />}
            <IconLink href="/campaigns/new" tone="outline" tip="end" label="New campaign" icon={<Plus {...ICON} />} />
          </>
        }
      >
        {campaigns.items.length === 0 ? (
          <EmptyState icon={<Castle {...ICON} />}>No campaigns yet. Create a campaign, or enter a code you were given.</EmptyState>
        ) : (
          <CardGrid>
            {campaigns.items.slice(0, SHOWN).map((c) => (
              <CampaignCard key={c.id} campaign={c} userId={user.id} />
            ))}
          </CardGrid>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <EnterCode />
          </div>
        </div>
      </Section>

      <Section
        id="characters"
        title="Characters"
        actions={
          <>
            {characters.items.length > SHOWN && <SectionAll href="/characters" label={`All ${characters.items.length}`} />}
            {characters.items.length > 0 && (
              <IconLink href="/characters/new" tone="outline" tip="end" label="New character" icon={<Plus {...ICON} />} />
            )}
          </>
        }
      >
        {characters.items.length === 0 ? (
          <EmptyState
            icon={<Users {...ICON} />}
            action={
              <IconLink href="/characters/new" tone="outline" tip="end" label="New character" icon={<Plus {...ICON} />} />
            }
          >
            No characters yet.
          </EmptyState>
        ) : (
          <CardGrid>
            {characters.items.slice(0, SHOWN).map((c) => (
              <CharacterCard key={c.id} character={c} where={where} />
            ))}
          </CardGrid>
        )}
      </Section>

      <Section
        id="adventures"
        title="Adventures"
        actions={
          <>
            {drafts.items.length > 0 && <SectionAll href="/adventures" label="All adventures" />}
            {drafts.items.length > 0 && (
              <IconLink href="/adventures/new" tone="outline" tip="end" label="New adventure" icon={<Plus {...ICON} />} />
            )}
          </>
        }
      >
        {drafts.items.length === 0 ? (
          <EmptyState
            icon={<BookOpen {...ICON} />}
            action={
              <IconLink href="/adventures/new" tone="outline" tip="end" label="New adventure" icon={<Plus {...ICON} />} />
            }
          >
            No adventures yet. Write one for your campaigns.
          </EmptyState>
        ) : (
          <CardGrid>
            {drafts.items.slice(0, SHOWN).map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </CardGrid>
        )}
      </Section>
    </Page>
  );
}
