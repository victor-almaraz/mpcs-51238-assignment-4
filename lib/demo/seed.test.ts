// Demo mode (lib/server/demo.ts): the seed builds its world through the operations, and the mode stays
// off outside `next dev`.

import { afterEach, describe, expect, it, vi } from "vitest";
import { demoMode } from "../server/demo";
import { Store } from "../store";
import { sqlRpc } from "../store/sql-rpc";
import { testDb } from "../store/testing/pglite";
import { seedDemo } from "./seed";

afterEach(() => vi.unstubAllEnvs());

describe("demo mode", () => {
  it("seeds every screen's content", async () => {
    const db = await testDb();
    const store = new Store(sqlRpc(db));
    const w = await seedDemo(store, new Date("2026-10-24T12:00:00Z"));
    expect((await store.getInstance(w.game))!.status).toBe("active");
    expect((await store.getInstance(w.game))!.version).toBeGreaterThan(5);
    expect((await store.getInstance(w.lobby))!.status).toBe("lobby");
    expect(w.draft).not.toBeNull();
    const count = async (t: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${t}`)).rows[0]!.n;
    expect([await count("users"), await count("campaigns"), await count("scheduled_sessions"), await count("invitations")]).toEqual([4, 4, 1, 1]);
    // The fourth user, Nell, has nothing: the hubs' empty states.
    expect((await store.listCharacters("user_new", { limit: 10 })).length + (await store.listCampaigns("user_new", { limit: 10 })).length).toBe(0);
    // The Campaigns hub's Archived and Recently deleted sections each have one campaign.
    expect((await store.listCampaigns("user_demo", { archived: true, limit: 10 })).map((c) => c.title)).toEqual(["Summer in Vessaro"]);
    expect((await store.deletedCampaigns("user_demo")).map((c) => c.title)).toEqual(["Test table"]);
    await db.close();
  });

  it("turns on only with CADMIUM_DEMO under next dev, never on Vercel", () => {
    vi.stubEnv("CADMIUM_DEMO", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(demoMode()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(demoMode()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    expect(demoMode()).toBe(false);
  });
});
