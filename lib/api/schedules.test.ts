// Schedules and reminders (sprint 18 exit criterion: weekly recurrence across DST; reminders at each
// lead time; resume, pause, and session_end awarding AP).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryBroadcaster } from "../broadcast";
import { canonical, replay } from "../engine";
import { sunkenBundles } from "../harness/scenarios";
import { notifier } from "../notifier";
import { runScheduler } from "../scheduler/run";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCampaign, joinByLink, rotateInviteLink } from "./campaigns";
import { createCharacter } from "./characters";
import type { Entropy } from "./entropy";
import { handle } from "./http";
import { addCharacter, createInstance, pauseInstance, startInstance, submitAction, type Deps } from "./instances";
import { calendarFeed, cancelSession, disableCalendarFeed, exportCalendar, getCalendarFeed, listOccurrences, moveOccurrence, rotateCalendarFeed, rsvp, scheduleSession, updateSession } from "./schedules";
import { code, entropy, richSetting, SIX, SUNKEN, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let broadcast: MemoryBroadcaster;
let clock: { now: Date };
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps, broadcast, clock } = await world(["user_a", "user_b"]));
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

async function table() {
  const campaign = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
  await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", campaign.id, e)).invite_link_code);
  const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Tuesday group" }, e);
  const vale = await createCharacter(store, "user_a", { system: "quest", name: "Vale", choices: { role: "fighter", abilities: SIX } }, e);
  await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: vale.id });
  return { campaign, instance, vale };
}

const weekly = (instanceId: string, over: Record<string, unknown> = {}) =>
  scheduleSession(store, "user_a", { instance_id: instanceId, title: "Weekly game", starts_at: "2026-10-20T18:00:00Z", timezone: "Europe/Berlin", duration_minutes: 180, recurrence: { freq: "weekly", interval: 1, count: 10 }, ...over }, e);

describe("scheduling", () => {
  it("schedules weekly sessions that keep their local time across DST, with RSVPs", async () => {
    const { instance } = await table();
    const s = await weekly(instance.id);
    expect(s).toMatchObject({ status: "scheduled", auto_resume: true, auto_pause: false });
    const list = await listOccurrences(store, "user_b", { instance_id: instance.id, from: "2026-10-19T00:00:00Z", to: "2026-11-04T00:00:00Z" });
    expect(list.map((o) => o.starts_at)).toEqual(["2026-10-20T18:00:00Z", "2026-10-27T19:00:00Z", "2026-11-03T19:00:00Z"]);
    const answered = await rsvp(store, "user_b", { session_id: s.id, occurrence_start: "2026-10-27T19:00:00Z", response: "maybe" });
    expect(answered.rsvps).toEqual({ yes: [], no: [], maybe: ["user_b"] });
    expect(await code(rsvp(store, "user_b", { session_id: s.id, occurrence_start: "2026-10-28T19:00:00Z", response: "yes" }))).toBe("invalid_request");
    expect(await code(listOccurrences(store, "user_b", { instance_id: instance.id, from: "2026-01-01T00:00:00Z", to: "2026-06-01T00:00:00Z" }))).toBe("invalid_request");
  });

  it("lets only the author schedule, move, cancel, and change sessions", async () => {
    const { instance } = await table();
    expect(await code(weekly(instance.id).then(() => scheduleSession(store, "user_b", { instance_id: instance.id, starts_at: "2026-10-20T18:00:00Z", timezone: "UTC", duration_minutes: 60 }, e)))).toBe("forbidden");
    const s = await weekly(instance.id);
    const moved = await moveOccurrence(store, "user_a", { session_id: s.id, occurrence_start: "2026-10-27T19:00:00Z", starts_at: "2026-10-28T19:00:00Z" });
    expect(moved).toMatchObject({ status: "moved", starts_at: "2026-10-28T19:00:00Z", occurrence_start: "2026-10-27T19:00:00Z" });
    await cancelSession(store, "user_a", { session_id: s.id, occurrence_start: "2026-11-03T19:00:00Z" });
    expect((await updateSession(store, "user_a", { session_id: s.id, duration_minutes: 120 })).duration_minutes).toBe(120);
    expect(await code(updateSession(store, "user_a", { session_id: s.id, duration_minutes: 5 }))).toBe("invalid_request");
    expect(await code(weekly(instance.id, { timezone: "Mars/Olympus" }))).toBe("invalid_request");
    expect(await code(weekly(instance.id, { recurrence: { freq: "weekly", interval: 1, count: 3, until: "2027-01-01T00:00:00Z" } }))).toBe("invalid_request");
    await cancelSession(store, "user_a", { session_id: s.id }, new Date("2026-11-05T00:00:00Z"));
    const list = await listOccurrences(store, "user_a", { instance_id: instance.id, from: "2026-10-19T00:00:00Z", to: "2026-11-20T00:00:00Z" });
    expect(list.filter((o) => o.session_id === s.id).map((o) => o.status)).toEqual(["scheduled", "moved", "cancelled", "cancelled", "cancelled"]);
  });

  it("exports iCalendar and serves a feed with alarms at the member's lead times", async () => {
    const { instance } = await table();
    await weekly(instance.id, { recurrence: { freq: "weekly", interval: 1, count: 3 } });
    const exported = await exportCalendar(store, "user_b", instance.id, new Date("2026-10-01T00:00:00Z"));
    expect(exported.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(exported).toContain("DTSTART:20261027T190000Z");
    expect(exported).not.toContain("VALARM");
    const config = { key: "test-feed-key", origin: "https://cadmium.test" };
    expect(await getCalendarFeed(store, "user_b", config)).toEqual({ url: null });
    const { url } = await rotateCalendarFeed(store, "user_b", config);
    expect(await getCalendarFeed(store, "user_b", config)).toEqual({ url });
    const secret = url!.split("/").at(-1)!.replace(".ics", "");
    const feed = await calendarFeed(store, secret, config, new Date("2026-10-19T00:00:00Z"));
    expect(feed.match(/TRIGGER:-PT1440M/g)).toHaveLength(3);
    expect(feed.match(/TRIGGER:-PT15M/g)).toHaveLength(3);
    const next = await rotateCalendarFeed(store, "user_b", config);
    expect(await code(calendarFeed(store, secret, config))).toBe("not_found");
    await disableCalendarFeed(store, "user_b");
    expect(await code(calendarFeed(store, next.url!.split("/").at(-1)!.replace(".ics", ""), config))).toBe("not_found");
  });

  it("serves calendars over the binding as text/calendar", async () => {
    process.env.CALENDAR_FEED_KEY = "test-feed-key";
    const { instance } = await table();
    await weekly(instance.id);
    const r = await handle(new Request(`https://cadmium.test/v1/instances/${instance.id}/calendar.ics`), "user_b", deps);
    expect(r.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    const feed = await handle(new Request("https://cadmium.test/v1/me/calendar-feed", { method: "POST" }), "user_b", deps);
    const { url } = (await feed.json()) as { url: string };
    expect((await handle(new Request(url), null, deps)).status).toBe(200);
  });
});

describe("scheduler", () => {
  const run = () => runScheduler(deps, notifier(deps.broadcast), clock.now);
  const reminders = (user: string) => broadcast.on(`user:${user}`).filter((m) => m.type === "session_reminder");

  it("sends each reminder once at each lead time, except to members who answered no", async () => {
    const { instance } = await table();
    const s = await weekly(instance.id, { recurrence: null });
    clock.now = new Date("2026-10-19T17:59:00Z");
    await run();
    expect(reminders("user_a")).toHaveLength(0);
    clock.now = new Date("2026-10-19T18:00:00Z");
    await run();
    await run();
    expect(reminders("user_a")).toHaveLength(1);
    expect(reminders("user_a")[0]).toMatchObject({ session_id: s.id, occurrence_start: "2026-10-20T18:00:00Z", starts_at: "2026-10-20T18:00:00Z" });
    expect(reminders("user_b")).toHaveLength(1);
    await rsvp(store, "user_b", { session_id: s.id, occurrence_start: "2026-10-20T18:00:00Z", response: "no" });
    clock.now = new Date("2026-10-20T17:45:00Z");
    await run();
    expect(reminders("user_a")).toHaveLength(2);
    expect(reminders("user_b")).toHaveLength(1);
  });

  it("resumes at the start, awards AP at the end, and pauses after the round with auto_pause", async () => {
    const { instance, vale } = await table();
    await startInstance(deps, "user_a", instance.id);
    await pauseInstance(deps, "user_a", instance.id);
    await weekly(instance.id, { recurrence: null, auto_pause: true, duration_minutes: 60 });
    const ap = async () => ((await store.getInstance(instance.id))!.state!.characters[vale.id]!.sheet as unknown as { ap: number }).ap;
    const before = await ap();
    clock.now = new Date("2026-10-20T18:01:00Z");
    expect((await run()).resumed).toBe(1);
    expect((await store.instanceView(instance.id))!.status).toBe("active");
    clock.now = new Date("2026-10-20T19:00:30Z");
    const summary = await run();
    expect(summary).toMatchObject({ session_ends: 1, paused: 1 });
    expect(await ap()).toBe(before + 5);
    expect((await store.instanceView(instance.id))!.status).toBe("paused");
    expect((await run()).session_ends).toBe(0);
    // The award replays like any other commit.
    const r = replay({ ...sunkenBundles(), settings: [richSetting()] }, await store.commits(instance.id));
    expect(r.ok && canonical(r.state) === canonical((await store.getInstance(instance.id))!.state)).toBe(true);
  });

  it("waits for a round under way before auto_pause, and sweeps expired deadlines", async () => {
    const { campaign, instance } = await table();
    const rook = await createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "spy", abilities: SIX } }, e);
    await addCharacter(deps, "user_b", { instance_id: instance.id, character_id: rook.id });
    void campaign;
    await startInstance(deps, "user_a", instance.id);
    await weekly(instance.id, { recurrence: null, auto_pause: true, duration_minutes: 60, starts_at: "2026-10-22T17:00:00Z" });
    await submitAction(deps, "user_b", { instance_id: instance.id, tool: "wait", args: {}, idempotency_key: "rook-waits-001" }, e);
    clock.now = new Date("2026-10-22T18:00:30Z");
    await run();
    expect((await store.instanceView(instance.id))!.status).toBe("active");
    // The round deadline (120 s after the start at 18:00) passes; the sweep advances, the round closes, and the pause follows.
    clock.now = new Date("2026-10-22T18:05:00Z");
    expect((await run()).advanced).toBe(1);
    expect((await store.instanceView(instance.id))!.status).toBe("paused");
  });
});
