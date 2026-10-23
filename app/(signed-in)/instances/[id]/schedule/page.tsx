// Schedule (app-flow.md, Schedule): occurrences for the next 92 days grouped by week in the user's time
// zone, RSVPs by member, the author's session controls, Add to calendar, and Subscribe.
import Link from "next/link";
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

const field = "rounded-control border border-border bg-page px-2 py-1";
const quiet = "font-ui text-caption text-accent";
const DAY = 86_400_000;

export default async function Schedule({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const { store } = serverDeps();
  const { instance } = await orNotFound(getInstance(serverDeps(), user.id, { instance_id: id }));
  const campaign = await getCampaign(store, user.id, instance.campaign_id);
  const author = campaign.author_id === user.id;
  const names = new Map(campaign.members.map((m) => [m.user_id, m.display_name]));
  const now = requestTime();
  const list = await listOccurrences(store, user.id, { instance_id: id, from: new Date(now - DAY).toISOString(), to: new Date(now + 92 * DAY).toISOString() });
  const tz = user.timezone;
  const weeks = new Map<string, typeof list>();
  for (const o of list) weeks.set(weekOf(o.starts_at, tz), [...(weeks.get(weekOf(o.starts_at, tz)) ?? []), o]);
  const feedKey = process.env.CALENDAR_FEED_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const feed = feedKey ? await getCalendarFeed(store, user.id, { key: feedKey, origin: await origin() }) : { url: null };

  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <Link href={`/instances/${id}`} className="font-ui text-caption text-muted">
        {instance.name}
      </Link>
      <h1 className="font-display text-title">Schedule</h1>
      <p className="mt-1 font-ui text-caption text-muted">Times in {tz}.</p>
      <div className="mt-4 flex flex-wrap items-baseline gap-4 font-ui text-control">
        <a href={`/v1/instances/${id}/calendar.ics`} className="text-accent">
          Add to calendar
        </a>
        {feed.url ? (
          <span className="flex items-baseline gap-2">
            <span className="text-muted">Feed:</span> <CopyButton text={feed.url} label="Copy feed URL" />
          </span>
        ) : (
          <ActionForm action={createFeedAction}>
            <input type="hidden" name="instance_id" value={id} />
            <button type="submit" className="text-accent">
              Create feed
            </button>
          </ActionForm>
        )}
      </div>

      {list.length === 0 && <p className="mt-6 text-muted">No sessions in the next 92 days.</p>}
      {[...weeks].map(([week, items]) => (
        <section key={week} className="mt-6">
          <h2 className="font-ui text-label">{week}</h2>
          <ul>
            {items.map((o) => {
              const mine = (["yes", "no", "maybe"] as const).find((r) => o.rsvps[r].includes(user.id));
              return (
                <li key={`${o.session_id}:${o.occurrence_start}`} className="border-b border-rule py-2">
                  <p>
                    {formatWhen(o.starts_at, tz)} · {Math.round((Date.parse(o.ends_at) - Date.parse(o.starts_at)) / 60000)} min
                    {o.status !== "scheduled" && <span className="ml-2 font-ui text-caption text-warning">{o.status}</span>}
                  </p>
                  <p className="font-ui text-caption text-muted">
                    {(["yes", "maybe", "no"] as const)
                      .filter((r) => o.rsvps[r].length > 0)
                      .map((r) => `${r}: ${o.rsvps[r].map((u) => names.get(u) ?? u).join(", ")}`)
                      .join(" · ") || "No answers yet."}
                  </p>
                  {o.status !== "cancelled" && (
                    <div className="mt-1 flex flex-wrap gap-3">
                      {(["yes", "maybe", "no"] as const).map((r) => (
                        <ActionForm key={r} action={rsvpAction}>
                          <input type="hidden" name="instance_id" value={id} />
                          <input type="hidden" name="session_id" value={o.session_id} />
                          <input type="hidden" name="occurrence_start" value={o.occurrence_start} />
                          <input type="hidden" name="response" value={r} />
                          <button type="submit" aria-pressed={mine === r} className={mine === r ? "font-ui text-caption text-accent underline" : quiet}>
                            {r[0]!.toUpperCase() + r.slice(1)}
                          </button>
                        </ActionForm>
                      ))}
                      {author && (
                        <>
                          <ActionForm action={moveOccurrenceAction} className="flex items-center gap-1">
                            <input type="hidden" name="instance_id" value={id} />
                            <input type="hidden" name="session_id" value={o.session_id} />
                            <input type="hidden" name="occurrence_start" value={o.occurrence_start} />
                            <input type="hidden" name="timezone" value={tz} />
                            <input type="datetime-local" name="starts_at" required aria-label="New start" className={`${field} font-ui text-caption`} />
                            <button type="submit" className={quiet}>
                              Move
                            </button>
                          </ActionForm>
                          <ActionForm action={cancelAction}>
                            <input type="hidden" name="instance_id" value={id} />
                            <input type="hidden" name="session_id" value={o.session_id} />
                            <input type="hidden" name="occurrence_start" value={o.occurrence_start} />
                            <button type="submit" className="font-ui text-caption text-danger">
                              Cancel this one
                            </button>
                          </ActionForm>
                          <ActionForm action={cancelAction}>
                            <input type="hidden" name="instance_id" value={id} />
                            <input type="hidden" name="session_id" value={o.session_id} />
                            <button type="submit" className="font-ui text-caption text-danger">
                              Cancel the series
                            </button>
                          </ActionForm>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {author && instance.status !== "ended" && (
        <section className="mt-10">
          <h2 className="font-display text-heading">New session</h2>
          <ActionForm action={scheduleSessionAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="instance_id" value={id} />
            <label className="flex flex-col gap-1">
              <span className="font-ui text-label">Title</span>
              <input name="title" maxLength={80} placeholder="Weekly game" className={field} />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-ui text-label">Starts</span>
                <input type="datetime-local" name="starts_at" required className={field} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-ui text-label">Time zone</span>
                <input name="timezone" required defaultValue={tz} className={field} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-ui text-label">Minutes</span>
                <input type="number" name="duration_minutes" required min={15} max={720} defaultValue={180} className={`${field} w-24`} />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-ui text-label">Repeats</span>
                <select name="every" defaultValue="1" className={field}>
                  <option value="0">Once</option>
                  <option value="1">Every week</option>
                  <option value="2">Every 2 weeks</option>
                  <option value="3">Every 3 weeks</option>
                  <option value="4">Every 4 weeks</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-ui text-label">Times</span>
                <input type="number" name="count" min={1} max={52} placeholder="52" className={`${field} w-24`} />
              </label>
            </div>
            <label className="flex items-baseline gap-2">
              <input type="checkbox" name="auto_resume" defaultChecked /> Resume a paused game at each start
            </label>
            <label className="flex items-baseline gap-2">
              <input type="checkbox" name="auto_pause" /> Pause the game at each end
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-ui text-label">Notes</span>
              <textarea name="notes" maxLength={500} rows={2} className={field} />
            </label>
            <div>
              <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
                Schedule session
              </button>
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
