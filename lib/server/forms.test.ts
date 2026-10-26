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
    expect(await attempt(run)).toEqual({ error: "Too many requests; try again in 3 seconds." });
    expect(run).not.toHaveBeenCalled();
  });

  it("does not count a visitor who is not signed in", async () => {
    user = undefined;
    expect(await attempt(async (id) => id)).toEqual({ ok: null });
    expect(hits).toEqual([]);
  });
});

describe("plain", () => {
  it("names a leading field in words and ends the sentence", async () => {
    const { plain } = await import("./forms");
    expect(plain("display_name must have 1 to 40 characters")).toBe("Display name must have 1 to 40 characters.");
    expect(plain("reminders.lead_minutes must list minutes")).toBe("Reminders lead minutes must list minutes.");
    expect(plain("the campaign is archived")).toBe("The campaign is archived.");
    expect(plain("setting lantern_coast requires the module armor")).toBe("Setting lantern_coast requires the module armor.");
    expect(plain("Already a sentence.")).toBe("Already a sentence.");
  });
});
