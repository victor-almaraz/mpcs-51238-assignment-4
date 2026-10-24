// Notifications: the reminders /notifications lists match what the Scheduler sends on the user stream.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryBroadcaster } from "../broadcast";
import { notifier } from "../notifier";
import { runScheduler } from "../scheduler/run";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { updateMe } from "./account";
import { createCampaign, joinByLink, rotateInviteLink } from "./campaigns";
import { createCharacter } from "./characters";
import type { Entropy } from "./entropy";
import { addCharacter, createInstance, endInstance, startInstance, type Deps } from "./instances";
import { listReminders } from "./notifications";
import { cancelSession, rsvp, scheduleSession } from "./schedules";
import { code, entropy, SIX, SUNKEN, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let broadcast: MemoryBroadcaster;
let clock: { now: Date };
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps, broadcast, clock } = await world(["user_a", "user_b", "user_c"]));
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

async function table() {
  const campaign = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
  await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", campaign.id, e)).invite_link_code);
  const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Tuesday group" }, e);
  return { campaign, instance };
}

const weekly = (instanceId: string, over: Record<string, unknown> = {}) =>
  scheduleSession(store, "user_a", { instance_id: instanceId, title: "Weekly game", starts_at: "2026-10-20T18:00:00Z", timezone: "Europe/Berlin", duration_minutes: 180, recurrence: { freq: "weekly", interval: 1, count: 10 }, ...over }, e);

const sent = (user: string) => broadcast.on(`user:${user}`).filter((m) => m.type === "session_reminder");

describe("listReminders", () => {
  it("lists sent reminders newest first and upcoming ones soonest first, as the Scheduler sends them", async () => {
    const { campaign, instance } = await table();
    const s = await weekly(instance.id);
    clock.now = new Date("2026-10-20T17:50:00Z");
    await runScheduler(deps, notifier(deps.broadcast), clock.now);
    const { recent, upcoming } = await listReminders(store, "user_b", {}, clock.now);
    // Both lead times (1440 and 15 minutes) of the 20 October occurrence have passed.
    expect(sent("user_b")).toHaveLength(2);
    expect(recent.map((r) => [r.occurrence_start, r.lead_minutes])).toEqual([
      ["2026-10-20T18:00:00Z", 15],
      ["2026-10-20T18:00:00Z", 1440],
    ]);
    expect(recent.map((r) => r.session_id)).toEqual(sent("user_b").map((m) => m.session_id));
    expect(recent[0]).toMatchObject({ instance_id: instance.id, instance_name: "Tuesday group", campaign_title: campaign.title, title: "Weekly game", starts_at: "2026-10-20T18:00:00Z", remind_at: "2026-10-20T17:45:00.000Z", sent: true });
    // The next week's occurrence is at 19:00 UTC after the end of summer time in Berlin.
    // Its 15-minute reminder falls just outside the 7-day window.
    expect(upcoming.map((r) => [r.starts_at, r.lead_minutes, r.remind_at])).toEqual([["2026-10-27T19:00:00Z", 1440, "2026-10-26T19:00:00.000Z"]]);
    expect(upcoming.every((r) => !r.sent)).toBe(true);
    expect(s.id).toBe(recent[0]!.session_id);
  });

  it("leaves out declined and cancelled occurrences, ended instances, and other users' campaigns", async () => {
    const { instance } = await table();
    const s = await weekly(instance.id);
    await rsvp(store, "user_b", { session_id: s.id, occurrence_start: "2026-10-27T19:00:00Z", response: "no" });
    await cancelSession(store, "user_a", { session_id: s.id, occurrence_start: "2026-11-03T19:00:00Z" });
    const now = new Date("2026-10-21T00:00:00Z");
    expect((await listReminders(store, "user_b", { days: 14 }, now)).upcoming).toEqual([]);
    expect((await listReminders(store, "user_a", { days: 14 }, now)).upcoming.map((r) => r.starts_at)).toEqual(["2026-10-27T19:00:00Z", "2026-10-27T19:00:00Z"]);
    expect(await listReminders(store, "user_c", {}, now)).toEqual({ recent: [], upcoming: [] });
    const vale = await createCharacter(store, "user_a", { system: "quest", name: "Vale", choices: { role: "fighter", abilities: SIX } }, e);
    await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: vale.id });
    await startInstance(deps, "user_a", instance.id);
    expect((await endInstance(deps, "user_a", instance.id)).status).toBe("ended");
    expect((await listReminders(store, "user_a", { days: 14 }, now)).upcoming).toEqual([]);
  });

  it("follows the user's own lead times", async () => {
    const { instance } = await table();
    await weekly(instance.id, { recurrence: null });
    await updateMe(store, "user_b", { reminders: { push: false, lead_minutes: [60] } });
    const { upcoming } = await listReminders(store, "user_b", {}, new Date("2026-10-20T00:00:00Z"));
    expect(upcoming.map((r) => [r.lead_minutes, r.remind_at])).toEqual([[60, "2026-10-20T17:00:00.000Z"]]);
  });

  it("requires a signed-in user and a valid window", async () => {
    expect(await code(listReminders(store, null))).toBe("unauthenticated");
    expect(await code(listReminders(store, "user_a", { days: 0 }))).toBe("invalid_request");
    expect(await code(listReminders(store, "user_a", { days: 31 }))).toBe("invalid_request");
    expect(await code(listReminders(store, "user_a", { from: "x" }))).toBe("invalid_request");
  });
});
