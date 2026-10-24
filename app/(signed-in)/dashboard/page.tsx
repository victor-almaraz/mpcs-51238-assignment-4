// Dashboard (app-flow.md, "Dashboard"; docs/design/README.md, Screens: Dashboard): a hub. Needs you,
// the next session with RSVP, your games, then campaigns, characters, and adventures.
import Link from "next/link";
import { DateTile, ElementTile, elementSymbol } from "@/components/ui/tile";
import { ArrowRight, BookOpen, CalendarClock, CalendarDays, Castle, Check, CircleAlert, Gamepad2, History, Play, Plus, Users } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { CampaignCard, CharacterCard, DraftCard, EnterCode, gamesOf, plural, type GameItem } from "@/components/dashboard/hub";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardGrid } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE, IconLink } from "@/components/ui/icon-button";
import { List, ListRow } from "@/components/ui/list";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { cx } from "@/components/ui/cx";
import { formatWhen } from "@/components/when";
import { listCampaigns } from "@/lib/api/campaigns";
import { listCharacters } from "@/lib/api/characters";
import { listOccurrences } from "@/lib/api/schedules";
import { listDrafts } from "@/lib/api/drafts";
import { rsvpAction } from "@/lib/server/schedule-actions";
import { requestTime } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

/** How many cards each grid shows here; the hub pages list the rest. */
const SHOWN = 6;
const RESPONSES = ["yes", "maybe", "no"] as const;
type Response = (typeof RESPONSES)[number];
const RSVP = "inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-control border px-3 text-label font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55";

interface Upcoming {
  session_id: string;
  occurrence_start: string;
  starts_at: string;
  ends_at: string;
  status: string;
  instance: GameItem;
  mine: Response | undefined;
}

/** Yes, Maybe, No for one occurrence; the current answer is pressed and ticked. */
function Rsvp({ o, label }: { o: Upcoming; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-start gap-1">
      {RESPONSES.map((r) => {
        const pressed = o.mine === r;
        return (
          <ActionForm key={r} action={rsvpAction}>
            <input type="hidden" name="instance_id" value={o.instance.id} />
            <input type="hidden" name="session_id" value={o.session_id} />
            <input type="hidden" name="occurrence_start" value={o.occurrence_start} />
            <input type="hidden" name="response" value={r} />
            <button type="submit" aria-pressed={pressed} className={cx(RSVP, pressed ? "border-accent bg-accent-soft text-accent" : "border-border bg-page text-ink hover:bg-desk")}>
              {pressed && <Check {...ICON_DENSE} />}
              {r[0]!.toUpperCase() + r.slice(1)}
            </button>
          </ActionForm>
        );
      })}
    </div>
  );
}

function SectionAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={buttonClass("quiet", "sm")}>
      {label}
      <ArrowRight {...ICON_DENSE} />
    </Link>
  );
}

function GameCard({ game: i, userId }: { game: GameItem; userId: string }) {
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
        <StatusBadge status={i.status} />
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
  const [characters, campaigns] = await Promise.all([listCharacters(store, user.id, { limit: 100 }), listCampaigns(store, user.id, { archived: false, limit: 100 })]);
  const instances = await gamesOf(store, user.id, campaigns.items);
  const active = instances.filter((i) => i.status !== "ended");
  const finished = instances.filter((i) => i.status === "ended");
  const drafts = await listDrafts(store, user.id, { limit: 20 });
  const where = new Map(instances.map((i) => [i.id, i.name]));
  // The next 7 days across all instances (app-flow.md, Dashboard: Upcoming sessions).
  const now = requestTime();
  const window = { from: new Date(now).toISOString(), to: new Date(now + 7 * 86_400_000).toISOString() };
  const sessions = await Promise.all(active.map((i) => listOccurrences(store, user.id, { instance_id: i.id, ...window }).then((list) => list.map((o) => ({ ...o, instance: i })))));
  const upcoming: Upcoming[] = sessions
    .flat()
    .filter((o) => o.status !== "cancelled")
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map((o) => ({ ...o, mine: RESPONSES.find((r) => o.rsvps[r].includes(user.id)) }));
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
                actions={<Rsvp o={o} label={`RSVP for ${o.instance.name}, ${when(o)}`} />}
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
              <div className="flex min-w-0 items-start gap-4">
                <DateTile date={new Date(next.starts_at)} timeZone={user.timezone} size="lg" tone={live || Date.parse(next.starts_at) - now < 86_400_000 ? "pigment" : "accent"} />
                <div className="min-w-0">
                  <p className="tabular text-heading font-semibold text-ink">{when(next)}</p>
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
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <span className="text-caption text-muted">{next.mine ? "Your answer" : "Will you come?"}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Rsvp o={next} label={`RSVP for ${next.instance.name}, ${when(next)}`} />
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
                    actions={<Rsvp o={o} label={`RSVP for ${o.instance.name}, ${when(o)}`} />}
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
              <GameCard key={i.id} game={i} userId={user.id} />
            ))}
          </CardGrid>
        )}
        {finished.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-label font-medium text-muted">Finished</h3>
            <List>
              {finished.map((i) => (
                <ListRow key={i.id} icon={<History {...ICON_DENSE} />} title={i.name} href={`/instances/${i.id}/history`} meta={i.campaign} badge={<StatusBadge status="ended" label="Ended" />} />
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
