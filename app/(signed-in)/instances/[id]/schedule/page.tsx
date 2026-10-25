// Schedule (app-flow.md, Schedule): occurrences from yesterday through the next 91 days grouped by week
// in the user's time zone, RSVPs by member, the author's session controls, Add to calendar, and
// Subscribe. A detail page (docs/design/README.md, Game lobby, schedule, history): the sessions in the
// main column; the calendar links and the author's New session form in the aside.
import { CalendarDays, CalendarPlus, Check, Rss } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { CopyButton } from "@/components/invite-form";
import { formatWhen, weekOf } from "@/components/when";
import { getCampaign } from "@/lib/api/campaigns";
import { getInstance } from "@/lib/api/instances";
import { getCalendarFeed, listOccurrences } from "@/lib/api/schedules";
import { serverDeps } from "@/lib/server/coordinator";
import { orNotFound, origin, requestTime } from "@/lib/server/pages";
import { cancelAction, createFeedAction, moveOccurrenceAction, rsvpAction, scheduleSessionAction } from "@/lib/server/schedule-actions";
import { pageUser } from "@/lib/server/session";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Choice, Field, Select, TextArea, TextInput, described, inputClass } from "@/components/ui/field";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Notice } from "@/components/ui/notice";
import { Page, PageHeader, Section, WithAside } from "@/components/ui/page";

const DAY = 86_400_000;
const RESPONSES = ["yes", "maybe", "no"] as const;
const word = (r: string) => r[0]!.toUpperCase() + r.slice(1);

export default async function Schedule({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const { store } = serverDeps();
  const { instance } = await orNotFound(getInstance(serverDeps(), user.id, { instance_id: id }));
  const campaign = await getCampaign(store, user.id, instance.campaign_id);
  const author = campaign.author_id === user.id;
  // SPEC_ISSUES.md#ended-instance-schedule: an ended game's sessions stay as a record, closed to answers and changes.
  const ended = instance.status === "ended";
  const names = new Map(campaign.members.map((m) => [m.user_id, m.display_name]));
  const now = requestTime();
  // list_occurrences takes a window of at most 92 days: from a day ago, so a session that just ended
  // still shows, to 91 days ahead.
  const from = now - DAY;
  const list = await listOccurrences(store, user.id, { instance_id: id, from: new Date(from).toISOString(), to: new Date(from + 92 * DAY).toISOString() });
  const tz = user.timezone;
  const weeks = new Map<string, typeof list>();
  for (const o of list) weeks.set(weekOf(o.starts_at, tz), [...(weeks.get(weekOf(o.starts_at, tz)) ?? []), o]);
  const feedKey = process.env.CALENDAR_FEED_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const feed = feedKey ? await getCalendarFeed(store, user.id, { key: feedKey, origin: await origin() }) : { url: null };
  const hidden = (o: { session_id: string; occurrence_start: string }) => (
    <>
      <input type="hidden" name="instance_id" value={id} />
      <input type="hidden" name="session_id" value={o.session_id} />
      <input type="hidden" name="occurrence_start" value={o.occurrence_start} />
    </>
  );

  return (
    <Page>
      <PageHeader
        crumbs={[
          { label: "Campaigns", href: "/campaigns" },
          { label: campaign.title, href: `/campaigns/${campaign.id}` },
          { label: instance.name, href: `/instances/${id}` },
        ]}
        title="Schedule"
        description={`Sessions of ${instance.name}. Times in ${tz}.`}
      />
      <WithAside
        aside={
          <>
            <Panel title="Calendar">
              <a href={`/v1/instances/${id}/calendar.ics`} className={buttonClass("secondary", "sm", "self-start")}>
                <CalendarPlus {...ICON_DENSE} />
                Add to calendar
              </a>
              <div className="flex flex-col gap-2 border-t border-rule pt-3">
                <p className="flex items-center gap-2 text-label font-medium text-ink">
                  <Rss {...ICON_DENSE} className="text-muted" />
                  Feed
                </p>
                {feed.url ? (
                  <div className="self-start">
                    <CopyButton text={feed.url} label="Copy feed URL" />
                  </div>
                ) : (
                  <ActionForm action={createFeedAction}>
                    <input type="hidden" name="instance_id" value={id} />
                    <Button type="submit" size="sm">
                      Create feed
                    </Button>
                  </ActionForm>
                )}
              </div>
            </Panel>
            {author && !ended && (
              <Panel title="New session" className="gap-4">
                <ActionForm action={scheduleSessionAction} className="flex flex-col gap-4">
                  <input type="hidden" name="instance_id" value={id} />
                  <Field id="session-title" label="Title" optional>
                    <TextInput {...described("session-title")} name="title" maxLength={80} placeholder="Weekly game" />
                  </Field>
                  <Field id="session-starts" label="Starts">
                    <TextInput {...described("session-starts")} type="datetime-local" name="starts_at" required />
                  </Field>
                  <div className="grid grid-cols-[1fr_7.5rem] gap-3">
                    <Field id="session-timezone" label="Time zone">
                      <TextInput {...described("session-timezone")} name="timezone" required defaultValue={tz} />
                    </Field>
                    <Field id="session-minutes" label="Minutes">
                      <TextInput {...described("session-minutes")} type="number" name="duration_minutes" required min={15} max={720} defaultValue={180} className="tabular" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-[1fr_7.5rem] gap-3">
                    <Field id="session-every" label="Repeats">
                      <Select {...described("session-every")} name="every" defaultValue="1">
                        <option value="0">Once</option>
                        <option value="1">Every week</option>
                        <option value="2">Every 2 weeks</option>
                        <option value="3">Every 3 weeks</option>
                        <option value="4">Every 4 weeks</option>
                      </Select>
                    </Field>
                    <Field id="session-count" label="Times" optional>
                      <TextInput {...described("session-count")} type="number" name="count" min={1} max={52} placeholder="52" className="tabular" />
                    </Field>
                  </div>
                  <div className="flex flex-col">
                    <Choice name="auto_resume" defaultChecked label="Resume a paused game at each start" />
                    <Choice name="auto_pause" label="Pause the game at each end" />
                  </div>
                  <Field id="session-notes" label="Notes" optional>
                    <TextArea {...described("session-notes")} name="notes" maxLength={500} rows={2} />
                  </Field>
                  <div>
                    <Button type="submit" variant="primary">
                      Schedule session
                    </Button>
                  </div>
                </ActionForm>
              </Panel>
            )}
          </>
        }
      >
        {ended && (
          <Notice title="This game has ended." className="mb-6">
            Its sessions are kept as a record. Answers and changes are closed.
          </Notice>
        )}
        {list.length === 0 && <EmptyState icon={<CalendarDays {...ICON} />}>No sessions in the next 91 days.</EmptyState>}
        {[...weeks].map(([week, items], n) => (
          <Section key={week} id={`week-${n}`} title={week} className="mb-8">
            <ul className="flex flex-col gap-3">
              {items.map((o) => {
                const mine = RESPONSES.find((r) => o.rsvps[r].includes(user.id));
                const minutes = Math.round((Date.parse(o.ends_at) - Date.parse(o.starts_at)) / 60000);
                const answered = RESPONSES.filter((r) => o.rsvps[r].length > 0);
                return (
                  <li key={`${o.session_id}:${o.occurrence_start}`} className="rounded-card border border-rule bg-page p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-heading font-semibold text-ink">{formatWhen(o.starts_at, tz)}</p>
                      <span className="text-caption text-muted tabular">{minutes} min</span>
                      {o.status !== "scheduled" && <Badge tone={o.status === "moved" ? "warning" : "neutral"}>{o.status}</Badge>}
                    </div>
                    {answered.length === 0 ? (
                      <p className="mt-1 text-caption text-muted">No answers yet.</p>
                    ) : (
                      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                        {answered.map((r) => (
                          <li key={r} className="flex items-center gap-1.5">
                            <StatusBadge status={r} label={word(r)} />
                            <span className="text-ink">{o.rsvps[r].map((u) => names.get(u) ?? u).join(", ")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {o.status !== "cancelled" && !ended && (
                      <div className="mt-3 flex flex-col gap-3 border-t border-rule pt-3">
                        <div role="group" aria-label={`Your answer for ${formatWhen(o.starts_at, tz)}`} className="flex flex-wrap items-center gap-2">
                          <span className="text-label font-medium text-muted">Your answer</span>
                          {RESPONSES.map((r) => (
                            <ActionForm key={r} action={rsvpAction}>
                              {hidden(o)}
                              <input type="hidden" name="response" value={r} />
                              <button type="submit" aria-pressed={mine === r} className={mine === r ? buttonClass("quiet", "sm", "border border-accent bg-accent-soft") : buttonClass("secondary", "sm")}>
                                {mine === r && <Check {...ICON_DENSE} />}
                                {word(r)}
                              </button>
                            </ActionForm>
                          ))}
                        </div>
                        {author && (
                          <details>
                            <summary className="cursor-pointer text-label font-medium text-accent">Change this session</summary>
                            <div className="mt-3 flex flex-col gap-3">
                              <ActionForm action={moveOccurrenceAction} className="flex flex-wrap items-end gap-2">
                                {hidden(o)}
                                <input type="hidden" name="timezone" value={tz} />
                                <label className="flex flex-col gap-1.5">
                                  <span className="text-label font-medium text-ink">New start</span>
                                  <input type="datetime-local" name="starts_at" required className={`${inputClass} h-8 py-1 text-label`} />
                                </label>
                                <Button type="submit" size="sm">
                                  Move
                                </Button>
                              </ActionForm>
                              <div className="flex flex-wrap gap-2">
                                <ActionForm action={cancelAction}>
                                  {hidden(o)}
                                  <Button type="submit" variant="danger" size="sm">
                                    Cancel this one
                                  </Button>
                                </ActionForm>
                                <ActionForm action={cancelAction}>
                                  <input type="hidden" name="instance_id" value={id} />
                                  <input type="hidden" name="session_id" value={o.session_id} />
                                  <ConfirmButton
                                    size="sm"
                                    label="Cancel the series"
                                    title="Cancel the whole series?"
                                    description="Every session of this series is cancelled, including moved ones. This cannot be undone."
                                    confirm="Cancel the series"
                                  />
                                </ActionForm>
                              </div>
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}
      </WithAside>
    </Page>
  );
}
