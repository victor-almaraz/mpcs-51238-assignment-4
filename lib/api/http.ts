// The HTTP binding (api.md, HTTP and WebSocket binding): routes under /v1, JSON bodies, error codes as
// HTTP statuses, the Idempotency-Key header, and the per-user rate limit (api.md, Rate limits).
// The bearer token is the Clerk session token; Clerk authenticates it before `handle` runs.
// SPEC_ISSUES.md#binding-gaps: account routes belong to Clerk; deletion routes are not listed.
import { createHash } from "node:crypto";

import { createCharacter, getCharacter, listCharacters, retireCharacter, updateCharacter } from "./characters";
import {
  archiveCampaign,
  createCampaign,
  deleteCampaign,
  disableInviteLink,
  getCampaign,
  joinByLink,
  leaveCampaign,
  listCampaigns,
  removeMember,
  restoreCampaign,
  rotateInviteLink,
  setMaterials,
  updateCampaign,
} from "./campaigns";
import { ApiError, type ApiErrorCode } from "./errors";
import {
  addCharacter,
  advanceRound,
  createInstance,
  endInstance,
  getHistory,
  getInstance,
  listInstances,
  pauseInstance,
  removeCharacter,
  resumeInstance,
  startInstance,
  submitAction,
  submitInput,
  type Deps,
} from "./instances";
import { acceptInvitation, declineInvitation, invite, listInvitations, previewInvitation, revokeInvitation } from "./invitations";
import { listMaterials } from "./materials";
import { addPushSubscription, exportMyData, getPushKey, listPushSubscriptions, removePushSubscription, requestAccountDeletion, restoreAccount, updateMe } from "./account";
import { calendarFeed, cancelSession, disableCalendarFeed, exportCalendar, getCalendarFeed, listOccurrences, moveOccurrence, rotateCalendarFeed, rsvp, scheduleSession, updateSession } from "./schedules";
import { getSystemSchema, listSystems } from "./systems";
import { acceptTerms, caller, getMe } from "./users";

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  system_mismatch: 409,
  invalid_request: 422,
  rules_rejected: 422,
  rate_limited: 429,
  unavailable: 503,
};

/** Requests per user per minute for every operation (api.md, Rate limits); deployment-configurable. */
export const RATE_LIMIT = { window_seconds: 60, limit: 120 };

interface Call {
  deps: Deps;
  user: string | null;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  headers: Headers;
  origin: string;
}

type Reply = { status: number; body?: unknown; calendar?: string; file?: { type: string; name: string; data: Uint8Array } };

const ok = (body: unknown): Reply => ({ status: 200, body });
const created = (body: unknown): Reply => ({ status: 201, body });
const none = (): Reply => ({ status: 204 });
const ics = (text: string): Reply => ({ status: 200, calendar: text });

/** Requests per calendar feed URL per hour (api.md, Rate limits). */
const FEED_LIMIT = { window_seconds: 3600, limit: 60 };

function feedConfig(c: Call) {
  const key = process.env.CALENDAR_FEED_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new ApiError("unavailable", "calendar feeds are not configured");
  return { key, origin: c.origin };
}

/** Query parameters as operation input: integers and booleans where the operation expects them. */
function queryInput(query: URLSearchParams, numbers: string[] = [], booleans: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of query) {
    if (v === "") continue;
    if (numbers.includes(k)) out[k] = /^-?\d+$/.test(v) ? Number(v) : v;
    else if (booleans.includes(k)) out[k] = v === "true" ? true : v === "false" ? false : v;
    else out[k] = v;
  }
  return out;
}

const gated = async (c: Call, operation: string) => caller(c.deps.store, c.user, operation);

type Route = [method: string, pattern: string, run: (c: Call) => Promise<Reply>];

const ROUTES: Route[] = [
  // Users
  ["GET", "/me", async (c) => ok(await getMe(c.deps.store, c.user))],
  ["PATCH", "/me", async (c) => ok({ user: await updateMe(c.deps.store, c.user, c.body) })],
  ["GET", "/me/export.zip", async (c) => ({ status: 200, file: { type: "application/zip", name: "cadmium-export.zip", data: await exportMyData(c.deps.store, c.user) } })],
  ["POST", "/me/deletion", async (c) => ok(await requestAccountDeletion(c.deps.store, c.user, c.body))],
  ["DELETE", "/me/deletion", async (c) => ok({ user: await restoreAccount(c.deps.store, c.user) })],
  ["GET", "/push/key", async (c) => (await gated(c, "get_push_key"), ok(getPushKey(process.env.VAPID_PUBLIC_KEY)))],
  ["POST", "/me/push-subscriptions", async (c) => created({ push_subscription: await addPushSubscription(c.deps.store, c.user, c.body) })],
  ["GET", "/me/push-subscriptions", async (c) => ok({ items: await listPushSubscriptions(c.deps.store, c.user) })],
  ["DELETE", "/me/push-subscriptions/:subscription_id", async (c) => (await removePushSubscription(c.deps.store, c.user, c.params.subscription_id), none())],
  ["GET", "/me/calendar-feed", async (c) => ok(await getCalendarFeed(c.deps.store, c.user, feedConfig(c)))],
  ["POST", "/me/calendar-feed", async (c) => ok(await rotateCalendarFeed(c.deps.store, c.user, feedConfig(c)))],
  ["DELETE", "/me/calendar-feed", async (c) => (await disableCalendarFeed(c.deps.store, c.user), none())],
  [
    "GET",
    "/calendar/:feed",
    async (c) => {
      const secret = c.params.feed!.replace(/\.ics$/, "");
      const wait = await c.deps.store.rateHit(`feed:${createHash("sha256").update(secret).digest("hex")}`, "calendar", FEED_LIMIT.window_seconds, FEED_LIMIT.limit);
      if (wait > 0) throw new ApiError("rate_limited", "too many requests for this feed", { retry_after_ms: wait });
      return ics(await calendarFeed(c.deps.store, secret, feedConfig(c)));
    },
  ],
  ["POST", "/me/terms", async (c) => ok({ user: await acceptTerms(c.deps.store, c.user, c.body.version) })],
  // Systems and materials
  ["GET", "/systems", async (c) => (await gated(c, "list_systems"), ok({ items: listSystems() }))],
  ["GET", "/systems/:system/schemas/:kind", async (c) => (await gated(c, "get_system_schema"), ok(getSystemSchema(c.params.system, c.params.kind, c.query.getAll("modules"))))],
  ["GET", "/materials", async (c) => ok({ items: await listMaterials(c.deps.store, c.user, queryInput(c.query)) })],
  // Characters
  ["POST", "/characters", async (c) => created({ character: await createCharacter(c.deps.store, c.user, c.body) })],
  ["GET", "/characters", async (c) => ok(await listCharacters(c.deps.store, c.user, queryInput(c.query, ["limit"])))],
  ["GET", "/characters/:character_id", async (c) => ok({ character: await getCharacter(c.deps.store, c.user, c.params.character_id) })],
  ["PATCH", "/characters/:character_id", async (c) => ok({ character: await updateCharacter(c.deps.store, c.user, { ...c.body, character_id: c.params.character_id }) })],
  ["POST", "/characters/:character_id/retire", async (c) => ok({ character: await retireCharacter(c.deps.store, c.user, c.params.character_id) })],
  // Campaigns
  ["POST", "/campaigns", async (c) => created({ campaign: await createCampaign(c.deps.store, c.user, c.body) })],
  ["GET", "/campaigns", async (c) => ok(await listCampaigns(c.deps.store, c.user, queryInput(c.query, ["limit"], ["archived"])))],
  ["POST", "/campaigns/join", async (c) => ok({ campaign: await joinByLink(c.deps.store, c.user, c.body.invite_link_code) })],
  ["GET", "/campaigns/:campaign_id", async (c) => ok({ campaign: await getCampaign(c.deps.store, c.user, c.params.campaign_id) })],
  ["PATCH", "/campaigns/:campaign_id", async (c) => ok({ campaign: await updateCampaign(c.deps.store, c.user, { ...c.body, campaign_id: c.params.campaign_id }) })],
  ["DELETE", "/campaigns/:campaign_id", async (c) => (await deleteCampaign(c.deps, c.user, { ...c.body, campaign_id: c.params.campaign_id }), none())],
  ["POST", "/campaigns/:campaign_id/restore", async (c) => ok({ campaign: await restoreCampaign(c.deps.store, c.user, c.params.campaign_id) })],
  ["PUT", "/campaigns/:campaign_id/materials", async (c) => ok({ campaign: await setMaterials(c.deps.store, c.user, { ...c.body, campaign_id: c.params.campaign_id }) })],
  ["POST", "/campaigns/:campaign_id/archive", async (c) => ok({ campaign: await archiveCampaign(c.deps.store, c.user, c.params.campaign_id) })],
  ["DELETE", "/campaigns/:campaign_id/members/me", async (c) => (await leaveCampaign(c.deps, c.user, c.params.campaign_id), none())],
  ["DELETE", "/campaigns/:campaign_id/members/:user_id", async (c) => (await removeMember(c.deps, c.user, { campaign_id: c.params.campaign_id, user_id: c.params.user_id }), none())],
  ["POST", "/campaigns/:campaign_id/invite-link", async (c) => ok(await rotateInviteLink(c.deps.store, c.user, c.params.campaign_id))],
  ["DELETE", "/campaigns/:campaign_id/invite-link", async (c) => (await disableInviteLink(c.deps.store, c.user, c.params.campaign_id), none())],
  // Invitations
  [
    "POST",
    "/campaigns/:campaign_id/invitations",
    async (c) => {
      const r = await invite(c.deps.store, c.user, { ...c.body, campaign_id: c.params.campaign_id });
      return created({ ...r, url: `${c.origin}${r.url}` });
    },
  ],
  ["GET", "/campaigns/:campaign_id/invitations", async (c) => ok({ items: await listInvitations(c.deps.store, c.user, { ...queryInput(c.query), campaign_id: c.params.campaign_id }) })],
  ["GET", "/invitations/code/:code", async (c) => ok(await previewInvitation(c.deps.store, c.params.code))],
  ["POST", "/invitations/accept", async (c) => ok({ campaign: await acceptInvitation(c.deps.store, c.user, c.body.code) })],
  ["POST", "/invitations/decline", async (c) => (await declineInvitation(c.deps.store, c.user, c.body.code), none())],
  ["DELETE", "/invitations/:invitation_id", async (c) => (await revokeInvitation(c.deps.store, c.user, c.params.invitation_id), none())],
  // Instances
  ["POST", "/campaigns/:campaign_id/instances", async (c) => created({ instance: await createInstance(c.deps.store, c.user, { ...c.body, campaign_id: c.params.campaign_id }) })],
  ["GET", "/campaigns/:campaign_id/instances", async (c) => ok({ items: await listInstances(c.deps.store, c.user, c.params.campaign_id) })],
  ["GET", "/instances/:instance_id", async (c) => ok(await getInstance(c.deps, c.user, { ...queryInput(c.query), instance_id: c.params.instance_id }))],
  ["POST", "/instances/:instance_id/characters", async (c) => ok({ instance: await addCharacter(c.deps, c.user, { ...c.body, instance_id: c.params.instance_id }) })],
  ["DELETE", "/instances/:instance_id/characters/:character_id", async (c) => ok({ instance: await removeCharacter(c.deps, c.user, { instance_id: c.params.instance_id, character_id: c.params.character_id }) })],
  ["POST", "/instances/:instance_id/start", async (c) => ok({ instance: await startInstance(c.deps, c.user, c.params.instance_id) })],
  ["POST", "/instances/:instance_id/pause", async (c) => ok({ instance: await pauseInstance(c.deps, c.user, c.params.instance_id) })],
  ["POST", "/instances/:instance_id/resume", async (c) => ok({ instance: await resumeInstance(c.deps, c.user, c.params.instance_id) })],
  ["POST", "/instances/:instance_id/end", async (c) => ok({ instance: await endInstance(c.deps, c.user, c.params.instance_id) })],
  ["POST", "/instances/:instance_id/advance", async (c) => (await advanceRound(c.deps, c.user, c.params.instance_id), none())],
  // Scheduling
  ["POST", "/instances/:instance_id/sessions", async (c) => created({ session: await scheduleSession(c.deps.store, c.user, { ...c.body, instance_id: c.params.instance_id }) })],
  ["PATCH", "/sessions/:session_id", async (c) => ok({ session: await updateSession(c.deps.store, c.user, { ...c.body, session_id: c.params.session_id }) })],
  ["DELETE", "/sessions/:session_id", async (c) => (await cancelSession(c.deps.store, c.user, { session_id: c.params.session_id, ...queryInput(c.query) }), none())],
  ["POST", "/sessions/:session_id/occurrences/:occurrence_start/move", async (c) => ok({ occurrence: await moveOccurrence(c.deps.store, c.user, { ...c.body, session_id: c.params.session_id, occurrence_start: c.params.occurrence_start }) })],
  ["PUT", "/sessions/:session_id/occurrences/:occurrence_start/rsvp", async (c) => ok({ occurrence: await rsvp(c.deps.store, c.user, { ...c.body, session_id: c.params.session_id, occurrence_start: c.params.occurrence_start }) })],
  ["GET", "/occurrences", async (c) => ok({ items: await listOccurrences(c.deps.store, c.user, queryInput(c.query)) })],
  ["GET", "/instances/:instance_id/calendar.ics", async (c) => ics(await exportCalendar(c.deps.store, c.user, c.params.instance_id))],
  ["GET", "/instances/:instance_id/history", async (c) => ok(await getHistory(c.deps.store, c.user, { ...queryInput(c.query, ["after_version", "limit"]), instance_id: c.params.instance_id }))],
  [
    "POST",
    "/instances/:instance_id/actions",
    async (c) => ({ status: 202, body: await submitAction(c.deps, c.user, { ...c.body, instance_id: c.params.instance_id, idempotency_key: c.headers.get("idempotency-key") ?? undefined }) }),
  ],
  [
    "POST",
    "/instances/:instance_id/inputs",
    async (c) => ({ status: 202, body: await submitInput(c.deps, c.user, { ...c.body, instance_id: c.params.instance_id, idempotency_key: c.headers.get("idempotency-key") ?? undefined }) }),
  ],
];

function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i]!.startsWith(":")) params[p[i]!.slice(1)] = decodeURIComponent(s[i]!);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  if (body === undefined) return new Response(null, { status, headers });
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}

function failure(e: ApiError): Response {
  const headers: Record<string, string> = e.code === "rate_limited" ? { "Retry-After": String(Math.ceil(Number(e.extra.retry_after_ms ?? 1000) / 1000)) } : {};
  return json(STATUS[e.code], e.toJSON(), headers);
}

/** Serves one request under the binding's base path, as the signed-in user `user` (or nobody). */
export async function handle(request: Request, user: string | null, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/(api\/)?v1(?=\/|$)/, "");
  let route: Route | undefined;
  let params: Record<string, string> | null = null;
  let allowed = false;
  for (const r of ROUTES) {
    const m = match(r[1], path);
    if (!m) continue;
    allowed = true;
    if (r[0] === request.method) {
      route = r;
      params = m;
      break;
    }
  }
  if (!route || !params) return json(allowed ? 405 : 404, { error: { code: allowed ? "invalid_request" : "not_found", detail: `no route ${request.method} ${url.pathname}` } });

  try {
    if (user) {
      const wait = await deps.store.rateHit(user, "api", RATE_LIMIT.window_seconds, RATE_LIMIT.limit);
      if (wait > 0) throw new ApiError("rate_limited", "too many requests", { retry_after_ms: wait });
    }
    let body: Record<string, unknown> = {};
    const text = request.method === "GET" ? "" : await request.text();
    if (text.trim() !== "") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ApiError("invalid_request", "the body is not JSON");
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new ApiError("invalid_request", "the body must be a JSON object");
      body = parsed as Record<string, unknown>;
    }
    const reply = await route[2]({ deps, user, params, query: url.searchParams, body, headers: request.headers, origin: url.origin });
    if (reply.file) return new Response(reply.file.data as BodyInit, { status: reply.status, headers: { "Content-Type": reply.file.type, "Content-Disposition": `attachment; filename="${reply.file.name}"` } });
    if (reply.calendar !== undefined) return new Response(reply.calendar, { status: reply.status, headers: { "Content-Type": "text/calendar; charset=utf-8" } });
    return json(reply.status, reply.body);
  } catch (e) {
    if (e instanceof ApiError) return failure(e);
    throw e;
  }
}
