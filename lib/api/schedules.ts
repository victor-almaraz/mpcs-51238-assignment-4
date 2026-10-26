// Scheduling (api.md, Scheduling; data-model.md, Scheduled session, Session exception, RSVP).

import { createHash, createHmac } from "node:crypto";
import { calendar } from "../scheduler/ics";
import { MAX_OCCURRENCES, occurrencesBetween, occurrencesOf, type Occurrence, type Recurrence, type SessionRecord } from "../scheduler/occurrences";
import { validZone } from "../scheduler/zone";
import type { Rsvp, Schedules, Store, UserRecord } from "../store";
import { membership } from "./campaigns";
import { DAY } from "./deletion";
import { cryptoEntropy, type Entropy } from "./entropy";
import { ApiError, notFoundAs, onlyFields } from "./errors";
import { instanceOf } from "./instances";
import { caller } from "./users";

const FIELDS = ["starts_at", "timezone", "duration_minutes", "title", "recurrence", "auto_resume", "auto_pause", "notes"] as const;

/** The scheduled session object of api.md. */
export function sessionView(s: SessionRecord) {
  return { id: s.id, instance_id: s.instance_id, title: s.title, starts_at: s.starts_at, timezone: s.timezone, duration_minutes: s.duration_minutes, recurrence: s.recurrence, auto_resume: s.auto_resume, auto_pause: s.auto_pause, notes: s.notes, status: s.status };
}

/** The occurrence object of api.md, with RSVPs by response. */
export function occurrenceView(o: Occurrence, rsvps: readonly Rsvp[]) {
  const mine = rsvps.filter((r) => r.session_id === o.session_id && Date.parse(r.occurrence_start) === Date.parse(o.occurrence_start));
  const by = (response: Rsvp["response"]) => mine.filter((r) => r.response === response).map((r) => r.user_id).sort();
  return { ...o, rsvps: { yes: by("yes"), no: by("no"), maybe: by("maybe") } };
}

function instant(v: unknown, field: string): string {
  if (typeof v !== "string" || Number.isNaN(Date.parse(v)) || !/^\d{4}-\d{2}-\d{2}T/.test(v)) throw new ApiError("invalid_request", `${field} must be an ISO 8601 timestamp`);
  return new Date(v).toISOString();
}

function recurrenceOf(v: unknown): Recurrence | null {
  if (v === null || v === undefined) return null;
  const r = onlyFields(v, ["freq", "interval", "count", "until"]);
  if (r.freq !== "weekly") throw new ApiError("invalid_request", "recurrence.freq must be weekly");
  if (typeof r.interval !== "number" || !Number.isInteger(r.interval) || r.interval < 1 || r.interval > 4) throw new ApiError("invalid_request", "recurrence.interval must be 1 to 4");
  if (r.count !== undefined && r.until !== undefined) throw new ApiError("invalid_request", "recurrence takes count or until, not both");
  if (r.count !== undefined && (typeof r.count !== "number" || !Number.isInteger(r.count) || r.count < 1 || r.count > MAX_OCCURRENCES)) throw new ApiError("invalid_request", "recurrence.count must be 1 to 52");
  return { freq: "weekly", interval: r.interval, ...(r.count !== undefined ? { count: r.count as number } : {}), ...(r.until !== undefined ? { until: instant(r.until, "recurrence.until") } : {}) };
}

/** A session record from fields, validated (data-model.md, Scheduled session constraints). */
function fieldsOf(req: Record<string, unknown>, base: Partial<SessionRecord>): Pick<SessionRecord, (typeof FIELDS)[number]> {
  const get = <K extends (typeof FIELDS)[number]>(k: K) => (req[k] !== undefined ? req[k] : base[k]);
  const timezone = get("timezone");
  if (typeof timezone !== "string" || !validZone(timezone)) throw new ApiError("invalid_request", "timezone must be an IANA time zone name");
  const duration = get("duration_minutes");
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 15 || duration > 720) throw new ApiError("invalid_request", "duration_minutes must be 15 to 720");
  const title = get("title") ?? "";
  if (typeof title !== "string" || title.length > 80) throw new ApiError("invalid_request", "title must have at most 80 characters");
  const notes = get("notes") ?? "";
  if (typeof notes !== "string" || notes.length > 500) throw new ApiError("invalid_request", "notes must have at most 500 characters");
  for (const k of ["auto_resume", "auto_pause"] as const) if (req[k] !== undefined && typeof req[k] !== "boolean") throw new ApiError("invalid_request", `${k} must be a boolean`);
  return {
    starts_at: instant(get("starts_at"), "starts_at"),
    timezone,
    duration_minutes: duration,
    title,
    recurrence: req.recurrence !== undefined ? recurrenceOf(req.recurrence) : (base.recurrence ?? null),
    auto_resume: (get("auto_resume") as boolean | undefined) ?? true,
    auto_pause: (get("auto_pause") as boolean | undefined) ?? false,
    notes,
  };
}

/**
 * The session for a change or an answer, and the caller's role. An ended game's sessions are a record:
 * nothing about them changes any more (api.md, Scheduling).
 */
async function authorSession(store: Store, user: UserRecord, sessionId: unknown) {
  if (typeof sessionId !== "string") throw new ApiError("invalid_request", "session_id must be a string");
  const session = await store.getSession(sessionId);
  if (!session) throw new ApiError("not_found", "no such session");
  const { instance, role } = await instanceOf(store, user, session.instance_id).catch(notFoundAs("no such session"));
  if (instance.status === "ended") throw new ApiError("conflict", "the instance has ended");
  return { session, instance, role };
}

export async function scheduleSession(store: Store, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "schedule_session");
  const req = onlyFields(input, ["instance_id", ...FIELDS]);
  const { instance, role } = await instanceOf(store, user, req.instance_id);
  if (role !== "author") throw new ApiError("forbidden", "only the campaign's author may schedule sessions");
  if (instance.status === "ended") throw new ApiError("conflict", "the instance has ended");
  const session = await store.putSession({ id: entropy.id("s"), instance_id: instance.id, ...fieldsOf(req, {}), status: "scheduled", cancelled_at: null, created_by: user.id, created_at: new Date().toISOString() });
  return sessionView(session);
}

// Changes apply to the whole series (api.md, Scheduling).
export async function updateSession(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "update_session");
  const req = onlyFields(input, ["session_id", ...FIELDS]);
  const { session, role } = await authorSession(store, user, req.session_id);
  if (role !== "author") throw new ApiError("forbidden", "only the campaign's author may change sessions");
  if (session.status === "cancelled") throw new ApiError("conflict", "the session is cancelled");
  return sessionView(await store.putSession({ ...session, ...fieldsOf(req, session) }));
}

// The schedule page edits a series, which list_occurrences does not describe.
/** The instance's sessions that are not cancelled, oldest first, for the author's edit forms. */
export async function listSessions(store: Store, userId: string | null, instanceId: unknown) {
  const user = await caller(store, userId, "list_occurrences");
  const { instance } = await instanceOf(store, user, instanceId);
  const { sessions } = await store.schedules([instance.id]);
  return sessions
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map(sessionView);
}

/** The occurrence of a session that started at `occurrenceStart`, or invalid_request. */
function occurrenceOf(session: SessionRecord, schedules: Schedules, occurrenceStart: unknown): Occurrence {
  const at = instant(occurrenceStart, "occurrence_start");
  const o = occurrencesOf(session, schedules.exceptions).find((x) => Date.parse(x.occurrence_start) === Date.parse(at));
  if (!o) throw new ApiError("invalid_request", "occurrence_start is not an occurrence of the session");
  return o;
}

export async function cancelSession(store: Store, userId: string | null, input: unknown, now = new Date()) {
  const user = await caller(store, userId, "cancel_session");
  const req = onlyFields(input, ["session_id", "occurrence_start"]);
  const { session, role } = await authorSession(store, user, req.session_id);
  if (role !== "author") throw new ApiError("forbidden", "only the campaign's author may cancel sessions");
  if (req.occurrence_start !== undefined) {
    const o = occurrenceOf(session, await store.schedules([session.instance_id]), req.occurrence_start);
    await store.setException(session.id, o.occurrence_start, "cancelled", null);
  } else {
    await store.putSession({ ...session, status: "cancelled", cancelled_at: now.toISOString() });
  }
}

export async function moveOccurrence(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "move_occurrence");
  const req = onlyFields(input, ["session_id", "occurrence_start", "starts_at"]);
  const { session, role } = await authorSession(store, user, req.session_id);
  if (role !== "author") throw new ApiError("forbidden", "only the campaign's author may move occurrences");
  const o = occurrenceOf(session, await store.schedules([session.instance_id]), req.occurrence_start);
  if (o.status === "cancelled") throw new ApiError("conflict", "the occurrence is cancelled");
  await store.setException(session.id, o.occurrence_start, "moved", instant(req.starts_at, "starts_at"));
  const after = await store.schedules([session.instance_id]);
  return occurrenceView(occurrenceOf(session, after, o.occurrence_start), after.rsvps);
}

export async function rsvp(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "rsvp");
  const req = onlyFields(input, ["session_id", "occurrence_start", "response"]);
  const { session } = await authorSession(store, user, req.session_id);
  if (req.response !== "yes" && req.response !== "no" && req.response !== "maybe") throw new ApiError("invalid_request", "response must be yes, no, or maybe");
  const o = occurrenceOf(session, await store.schedules([session.instance_id]), req.occurrence_start);
  await store.rsvp(session.id, o.occurrence_start, user.id, req.response);
  return occurrenceView(o, (await store.schedules([session.instance_id])).rsvps);
}

/** Occurrences of one instance or of every instance of a campaign, in a window of at most 92 days. */
export async function listOccurrences(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "list_occurrences");
  const req = onlyFields(input, ["instance_id", "campaign_id", "from", "to"]);
  const from = Date.parse(instant(req.from, "from"));
  const to = Date.parse(instant(req.to, "to"));
  if (to <= from || to - from > 92 * DAY) throw new ApiError("invalid_request", "from and to must be at most 92 days apart, from first");
  let ids: string[];
  if (req.instance_id !== undefined) ids = [(await instanceOf(store, user, req.instance_id)).instance.id];
  else if (req.campaign_id !== undefined) ids = (await membership(store, user, req.campaign_id)).campaign.instance_ids;
  else throw new ApiError("invalid_request", "pass instance_id or campaign_id");
  const s = await store.schedules(ids);
  return occurrencesBetween(s.sessions, s.exceptions, from, to).map((o) => occurrenceView(o, s.rsvps));
}

/** Every occurrence of an instance's sessions as iCalendar text. */
export async function exportCalendar(store: Store, userId: string | null, instanceId: unknown, now = new Date()): Promise<string> {
  const user = await caller(store, userId, "export_calendar");
  const { instance } = await instanceOf(store, user, instanceId);
  const s = await store.schedules([instance.id]);
  const entries = s.sessions.flatMap((session) => occurrencesOf(session, s.exceptions).map((occurrence) => ({ occurrence, title: session.title || instance.name, description: session.notes, alarms: [] })));
  return calendar(instance.name, entries, now);
}

// Calendar feeds ----------------------------------------------------------------------------------

// api.md, Users, Calendar feed secret: the secret is an HMAC of the user id and feed generation under a
// deployment key, so get_calendar_feed can show the URL again while only the secret's hash is stored.
function feedSecret(key: string, userId: string, generation: number): string {
  return createHmac("sha256", key).update(`${userId}:${generation}`).digest("base64url").slice(0, 32);
}

const feedHash = (secret: string) => createHash("sha256").update(secret).digest("hex");

export interface FeedConfig {
  key: string;
  origin: string;
}

const feedUrl = (c: FeedConfig, secret: string) => `${c.origin}/v1/calendar/${secret}.ics`;

/**
 * The key calendar feed secrets derive from, or undefined when calendar feeds are not configured. Only
 * its own variable: a feed URL must not depend on, or change with, any other secret.
 */
export function calendarFeedKey(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.CALENDAR_FEED_KEY?.trim() || undefined;
}

export async function getCalendarFeed(store: Store, userId: string | null, config: FeedConfig) {
  const user = await caller(store, userId, "get_calendar_feed");
  if (!user.calendar_token_hash) return { url: null };
  return { url: feedUrl(config, feedSecret(config.key, user.id, user.calendar_feed_generation ?? 0)) };
}

export async function rotateCalendarFeed(store: Store, userId: string | null, config: FeedConfig) {
  const user = await caller(store, userId, "rotate_calendar_feed");
  const secret = feedSecret(config.key, user.id, (user.calendar_feed_generation ?? 0) + 1);
  await store.setCalendarFeed(user.id, feedHash(secret));
  return { url: feedUrl(config, secret) };
}

export async function disableCalendarFeed(store: Store, userId: string | null) {
  const user = await caller(store, userId, "disable_calendar_feed");
  await store.setCalendarFeed(user.id, null);
}

/** The feed: every occurrence in the next 92 days of the user's instances, with one alarm per lead time. */
export async function calendarFeed(store: Store, secret: string, config: FeedConfig, now = new Date()): Promise<string> {
  const user = await store.userByFeed(feedHash(secret));
  if (!user || feedSecret(config.key, user.id, user.calendar_feed_generation) !== secret) throw new ApiError("not_found", "no such calendar feed");
  const instances = (await store.userInstances(user.id)).filter((i) => i.status !== "ended");
  const names = new Map(instances.map((i) => [i.id, i.name]));
  const s = await store.schedules(instances.map((i) => i.id));
  const sessions = new Map(s.sessions.map((x) => [x.id, x]));
  const list = occurrencesBetween(s.sessions, s.exceptions, now.getTime(), now.getTime() + 92 * DAY);
  const entries = list.map((occurrence) => {
    const session = sessions.get(occurrence.session_id)!;
    return { occurrence, title: session.title || names.get(session.instance_id) || "Session", description: session.notes, alarms: user.reminders.lead_minutes };
  });
  return calendar("Cadmium", entries, now);
}
