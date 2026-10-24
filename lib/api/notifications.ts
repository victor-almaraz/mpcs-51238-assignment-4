// Notifications (app-flow.md, Route map: /notifications, session reminders from the user stream).
// Reminders are not stored as records: the Scheduler sends `session_reminder` at each of a member's
// `reminders.lead_minutes` before an occurrence, unless they answered `no` (api.md, Scheduling). This
// derives the same moments from the schedules, so the page lists recent and upcoming reminders without
// a separate table. See SPEC_ISSUES.md#notification-records.

import { occurrencesOf } from "../scheduler/occurrences";
import type { Store } from "../store";
import { ApiError, onlyFields } from "./errors";
import { caller } from "./users";

const DAY = 86_400_000;
/** The longest lead time update_me accepts (api.md, Users: reminders). */
const MAX_LEAD_MINUTES = 10_080;

export interface ReminderView {
  instance_id: string;
  instance_name: string;
  campaign_title: string;
  session_id: string;
  title: string;
  occurrence_start: string;
  starts_at: string;
  lead_minutes: number;
  /** When the Scheduler sends (or sent) this reminder: `starts_at` less the lead time. */
  remind_at: string;
  /** True once `remind_at` has passed, so the user stream has carried it. */
  sent: boolean;
}

/**
 * The caller's session reminders from `days` (1 to 30, default 7) before `now` to `days` after it:
 * `recent` newest first, `upcoming` soonest first.
 */
export async function listReminders(store: Store, userId: string | null, input: unknown = {}, now = new Date()) {
  const user = await caller(store, userId, "list_reminders");
  const req = onlyFields(input, ["days"]);
  const days = req.days ?? 7;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 30) throw new ApiError("invalid_request", "days must be 1 to 30");
  const t = now.getTime();
  const from = t - days * DAY;
  const to = t + days * DAY;
  const instances = await store.userInstances(user.id);
  const byId = new Map(instances.map((i) => [i.id, i]));
  const s = await store.schedules(instances.map((i) => i.id));
  const reminders: ReminderView[] = [];
  for (const session of s.sessions) {
    const instance = byId.get(session.instance_id);
    if (!instance) continue;
    for (const o of occurrencesOf(session, s.exceptions)) {
      if (o.status === "cancelled") continue;
      const start = Date.parse(o.starts_at);
      if (start < from || start > to + MAX_LEAD_MINUTES * 60_000) continue;
      const declined = s.rsvps.some((r) => r.session_id === session.id && Date.parse(r.occurrence_start) === Date.parse(o.occurrence_start) && r.user_id === user.id && r.response === "no");
      if (declined) continue;
      for (const lead of user.reminders.lead_minutes) {
        const at = start - lead * 60_000;
        if (at < from || at > to) continue;
        const sent = at <= t;
        // The Scheduler sends nothing for an instance that has ended.
        if (!sent && instance.status === "ended") continue;
        reminders.push({
          instance_id: instance.id,
          instance_name: instance.name,
          campaign_title: instance.campaign_title,
          session_id: session.id,
          title: session.title || instance.name,
          occurrence_start: o.occurrence_start,
          starts_at: o.starts_at,
          lead_minutes: lead,
          remind_at: new Date(at).toISOString(),
          sent,
        });
      }
    }
  }
  const order = (a: ReminderView, b: ReminderView) => Date.parse(a.remind_at) - Date.parse(b.remind_at) || (a.session_id < b.session_id ? -1 : a.session_id > b.session_id ? 1 : 0);
  return {
    recent: reminders.filter((r) => r.sent).sort((a, b) => order(b, a)),
    upcoming: reminders.filter((r) => !r.sent).sort(order),
  };
}
