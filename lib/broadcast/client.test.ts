// Channels stay subscribed: after an error, timeout, or close, the client subscribes again with a
// fresh token, with backoff, and at once when the tab becomes visible.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeUser } from "./client";

type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

function fakeClient() {
  const channels: { topic: string; report: (s: Status) => void; removed: boolean }[] = [];
  const setAuth = vi.fn(async () => undefined);
  const client = {
    realtime: { setAuth },
    channel(topic: string) {
      const entry: { topic: string; report: (s: Status) => void; removed: boolean } = { topic, report: () => undefined, removed: false };
      channels.push(entry);
      const ch = {
        on: () => ch,
        subscribe: (cb: (s: Status, err?: Error) => void) => {
          entry.report = (s) => cb(s);
          return ch;
        },
      };
      return ch;
    },
    removeChannel: async (ch: unknown) => {
      void ch;
      const open = channels.filter((c) => !c.removed);
      open[0]!.removed = true;
      return "ok";
    },
  };
  return { client: client as unknown as SupabaseClient, channels, setAuth };
}

const listeners = new Map<string, () => void>();
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const target = { addEventListener: (k: string, f: () => void) => listeners.set(k, f), removeEventListener: (k: string) => listeners.delete(k) };
  vi.stubGlobal("document", { ...target, visibilityState: "visible" });
  vi.stubGlobal("window", target);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  listeners.clear();
});

describe("keeping a channel subscribed", () => {
  it("subscribes again with a fresh token after the server closes the channel", async () => {
    const { client, channels, setAuth } = fakeClient();
    subscribeUser(client, "user_a", () => undefined);
    channels[0]!.report("SUBSCRIBED");
    channels[0]!.report("CLOSED");
    expect(channels).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(setAuth).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(2);
    expect(channels[0]!.removed).toBe(true);
    expect(channels[1]!.topic).toBe("user:user_a");
  });

  it("backs off while it keeps failing, and once live again starts from the shortest wait", async () => {
    const { client, channels } = fakeClient();
    subscribeUser(client, "user_a", () => undefined);
    channels[0]!.report("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(1_000);
    channels[1]!.report("TIMED_OUT");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(channels).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(channels).toHaveLength(3);
    channels[2]!.report("SUBSCRIBED");
    channels[2]!.report("CLOSED");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(channels).toHaveLength(4);
  });

  it("subscribes at once when the tab comes back into view, and not at all once stopped", async () => {
    const { client, channels } = fakeClient();
    const stop = subscribeUser(client, "user_a", () => undefined);
    channels[0]!.report("CLOSED");
    listeners.get("visibilitychange")!();
    await vi.advanceTimersByTimeAsync(0);
    expect(channels).toHaveLength(2);
    stop();
    channels[1]!.report("CLOSED");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(channels).toHaveLength(2);
    expect(listeners.size).toBe(0);
  });
});
