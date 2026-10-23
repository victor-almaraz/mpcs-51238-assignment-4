// Settings, export, and deletion (sprint 19 exit criterion: the export contains every listed file;
// deletion follows the 30- and 90-day stages).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unzip } from "../export/zip";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { addPushSubscription, exportMyData, listPushSubscriptions, removePushSubscription, requestAccountDeletion, restoreAccount, runPurge, updateMe } from "./account";
import { createCampaign, getCampaign, joinByLink, rotateInviteLink } from "./campaigns";
import { createCharacter } from "./characters";
import type { Entropy } from "./entropy";
import { addCharacter, createInstance, startInstance, submitAction, type Deps } from "./instances";
import { invite } from "./invitations";
import { rsvp, scheduleSession } from "./schedules";
import { code, entropy, SIX, SUNKEN, world } from "./testing/fixtures";
import { getMe } from "./users";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_a", "user_b"]));
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

/** A's campaign with an instance in play where B's character Rook has acted; B also authors one. */
async function lives() {
  const k = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
  await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", k.id, e)).invite_link_code);
  const instance = await createInstance(store, "user_a", { campaign_id: k.id, name: "Tuesday group" }, e);
  const rook = await createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "spy", abilities: SIX } }, e);
  await addCharacter(deps, "user_b", { instance_id: instance.id, character_id: rook.id });
  await startInstance(deps, "user_a", instance.id);
  await submitAction(deps, "user_b", { instance_id: instance.id, tool: "wait", args: {}, idempotency_key: "rook-waits-0001" }, e);
  const s = await scheduleSession(store, "user_a", { instance_id: instance.id, starts_at: "2026-10-27T18:00:00Z", timezone: "UTC", duration_minutes: 60 }, e);
  await rsvp(store, "user_b", { session_id: s.id, occurrence_start: "2026-10-27T18:00:00Z", response: "yes" });
  const own = await createCampaign(store, "user_b", { title: "Rook's own", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
  await invite(store, "user_b", { campaign_id: own.id, note: "for Ada" }, e);
  return { k, instance, rook, own };
}

describe("settings", () => {
  it("updates display name, time zone, and reminders, and leaves sign-in details to Clerk", async () => {
    const me = await updateMe(store, "user_a", { display_name: "Ada", timezone: "Europe/Berlin", reminders: { push: false, lead_minutes: [15, 1440, 15] } });
    expect(me).toMatchObject({ display_name: "Ada", timezone: "Europe/Berlin", reminders: { push: false, lead_minutes: [1440, 15] } });
    expect(await code(updateMe(store, "user_a", { timezone: "Nowhere/City" }))).toBe("invalid_request");
    expect(await code(updateMe(store, "user_a", { reminders: { push: true, lead_minutes: [1] } }))).toBe("invalid_request");
    expect(await code(updateMe(store, "user_a", { email: "new@example.org" }))).toBe("invalid_request");
  });

  it("adds, lists, and removes browser subscriptions without revealing their keys", async () => {
    const s = await addPushSubscription(store, "user_a", { endpoint: "https://push.example/abc", keys: { p256dh: "key", auth: "secret" }, label: "Firefox on a laptop" }, e);
    expect(await listPushSubscriptions(store, "user_a")).toEqual([{ id: s.id, label: "Firefox on a laptop", created_at: expect.any(String), last_used_at: null }]);
    expect(await code(addPushSubscription(store, "user_a", { endpoint: "http://insecure", keys: { p256dh: "k", auth: "a" } }, e))).toBe("invalid_request");
    await removePushSubscription(store, "user_a", s.id);
    expect(await listPushSubscriptions(store, "user_a")).toEqual([]);
  });
});

describe("export", () => {
  it("contains every listed file, with the user's records", async () => {
    const { own, rook } = await lives();
    await addPushSubscription(store, "user_b", { endpoint: "https://push.example/b", keys: { p256dh: "k", auth: "a" }, label: "Phone" }, e);
    const files = unzip(await exportMyData(store, "user_b"));
    const read = (name: string) => JSON.parse(new TextDecoder().decode(files.get(name)!));
    expect([...files.keys()].sort()).toEqual(["README.txt", `campaigns/${own.id}.json`, `characters/${rook.id}.json`, "inputs.json", "invitations.json", "memberships.json", "profile.json", "schedule.json"].sort());
    const profile = read("profile.json");
    expect(profile).toMatchObject({ id: "user_b", push_subscriptions: [{ label: "Phone" }], calendar_feed: { enabled: false } });
    expect(JSON.stringify(profile)).not.toMatch(/calendar_token_hash|p256dh/);
    expect(read(`characters/${rook.id}.json`)).toMatchObject({ name: "Rook", status: "in_instance" });
    expect(read("inputs.json")[0]).toMatchObject({ user_id: "user_b", events: expect.any(Array) });
    expect(read("memberships.json").map((m: { role: string }) => m.role).sort()).toEqual(["author", "player"]);
    expect(read("schedule.json").rsvps).toHaveLength(1);
    expect(read("invitations.json")[0]).toMatchObject({ note: "for Ada" });
    expect(JSON.stringify(read(`campaigns/${own.id}.json`))).not.toContain("token_hash");
  });
});

describe("deletion", () => {
  it("closes the account, hides it from members, and restores it within 30 days", async () => {
    const { k } = await lives();
    expect(await code(requestAccountDeletion(store, "user_b", { confirm: "wrong" }))).toBe("invalid_request");
    const stages = await requestAccountDeletion(store, "user_b", { confirm: "B" });
    expect(Date.parse(stages.purge_after) - Date.parse(stages.restorable_until)).toBe(60 * 86_400_000);
    expect((await getCampaign(store, "user_a", k.id)).members.map((m) => m.user_id)).toEqual(["user_a"]);
    expect(await code(createCharacter(store, "user_b", { system: "quest", name: "X", choices: {} }, e))).toBe("forbidden");
    expect(await code(getMe(store, "user_b"))).toBe("ok");
    expect(await code(exportMyData(store, "user_b"))).toBe("ok");
    expect((await restoreAccount(store, "user_b")).id).toBe("user_b");
    expect((await getCampaign(store, "user_a", k.id)).members).toHaveLength(2);
    await requestAccountDeletion(store, "user_b", { confirm: "B" });
    await db.query("update users set deletion_requested_at = now() - interval '31 days' where id = 'user_b'");
    expect(await code(restoreAccount(store, "user_b"))).toBe("conflict");
  });

  it("purges after 90 days: the account and what it owns, naming it a former player elsewhere", async () => {
    const { k, instance, rook, own } = await lives();
    await requestAccountDeletion(store, "user_b", { confirm: "B" });
    const erased: string[] = [];
    expect(await runPurge(store, async (id) => void erased.push(id))).toEqual({ users: 0, campaigns: 0 });
    await db.query("update users set deletion_requested_at = now() - interval '91 days' where id = 'user_b'");
    expect(await runPurge(store, async (id) => void erased.push(id))).toEqual({ users: 1, campaigns: 0 });
    expect(erased).toEqual(["user_b"]);
    expect(await store.getUser("user_b")).toBeUndefined();
    expect(await store.getCharacter(rook.id)).toBeUndefined();
    expect(await store.getCampaign(own.id)).toBeUndefined();
    expect((await getCampaign(store, "user_a", k.id)).members.map((m) => m.user_id)).toEqual(["user_a"]);
    const { rows } = await db.query<{ payload: { actor_label?: string } }>("select payload from events where instance_id = $1 and actor_id = $2", [instance.id, rook.id]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.payload.actor_label === "Former player")).toBe(true);
    expect((await db.query("select 1 from input_logs where user_id = 'user_b'")).rows).toHaveLength(0);
    expect((await db.query("select 1 from rsvps where user_id = 'user_b'")).rows).toHaveLength(0);
  });

  it("skips held accounts until the hold is cleared", async () => {
    await requestAccountDeletion(store, "user_b", { confirm: "B" });
    await db.query("update users set deletion_requested_at = now() - interval '91 days', held_at = now(), hold_reason = 'report' where id = 'user_b'");
    expect((await runPurge(store, async () => undefined)).users).toBe(0);
    expect(await store.getUser("user_b")).toBeDefined();
  });
});
