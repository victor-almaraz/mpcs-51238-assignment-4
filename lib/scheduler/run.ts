// The Scheduler (architecture.md, Scheduling; app-flow.md, Scheduled jobs): one run handles every
// moment that is due, each at most once per occurrence and moment, plus the deadline sweep and
// invitation expiry. Runs are safe to repeat and to overlap.

import { catchUp, endOfSession, pauseWhenRoundCloses, setStatus, type Deps } from "../coordinator/instance";
import type { Notifier } from "../notifier";
import { occurrencesOf } from "./occurrences";

/** How long after an occurrence's end its end-of-session work may still run, for late cron runs. */
const END_GRACE_MS = 2 * 60 * 60 * 1000;

export interface RunSummary {
  reminders: number;
  resumed: number;
  session_ends: number;
  paused: number;
  advanced: number;
  invitations_expired: number;
  /** Work that threw. Each moment is marked done before its work runs, so a failed step is not retried. */
  errors: { step: "remind" | "resume" | "end_of_session" | "pause" | "advance"; instance_id: string; message: string }[];
}

export async function runScheduler(deps: Deps, notify: Notifier, now = deps.now()): Promise<RunSummary> {
  const t = now.getTime();
  const summary: RunSummary = { reminders: 0, resumed: 0, session_ends: 0, paused: 0, advanced: 0, invitations_expired: 0, errors: [] };
  const snap = await deps.store.schedulerSnapshot();
  const instances = new Map(snap.instances.map((i) => [i.id, i]));
  const once = (key: string) => deps.store.scheduleMark(key);
  // One instance's failure does not stop the run; it is reported in the summary.
  const attempt = async <T>(step: RunSummary["errors"][number]["step"], instance_id: string, work: () => Promise<T>): Promise<{ value: T } | null> => {
    try {
      return { value: await work() };
    } catch (e) {
      summary.errors.push({ step, instance_id, message: e instanceof Error ? e.message : String(e) });
      return null;
    }
  };

  for (const session of snap.sessions) {
    const instance = instances.get(session.instance_id);
    if (!instance) continue;
    const members = snap.members.filter((m) => m.campaign_id === instance.campaign_id);
    for (const o of occurrencesOf(session, snap.exceptions)) {
      if (o.status === "cancelled") continue;
      const start = Date.parse(o.starts_at);
      const end = Date.parse(o.ends_at);
      const occ = `${session.id}:${o.occurrence_start}`;

      // Reminders at each member's lead times, unless they answered no.
      if (t < start) {
        for (const m of members) {
          const declined = snap.rsvps.some((r) => r.session_id === session.id && Date.parse(r.occurrence_start) === Date.parse(o.occurrence_start) && r.user_id === m.user_id && r.response === "no");
          if (declined) continue;
          for (const lead of m.reminders.lead_minutes) {
            if (start - lead * 60_000 > t) continue;
            if (!(await once(`reminder:${occ}:${m.user_id}:${lead}`))) continue;
            if (await attempt("remind", instance.id, () => notify.remind(m.user_id, m.reminders.push, { instance_id: instance.id, session_id: session.id, occurrence_start: o.occurrence_start, starts_at: o.starts_at, title: session.title }))) summary.reminders++;
          }
        }
      }

      // Start: resume a paused instance.
      if (session.auto_resume && start <= t && t < end && instance.status === "paused" && (await once(`start:${occ}`))) {
        if (await attempt("resume", instance.id, () => setStatus(deps, instance.id, "active"))) {
          instance.status = "active";
          summary.resumed++;
        }
      }

      // End: end-of-session changes for every character, then auto_pause.
      if (end <= t && t < end + END_GRACE_MS && (await once(`end:${occ}`))) {
        if ((await attempt("end_of_session", instance.id, () => endOfSession(deps, instance.id, session.id, o.occurrence_start)))?.value) summary.session_ends++;
        if (session.auto_pause && instance.status === "active") {
          const r = await attempt("pause", instance.id, () => pauseWhenRoundCloses(deps, instance.id));
          if (r && r.value !== "skipped") summary.paused++;
        }
      }
    }
  }

  for (const id of await deps.store.expiredDeadlines(now)) if ((await attempt("advance", id, () => catchUp(deps, id)))?.value) summary.advanced++;
  summary.invitations_expired = await deps.store.expireInvitations();
  return summary;
}
