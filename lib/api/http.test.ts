// The HTTP binding (sprint 13 exit criterion: two players play one instance over the binding).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { handle, RATE_LIMIT } from "./http";
import type { Deps } from "./instances";
import { SIX, SUNKEN, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_a", "user_b"]));
});
afterEach(async () => {
  await db.close();
});

async function call(user: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const request = new Request(`https://cadmium.test/v1${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const response = await handle(request, user, deps);
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : undefined };
}

describe("HTTP binding", () => {
  it("lets two players set up and play one instance", async () => {
    const campaign = await call("user_a", "POST", "/campaigns", { title: "The Sunken Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN });
    expect(campaign.status).toBe(201);
    const k = campaign.body.campaign.id as string;
    const invitation = await call("user_a", "POST", `/campaigns/${k}/invitations`, { message: "Join us Tuesdays.", note: "for Rook" });
    expect(invitation).toMatchObject({ status: 201, body: { invitation: { status: "pending", note: "for Rook" } } });
    expect(invitation.body.url).toBe(`https://cadmium.test/invite/${invitation.body.code}`);
    expect((await call(null, "GET", `/invitations/code/${invitation.body.code}`)).body).toMatchObject({ campaign_title: "The Sunken Archive", inviter_display_name: "A" });
    expect((await call("user_b", "POST", "/invitations/accept", { code: invitation.body.code })).body.campaign.members).toHaveLength(2);

    const instance = await call("user_a", "POST", `/campaigns/${k}/instances`, { name: "Tuesday group" });
    expect(instance).toMatchObject({ status: 201, body: { instance: { status: "lobby", version: 0 } } });
    const i = instance.body.instance.id as string;
    for (const [user, name] of [["user_a", "Vale"], ["user_b", "Rook"]] as const) {
      const ch = await call(user, "POST", "/characters", { system: "quest", name, choices: { role: "fighter", abilities: SIX } });
      expect(ch.status).toBe(201);
      expect((await call(user, "POST", `/instances/${i}/characters`, { character_id: ch.body.character.id })).status).toBe(200);
    }
    expect((await call("user_a", "POST", `/instances/${i}/start`)).body.instance).toMatchObject({ status: "active", version: 1 });

    const key = { "Idempotency-Key": "rook-wait-http-01" };
    const accepted = await call("user_b", "POST", `/instances/${i}/actions`, { tool: "wait", args: {} }, key);
    expect(accepted).toMatchObject({ status: 202, body: { accepted: true } });
    expect((await call("user_b", "POST", `/instances/${i}/actions`, { tool: "wait", args: {} }, key)).body.input_id).toBe(accepted.body.input_id);
    await call("user_a", "POST", `/instances/${i}/actions`, { tool: "wait", args: {} }, { "Idempotency-Key": "vale-wait-http-01" });

    const seen = await call("user_b", "GET", `/instances/${i}`);
    expect(seen.body).toMatchObject({ instance: { version: 3 }, view: { round: { number: 2 } } });
    const history = await call("user_b", "GET", `/instances/${i}/history?after_version=1`);
    expect(history.body.items.map((h: { version: number }) => h.version)).toEqual([2, 3]);
  });

  it("maps error codes to HTTP statuses", async () => {
    expect((await call(null, "GET", "/me")).status).toBe(401);
    expect((await call("user_a", "GET", "/campaigns/nope")).status).toBe(404);
    expect((await call("user_a", "POST", "/characters", { system: "quest", name: "" , choices: {} })).status).toBe(422);
    expect((await call("user_a", "POST", "/characters", "not an object")).status).toBe(422);
    expect((await call("user_a", "GET", "/nowhere")).status).toBe(404);
    expect((await call("user_a", "PUT", "/me")).status).toBe(405);
    const c = await call("user_a", "POST", "/campaigns", { title: "T", system: "quest", system_versions: "^1.0", materials: SUNKEN });
    expect((await call("user_a", "POST", `/campaigns/${c.body.campaign.id}/archive`)).status).toBe(200);
    expect((await call("user_a", "POST", `/campaigns/${c.body.campaign.id}/archive`)).status).toBe(409);
    expect((await call("user_a", "POST", `/campaigns/${c.body.campaign.id}/instances`, { name: "Late" })).body).toEqual({ error: { code: "conflict", detail: "an archived campaign accepts no new instances" } });
  });

  it("limits requests per user per minute, with Retry-After", async () => {
    for (let n = 0; n < RATE_LIMIT.limit; n++) await store.rateHit("user_a", "api", RATE_LIMIT.window_seconds, RATE_LIMIT.limit);
    const limited = await call("user_a", "GET", "/me");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(limited.body.error.retry_after_ms).toBeGreaterThan(0);
    expect((await call("user_b", "GET", "/me")).status).toBe(200);
  });

  it("refuses cookie-authenticated writes from other sites", async () => {
    expect((await call("user_a", "PATCH", "/me", { display_name: "Mallory" }, { Origin: "https://evil.test" })).body).toEqual({ error: { code: "forbidden", detail: "requests from other sites are refused" } });
    expect((await call("user_a", "PATCH", "/me", { display_name: "Mallory" }, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await call("user_a", "PATCH", "/me", { display_name: "Ann" }, { Origin: "https://cadmium.test" })).status).toBe(200);
    // A bearer token is not sent by a browser on its own, and a missing Origin is not a browser form.
    expect((await call("user_a", "PATCH", "/me", { display_name: "Ann" }, { Origin: "https://app.test", Authorization: "Bearer t" })).status).toBe(200);
    expect((await call("user_a", "PATCH", "/me", { display_name: "Ann" })).status).toBe(200);
    expect((await call("user_a", "GET", "/me", undefined, { Origin: "https://evil.test" })).status).toBe(200);
  });

  it("treats a malformed escape in a path as no match", async () => {
    expect((await call("user_a", "GET", "/campaigns/%E0")).status).toBe(404);
  });
});
