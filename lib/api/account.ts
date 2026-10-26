// The user's own account (api.md, Users: update_me, export_my_data, request_account_deletion,
// restore_account, push subscriptions; data-model.md, Deletion; app-flow.md, Settings).

import { zip, type ZipFile } from "../export/zip";
import { draftFiles } from "../materials";
import { validZone } from "../scheduler/zone";
import type { Store } from "../store";
import { withStages } from "./deletion";
import { cryptoEntropy, type Entropy } from "./entropy";
import { ApiError, onlyFields } from "./errors";
import { caller, userView } from "./users";

function reminders(v: unknown) {
  const r = onlyFields(v, ["push", "lead_minutes"]);
  if (typeof r.push !== "boolean") throw new ApiError("invalid_request", "reminders.push must be a boolean");
  if (!Array.isArray(r.lead_minutes) || r.lead_minutes.length > 5 || !r.lead_minutes.every((m) => Number.isInteger(m) && m >= 5 && m <= 10_080)) {
    throw new ApiError("invalid_request", "reminders.lead_minutes must list up to 5 lead times of 5 to 10,080 minutes");
  }
  return { push: r.push, lead_minutes: [...new Set(r.lead_minutes as number[])].sort((a, b) => b - a) };
}

export async function updateMe(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "update_me");
  const req = onlyFields(input, ["display_name", "email", "timezone", "reminders", "password", "current_password"]);
  // SPEC_ISSUES.md#binding-gaps: Clerk holds the sign-in address and password.
  if (req.email !== undefined || req.password !== undefined || req.current_password !== undefined) throw new ApiError("invalid_request", "change your email address and password in your account settings with the identity provider");
  if (req.display_name !== undefined && (typeof req.display_name !== "string" || req.display_name.trim().length < 1 || req.display_name.length > 40)) throw new ApiError("invalid_request", "display_name must have 1 to 40 characters");
  if (req.timezone !== undefined && (typeof req.timezone !== "string" || !validZone(req.timezone))) throw new ApiError("invalid_request", "timezone must be an IANA time zone name");
  const updated = await store.updateMe(user.id, {
    display_name: req.display_name as string | undefined,
    timezone: req.timezone as string | undefined,
    reminders: req.reminders === undefined ? undefined : reminders(req.reminders),
  });
  return userView(updated!);
}

/** The recovery stage: the account closes; it can be restored for 30 days and is erased after 90. */
export async function requestAccountDeletion(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "request_account_deletion");
  const req = onlyFields(input, ["confirm"]);
  if (req.confirm !== user.display_name) throw new ApiError("invalid_request", "confirm must be your display name");
  const closed = (await store.requestDeletion(user.id))!;
  const { restorable_until, erased_by } = withStages({ deleted_at: closed.deletion_requested_at! });
  return { restorable_until, purge_after: erased_by };
}

export async function restoreAccount(store: Store, userId: string | null) {
  const user = await caller(store, userId, "restore_account");
  if (user.status !== "closing") throw new ApiError("conflict", "the account is not closing");
  const restored = await store.restoreAccount(user.id);
  if (!restored) throw new ApiError("conflict", "the account can no longer be restored");
  return userView(restored);
}

// Push subscriptions ---------------------------------------------------------------------------------

export function getPushKey(publicKey: string | undefined) {
  if (!publicKey) throw new ApiError("unavailable", "browser notifications are not configured");
  return { public_key: publicKey };
}

/**
 * Push services of the browsers Cadmium supports: Chrome, Edge on Android, Samsung Internet, Brave, and
 * Opera (FCM), Firefox, Safari, and Edge on Windows. The Scheduler posts to the endpoint, so any other
 * host would be a request the server makes on a user's behalf (SECURITY_AUDIT.md, S-12).
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

/** Browsers per user that receive reminders. */
export const MAX_PUSH_SUBSCRIPTIONS = 10;

function pushEndpoint(v: unknown): string {
  if (typeof v !== "string" || v.length > 1000) throw new ApiError("invalid_request", "endpoint must be an https URL");
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new ApiError("invalid_request", "endpoint must be an https URL");
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") throw new ApiError("invalid_request", "endpoint must be an https URL");
  if (!PUSH_HOSTS.some((h) => h.test(url.hostname))) throw new ApiError("invalid_request", "this browser's push service is not supported");
  return v;
}

export async function addPushSubscription(store: Store, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "add_push_subscription");
  const req = onlyFields(input, ["endpoint", "keys", "label"]);
  const endpoint = pushEndpoint(req.endpoint);
  const keys = onlyFields(req.keys, ["p256dh", "auth"]);
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || keys.p256dh.length > 200 || keys.auth.length > 100) throw new ApiError("invalid_request", "keys must have p256dh and auth");
  const label = req.label === undefined ? "" : req.label;
  if (typeof label !== "string" || label.length > 80) throw new ApiError("invalid_request", "label must have at most 80 characters");
  // Subscribing the same browser again replaces its subscription, so it does not count twice.
  const existing = await store.listPush(user.id);
  if (existing.length >= MAX_PUSH_SUBSCRIPTIONS && !existing.some((p) => p.endpoint === endpoint)) {
    throw new ApiError("conflict", `at most ${MAX_PUSH_SUBSCRIPTIONS} browsers receive reminders; remove one first`);
  }
  return store.addPush({ id: entropy.id("ps"), user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, label });
}

export async function listPushSubscriptions(store: Store, userId: string | null) {
  const user = await caller(store, userId, "list_push_subscriptions");
  return (await store.listPush(user.id)).map(({ id, label, created_at, last_used_at }) => ({ id, label, created_at, last_used_at }));
}

export async function removePushSubscription(store: Store, userId: string | null, subscriptionId: unknown) {
  const user = await caller(store, userId, "remove_push_subscription");
  if (typeof subscriptionId !== "string" || !(await store.removePush(subscriptionId, user.id))) throw new ApiError("not_found", "no such push subscription");
}

// Export ------------------------------------------------------------------------------------------

const README = `Cadmium data export

profile.json        Your account: profile, terms acceptance, reminder settings, browser
                    notification subscriptions (labels and creation times), calendar feed state.
characters/*.json   Every character, with sheet and status.
adventures/*.json   Every adventure you published, as a compiled bundle.
campaigns/*.json    Campaigns you authored, with members, materials, invitations, and their
                    instances with events, input logs, narration, and schedules.
memberships.json    Campaigns you joined, with role and join time.
inputs.json         Your inputs in every instance, with the events and narration of each commit.
invitations.json    Invitations you created or accepted.
schedule.json       Your RSVPs and the sessions you created.

drafts/<id>/        Every adventure draft, as YAML files and as the draft document (draft.json).

assets/             Every image you uploaded or use as a portrait: the file, and its record as
                    <hash>.json.
The export is generated on request and is not stored.
`;

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");

/** The ZIP of every record that refers to the user (api.md, Data export). */
export async function exportMyData(store: Store, userId: string | null, now = new Date()): Promise<Uint8Array> {
  const user = await caller(store, userId, "export_my_data");
  const x = (await store.exportUser(user.id)) as {
    profile: Record<string, unknown>;
    push_subscriptions: unknown[];
    characters: { id: string }[];
    adventures: { id: string; version: string }[];
    campaigns: { campaign: { id: string } }[];
    memberships: unknown[];
    inputs: unknown[];
    invitations: unknown[];
    schedule: unknown;
  };
  const { calendar_feed_generation, ...profile } = x.profile;
  void calendar_feed_generation;
  const files: ZipFile[] = [
    { name: "README.txt", data: README },
    { name: "profile.json", data: json({ ...profile, push_subscriptions: x.push_subscriptions, calendar_feed: { enabled: !!user.calendar_token_hash } }) },
    ...x.characters.map((c) => ({ name: `characters/${safe(c.id)}.json`, data: json(c) })),
    ...x.adventures.map((a) => ({ name: `adventures/${safe(a.id)}-${safe(a.version)}.json`, data: json(a) })),
    ...x.campaigns.map((c) => ({ name: `campaigns/${safe(c.campaign.id)}.json`, data: json(c) })),
    { name: "memberships.json", data: json(x.memberships) },
    { name: "inputs.json", data: json(x.inputs) },
    { name: "invitations.json", data: json(x.invitations) },
    { name: "schedule.json", data: json(x.schedule) },
    ...(await store.userAssets(user.id)).flatMap(({ data, ...record }) => [
      { name: `assets/${record.hash}.${String(record.mime).split("/")[1] === "svg+xml" ? "svg" : String(record.mime).split("/")[1]}`, data: Uint8Array.from(atob(data.replace(/\s+/g, "")), (ch) => ch.charCodeAt(0)) },
      { name: `assets/${record.hash}.json`, data: json(record) },
    ]),
    ...(await store.userDrafts(user.id)).flatMap((d) => [
      { name: `drafts/${safe(d.id)}/draft.json`, data: json(d) },
      ...[...draftFiles(d.document)].map(([path, text]) => ({ name: `drafts/${safe(d.id)}/${path}`, data: text })),
    ]),
  ];
  return zip(files, now);
}

// Purge -------------------------------------------------------------------------------------------

/**
 * The daily purge (data-model.md, Deletion): erases accounts, campaigns, characters, and drafts deleted
 * more than 90 days before `now`, then images nothing uses, skipping held ones, and deletes each erased
 * account's identity at the provider. An identity that fails to delete is reported in
 * `identity_errors`; the account's data is erased regardless. Returns the counts.
 */
export async function runPurge(store: Store, deleteIdentity: (userId: string) => Promise<void>, now = new Date()) {
  const due = await store.purgeDue(now);
  for (const id of due.campaigns) await store.purgeCampaign(id);
  const identity_errors: { user_id: string; message: string }[] = [];
  for (const id of due.users) {
    await store.purgeUser(id);
    await deleteIdentity(id).catch((e: unknown) => identity_errors.push({ user_id: id, message: e instanceof Error ? e.message : String(e) }));
  }
  return { users: due.users.length, campaigns: due.campaigns.length, ...(await store.purgeContent(now)), identity_errors };
}
