// Who receives live messages and calendar feeds (SECURITY_AUDIT.md, S-10): members of a live campaign
// whose account is active and not suspended.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCampaign, joinByLink, rotateInviteLink } from "./campaigns";
import { createInstance } from "./instances";
import { calendarFeed, rotateCalendarFeed } from "./schedules";
import { code, entropy, SUNKEN, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;

beforeEach(async () => {
  ({ db, store } = await world(["user_a", "user_b", "user_c"]));
  // Supabase's auth.jwt(), reading the subscriber's id from a setting.
  await db.exec("create schema auth; create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub', current_setting('test.sub', true)) $$;");
});
afterEach(async () => {
  await db.close();
});

async function may(sub: string, topic: string): Promise<boolean> {
  await db.query("select set_config('test.sub', $1, false)", [sub]);
  return (await db.query<{ ok: boolean }>("select realtime_may_receive($1) as ok", [topic])).rows[0]!.ok;
}

async function table() {
  const e = entropy();
  const campaign = await createCampaign(store, "user_a", { title: "The Sunken Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
  await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", campaign.id, e)).invite_link_code);
  const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Tuesday group" }, e);
  return { campaign, instance };
}

describe("Realtime channel access", () => {
  it("admits members to the instance channel and each user to their own", async () => {
    const { instance } = await table();
    expect(await may("user_b", `instance:${instance.id}`)).toBe(true);
    expect(await may("user_b", "user:user_b")).toBe(true);
    expect(await may("user_b", "user:user_a")).toBe(false);
    expect(await may("user_c", `instance:${instance.id}`)).toBe(false);
    expect(await may("user_b", "other:topic")).toBe(false);
  });

  it("refuses a suspended user, and every member of a deleted campaign", async () => {
    const { campaign, instance } = await table();
    await store.setSuspended("user_b", true);
    expect(await may("user_b", `instance:${instance.id}`)).toBe(false);
    expect(await may("user_b", "user:user_b")).toBe(false);
    await store.setSuspended("user_b", false);
    expect(await may("user_b", `instance:${instance.id}`)).toBe(true);
    await store.deleteCampaign(campaign.id);
    expect(await may("user_a", `instance:${instance.id}`)).toBe(false);
    expect(await may("user_a", "user:user_a")).toBe(true);
  });
});

describe("calendar feeds", () => {
  it("stop serving a suspended user", async () => {
    const config = { key: "test-key", origin: "https://cadmium.test" };
    const { url } = await rotateCalendarFeed(store, "user_b", config);
    const secret = url.split("/").at(-1)!.replace(".ics", "");
    expect(await calendarFeed(store, secret, config)).toContain("BEGIN:VCALENDAR");
    await store.setSuspended("user_b", true);
    expect(await code(calendarFeed(store, secret, config))).toBe("not_found");
  });
});
