// Instance lobby (app-flow.md, Instance lobby): header, party with Add my character, the author's
// controls shown only when the status allows them, and the next session. A detail page
// (docs/design/README.md, Game lobby): the party in the main column, the next session and the
// game's facts in the aside.
import { CalendarClock, History, Pause, Play, Square, Users } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { getCampaign } from "@/lib/api/campaigns";
import { listCharacters } from "@/lib/api/characters";
import { getInstance } from "@/lib/api/instances";
import { accepted, systemView } from "@/lib/api/systems";
import { addCharacterAction, instanceControlAction, removeCharacterAction } from "@/lib/server/campaign-actions";
import { listOccurrences } from "@/lib/api/schedules";
import { formatWhen } from "@/components/when";
import { orNotFound, requestTime } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverDeps } from "@/lib/server/coordinator";
import { serverStore } from "@/lib/server/supabase";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink, type Variant } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select, described } from "@/components/ui/field";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { DescriptionList, List, ListRow } from "@/components/ui/list";
import { Page, PageHeader, Section, WithAside } from "@/components/ui/page";
import { DateTile } from "@/components/ui/tile";

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

const ICONS: Record<string, ReactNode> = {
  start: <Play {...ICON_DENSE} />,
  resume: <Play {...ICON_DENSE} />,
  pause: <Pause {...ICON_DENSE} />,
  end: <Square {...ICON_DENSE} />,
};

export default async function Lobby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const store = serverStore();
  const { instance } = await orNotFound(getInstance(serverDeps(), user.id, { instance_id: id }));
  const campaign = await getCampaign(store, user.id, instance.campaign_id);
  const author = campaign.author_id === user.id;
  const names = new Map(campaign.members.map((m) => [m.user_id, m.display_name]));
  const mine = (await listCharacters(store, user.id, { status: "available", limit: 100 })).items.filter((c) => accepted(instance.system).includes(c.system));
  const open = instance.status === "lobby" || instance.status === "paused";
  const now = requestTime();
  const next = (await listOccurrences(store, user.id, { instance_id: instance.id, from: new Date(now).toISOString(), to: new Date(now + 92 * 86_400_000).toISOString() })).find((o) => o.status !== "cancelled");
  const controls = (author && CONTROLS[instance.status]) || [];
  const playing = instance.status === "active" && instance.characters.some((c) => c.user_id === user.id);
  const system = systemView(instance.system);
  // One primary per view: Enter game when the viewer plays, else Start or Resume.
  const variant = (c: { control: string; danger?: boolean }): Variant => (c.danger ? "danger" : !playing && (c.control === "start" || c.control === "resume") ? "primary" : "secondary");

  return (
    <Page>
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
                  <Button type="submit" variant={variant(c)} icon={ICONS[c.control]}>
                    {c.label}
                  </Button>
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
                <div className="flex items-center gap-3">
                  <DateTile date={new Date(next.starts_at)} timeZone={user.timezone} tone={Date.parse(next.starts_at) - now < 86_400_000 ? "pigment" : "accent"} />
                  <p className="text-heading font-semibold text-ink">{formatWhen(next.starts_at, user.timezone)}</p>
                </div>
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
                  ["Party", `${instance.characters.length} character${instance.characters.length === 1 ? "" : "s"}`],
                ]}
              />
            </Panel>
          </>
        }
      >
        <Section id="party" title="Party">
          {instance.characters.length === 0 ? (
            <EmptyState icon={<Users {...ICON} />}>No characters yet.</EmptyState>
          ) : (
            <List>
              {instance.characters.map((c) => (
                <ListRow
                  key={c.id}
                  title={c.name}
                  meta={names.get(c.user_id) ?? ""}
                  badge={c.user_id === user.id ? <Badge tone="accent">Yours</Badge> : undefined}
                  actions={
                    open &&
                    (c.user_id === user.id || author) && (
                      <ActionForm action={removeCharacterAction}>
                        <input type="hidden" name="instance_id" value={instance.id} />
                        <input type="hidden" name="character_id" value={c.id} />
                        <Button type="submit" variant="danger" size="sm">
                          Remove<span className="sr-only"> {c.name}</span>
                        </Button>
                      </ActionForm>
                    )
                  }
                />
              ))}
            </List>
          )}
        </Section>
        {open && (
          <Section id="add-character" title="Add character">
            {mine.length === 0 ? (
              <EmptyState
                action={
                  <ButtonLink href={`/characters/new?system=${instance.system}`} size="sm">
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
                  <Field id="add-character-select" label="Your character" className="sm:max-w-sm sm:flex-1">
                    <Select {...described("add-character-select")} name="character_id">
                      {mine.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" variant={controls.length > 0 ? "secondary" : "primary"} className="h-10">
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
