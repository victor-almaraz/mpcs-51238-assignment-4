// Occurrences of scheduled sessions (data-model.md, Scheduled session, Session exception; api.md,
// Occurrence): weekly occurrences keep the same local time in the session's time zone across
// daylight-saving changes; with neither `count` nor `until`, a recurring session has 52.

import { addDays, instantOf, wallAt } from "./zone";

export interface Recurrence {
  freq: "weekly";
  interval: number;
  count?: number;
  until?: string;
}

export interface SessionRecord {
  id: string;
  instance_id: string;
  title: string;
  starts_at: string;
  timezone: string;
  duration_minutes: number;
  recurrence: Recurrence | null;
  auto_resume: boolean;
  auto_pause: boolean;
  notes: string;
  status: "scheduled" | "cancelled";
  /** When the series was cancelled; occurrences starting later are cancelled. */
  cancelled_at: string | null;
  created_by: string;
  created_at: string;
}

export interface SessionException {
  session_id: string;
  occurrence_start: string;
  status: "cancelled" | "moved";
  moved_to: string | null;
}

export interface Occurrence {
  session_id: string;
  occurrence_start: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "moved" | "cancelled";
}

export const MAX_OCCURRENCES = 52;

const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

/** The original starts of a session's occurrences, in order. */
export function originalStarts(s: Pick<SessionRecord, "starts_at" | "timezone" | "recurrence">): number[] {
  const first = Date.parse(s.starts_at);
  if (!s.recurrence) return [first];
  const wall = wallAt(first, s.timezone);
  const until = s.recurrence.until ? Date.parse(s.recurrence.until) : Infinity;
  const count = s.recurrence.count ?? MAX_OCCURRENCES;
  const out: number[] = [];
  for (let k = 0; k < Math.min(count, MAX_OCCURRENCES); k++) {
    const t = instantOf(addDays(wall, 7 * s.recurrence.interval * k), s.timezone);
    if (t > until) break;
    out.push(t);
  }
  return out;
}

/** Every occurrence of a session, with its exceptions applied. */
export function occurrencesOf(s: SessionRecord, exceptions: readonly SessionException[]): Occurrence[] {
  const byStart = new Map(exceptions.filter((x) => x.session_id === s.id).map((x) => [Date.parse(x.occurrence_start), x]));
  const cancelledFrom = s.status === "cancelled" ? Date.parse(s.cancelled_at ?? s.starts_at) : Infinity;
  return originalStarts(s).map((t) => {
    const x = byStart.get(t);
    const start = x?.status === "moved" && x.moved_to ? Date.parse(x.moved_to) : t;
    const status = t >= cancelledFrom || x?.status === "cancelled" ? "cancelled" : x?.status === "moved" ? "moved" : "scheduled";
    return { session_id: s.id, occurrence_start: iso(t), starts_at: iso(start), ends_at: iso(start + s.duration_minutes * 60_000), status };
  });
}

/** Occurrences that overlap [from, to), across sessions, by start. */
export function occurrencesBetween(sessions: readonly SessionRecord[], exceptions: readonly SessionException[], from: number, to: number): Occurrence[] {
  return sessions
    .flatMap((s) => occurrencesOf(s, exceptions))
    .filter((o) => Date.parse(o.ends_at) > from && Date.parse(o.starts_at) < to)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || (a.session_id < b.session_id ? -1 : 1));
}

export { iso };
