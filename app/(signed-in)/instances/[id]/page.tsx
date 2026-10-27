// Instance lobby (app-flow.md, Instance lobby): header, party with Add my character, the author's
// controls shown only when the status allows them, and the next session with RSVP buttons. The party
// shows the adventure's player range; Start and Resume wait for its minimum, and Add character stops at
// its maximum. An ended game lists every character that played. A detail page
// (docs/design/README.md, Game lobby): the party in the main column, the next session and the
// game's facts in the aside.
import { CalendarClock, History, Pause, Play, Square, UserMinus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { getCampaign } from "@/lib/api/campaigns";
import { listCharacters } from "@/lib/api/characters";
import { getInstance, instanceRoster, lobbyKey, missingFor, playerRange } from "@/lib/api/instances";
import { accepted, systemView } from "@/lib/api/systems";
import { addCharacterAction, instanceControlAction, removeCharacterAction } from "@/lib/server/campaign-actions";
import { NextSession } from "@/components/next-session";
import { LiveLobby } from "@/components/play/live-lobby";
import { Rsvp, answerOf } from "@/components/rsvp";
import { formatWhen } from "@/components/when";
import { orNotFound, requestTime } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverDeps } from "@/lib/server/coordinator";
import { nextOccurrence } from "@/lib/server/sessions";
import { serverStore } from "@/lib/server/supabase";
import { plural } from "@/lib/text";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink, type Variant } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Card, Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select, described } from "@/components/ui/field";
import { ICON, ICON_DENSE, IconButton } from "@/components/ui/icon-button";
import { DescriptionList, List, ListRow } from "@/components/ui/list";
import { Notice } from "@/components/ui/notice";
import { Page, PageHeader, Section, WithAside } from "@/components/ui/page";

const CONTROLS: Record<string, { control: string; label: string; danger?: boolean }[]> = {
  lobby: [{ control: "start", label: "Start" }],
  active: [
    { control: "pause", label: "Pause" },
    { control: "end", label: "End", danger: true },
  ],
  paused: [
    { control: "resume", label: "Resume" },
    { control: "end", label: "End", danger: true },
  ],
  ended: [],
};

const characters = (n: number) => plural(n, "character");

const ICONS: Record<string, ReactNode> = {
  start: <Play {...ICON_DENSE} />,
  resume: <Play {...ICON_DENSE} />,
  pause: <Pause {...ICON_DENSE} />,
  end: <Square {...ICON_DENSE} />,
};

export default async function Lobby({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pick?: string }> }) {
  const { id } = await params;
  // Play sends a user without a character here with ?pick=1 (app-flow.md, Redirect rules): the picker opens focused.
  const pick = (await searchParams).pick === "1";
  const user = await pageUser();
  const store = serverStore();
  const { instance } = await orNotFound(getInstance(serverDeps(), user.id, { instance_id: id }));
  const campaign = await getCampaign(store, user.id, instance.campaign_id);
  const author = campaign.author_id === user.id;
  const names = new Map(campaign.members.map((m) => [m.user_id, m.display_name]));
  const ended = instance.status === "ended";
  // An ended game's characters have left it; the party is every character that played.
  const party = ended ? await instanceRoster(store, user.id, instance.id) : instance.characters;
  const range = await playerRange(store, instance).catch(() => null);
  const n = instance.characters.length;
  const full = range !== null && n >= range[1];
  const short = range !== null && n < range[0];
  const open = instance.status === "lobby" || instance.status === "paused";
  // The user's characters for the system; those whose abilities need a setting the game lacks are listed disabled with the reason.
  const mine = open
    ? await Promise.all(
        (await listCharacters(store, user.id, { status: "available", archived: false, limit: 100 })).items
          .filter((c) => accepted(instance.system).includes(c.system))
          .map(async (c) => ({ ...c, missing: await missingFor(store, instance, c.sheet) })),
      )
    : [];
  const joinable = mine.filter((c) => c.missing.length === 0);
  const now = requestTime();
  const next = await nextOccurrence(store, user.id, instance.id, now);
  const controls = (author && CONTROLS[instance.status]) || [];
  // Start and Resume need the adventure's player range: the reason shows under the party's count.
  const blocked = (control: string) => (control === "start" && range !== null && (n < range[0] || n > range[1])) || (control === "resume" && short);
  const rangeText = range && (range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`);
  const reason = short ? `The adventure needs at least ${characters(range![0])}; add ${characters(range![0] - n)} to ${instance.status === "paused" ? "resume" : "start"}.` : null;
  const playing = instance.status === "active" && instance.characters.some((c) => c.user_id === user.id);
  const system = systemView(instance.system);
  // One primary per view: Enter game when the viewer plays, else Start or Resume.
  const variant = (c: { control: string; danger?: boolean }): Variant => (c.danger ? "danger" : !playing && (c.control === "start" || c.control === "resume") ? "primary" : "secondary");

  return (
    <Page>
      {!ended && <LiveLobby instanceId={instance.id} status={instance.status} stateKey={lobbyKey(instance)} playing={instance.characters.some((c) => c.user_id === user.id)} />}
      <PageHeader
        crumbs={[
          { label: "Campaigns", href: "/campaigns" },
          { label: campaign.title, href: `/campaigns/${campaign.id}` },
        ]}
        title={instance.name}
        status={<StatusBadge status={instance.status} />}
        description={`${system.title} ${instance.system_version}`}
        actions={
          (controls.length > 0 || playing) && (
            <>
              {playing && (
                <ButtonLink href={`/instances/${instance.id}/play`} variant="primary" icon={<Play {...ICON_DENSE} />}>
                  Enter game
                </ButtonLink>
              )}
              {controls.map((c) => (
                <ActionForm key={c.control} action={instanceControlAction}>
                  <input type="hidden" name="instance_id" value={instance.id} />
                  <input type="hidden" name="control" value={c.control} />
                  {c.control === "end" ? (
                    <ConfirmButton
                      label={c.label}
                      icon={ICONS[c.control]}
                      title={`End ${instance.name}?`}
                      description="The game stops for everyone and cannot be resumed. Characters go back to their players with their sheets, and the history stays."
                      confirm="End game"
                    />
                  ) : (
                    <Button type="submit" variant={variant(c)} icon={ICONS[c.control]} disabled={blocked(c.control)} {...(blocked(c.control) ? { "aria-describedby": "party-range", title: reason ?? undefined } : {})}>
                      {c.label}
                    </Button>
                  )}
                </ActionForm>
              ))}
            </>
          )
        }
      />
      <WithAside
        aside={
          <>
            <Panel title="Next session">
              {next ? (
                <>
                  <NextSession startsAt={next.starts_at} timezone={user.timezone} now={now} />
                  {!ended && <Rsvp instanceId={instance.id} occurrence={next} mine={answerOf(next, user.id)} label={`Your answer for ${formatWhen(next.starts_at, user.timezone)}`} />}
                </>
              ) : (
                <p className="text-muted">None scheduled.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/instances/${instance.id}/schedule`} size="sm" icon={<CalendarClock {...ICON_DENSE} />}>
                  Schedule
                </ButtonLink>
                <ButtonLink href={`/instances/${instance.id}/history`} size="sm" icon={<History {...ICON_DENSE} />}>
                  History
                </ButtonLink>
              </div>
            </Panel>
            <Panel title="Game">
              <DescriptionList
                items={[
                  ["Campaign", campaign.title],
                  ["System", `${system.title} ${instance.system_version}`],
                  ["Modules", instance.modules.length > 0 ? instance.modules.map((m) => system.modules.find((x) => x.id === m)?.title ?? m).join(", ") : "None"],
                  ["Party", ended ? `${characters(party.length)} played` : rangeText ? `${n} of ${rangeText} characters` : characters(n)],
                ]}
              />
            </Panel>
          </>
        }
      >
        <Section
          id="party"
          title="Party"
          description={
            <span id="party-range">
              {ended ? `${characters(party.length)} played in this game.` : rangeText ? `${n} of ${rangeText} characters. ` : ""}
              {!ended && (reason ?? (full ? "The party is full." : ""))}
            </span>
          }
        >
          {party.length === 0 ? (
            <EmptyState icon={<Users {...ICON} />}>No characters yet.</EmptyState>
          ) : (
            <List>
              {party.map((c) => (
                <ListRow
                  key={c.id}
                  title={c.name}
                  meta={names.get(c.user_id) ?? ""}
                  badge={c.user_id === user.id ? <Badge tone="accent">Yours</Badge> : undefined}
                  actions={
                    open &&
                    (c.user_id === user.id || author) && (
                      // Stacked under the name on compact screens, the icon sits on the name's edge.
                      <ActionForm action={removeCharacterAction} className="-ml-2 sm:ml-0">
                        <input type="hidden" name="instance_id" value={instance.id} />
                        <input type="hidden" name="character_id" value={c.id} />
                        <IconButton type="submit" tone="danger" tip="end" label={`Remove ${c.name}`} icon={<UserMinus {...ICON} />} />
                      </ActionForm>
                    )
                  }
                />
              ))}
            </List>
          )}
        </Section>
        {pick && !open && !ended && (
          <Notice title="You have no character in this game." className="mb-6">
            Characters join while the game is in the lobby or paused.
          </Notice>
        )}
        {open && (
          <Section id="add-character" title="Add character">
            {pick && !full && joinable.length > 0 && (
              <Notice title="Add a character to play." className="mb-4">
                Choose one of your characters below.
              </Notice>
            )}
            {full ? (
              <p className="text-muted">The party is full: the adventure takes at most {characters(range![1])}.</p>
            ) : mine.length === 0 ? (
              <EmptyState
                action={
                  <ButtonLink href={`/characters/new?system=${instance.system}&campaign=${instance.campaign_id}&next=${encodeURIComponent(`/instances/${instance.id}`)}`} size="sm">
                    Create a character
                  </ButtonLink>
                }
              >
                You have no available {system.title} character.
              </EmptyState>
            ) : (
              <Card>
                <ActionForm action={addCharacterAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <input type="hidden" name="instance_id" value={instance.id} />
                  <Field
                    id="add-character-select"
                    label="Your character"
                    hint={joinable.length < mine.length ? "Characters with abilities or items from a setting this game does not include cannot join it." : undefined}
                    className="sm:max-w-sm sm:flex-1"
                  >
                    <Select {...described("add-character-select", { hint: joinable.length < mine.length })} name="character_id" autoFocus={pick} defaultValue={joinable[0]?.id}>
                      {mine.map((c) => (
                        <option key={c.id} value={c.id} disabled={c.missing.length > 0}>
                          {c.missing.length > 0 ? `${c.name} (needs ${c.missing.join(" and ")})` : c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" variant={controls.length > 0 ? "secondary" : "primary"} className="h-10" disabled={joinable.length === 0}>
                    Add my character
                  </Button>
                </ActionForm>
              </Card>
            )}
          </Section>
        )}
      </WithAside>
    </Page>
  );
}
