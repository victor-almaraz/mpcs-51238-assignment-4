// Server actions share the HTTP binding's per-user limit (SECURITY_AUDIT.md, S-14).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMIT } from "../api/limits";

const hits: string[] = [];
let wait = 0;
let user: { id: string } | undefined = { id: "user_a" };

vi.mock("./session", () => ({ sessionUser: async () => user }));
vi.mock("./supabase", () => ({
  serverStore: () => ({
    rateHit: async (id: string, scope: string, windowSeconds: number, limit: number) => {
      hits.push(`${id} ${scope} ${windowSeconds} ${limit}`);
      return wait;
    },
  }),
}));

const { attempt } = await import("./forms");

beforeEach(() => {
  hits.length = 0;
  wait = 0;
  user = { id: "user_a" };
});

describe("attempt", () => {
  it("counts each call against the user's limit, except reads", async () => {
    expect(await attempt(async (id) => id)).toEqual({ ok: "user_a" });
    expect(await attempt(async () => "view", { read: true })).toEqual({ ok: "view" });
    expect(hits).toEqual([`user_a api ${RATE_LIMIT.window_seconds} ${RATE_LIMIT.limit}`]);
  });

  it("refuses without running the operation once the limit is reached", async () => {
    wait = 2500;
    const run = vi.fn(async () => "done");
    expect(await attempt(run)).toEqual({ error: "too many requests; try again in 3 seconds" });
    expect(run).not.toHaveBeenCalled();
  });

  it("does not count a visitor who is not signed in", async () => {
    user = undefined;
    expect(await attempt(async (id) => id)).toEqual({ ok: null });
    expect(hits).toEqual([]);
  });
});
