// Browser subscriptions (app-flow.md, Real-time channels; Stack constraints: subscribe is a Supabase
// Realtime channel; clients reconnect and backfill with get_history(after_version)). Private channels
// authorize with the Clerk session token, which Supabase accepts through its Clerk integration.

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { instanceTopic, userTopic, type Message } from "./index";
import { Sequencer, type HistoryItem } from "./sequencer";

/** A browser client that presents the Clerk session token to Realtime. */
export function realtimeClient(url: string, publishableKey: string, token: () => Promise<string | null>): SupabaseClient {
  return createClient(url, publishableKey, { accessToken: token, auth: { persistSession: false } });
}

export type StreamStatus = "connecting" | "live" | "reconnecting";

/** Retry delays after a channel drops: 1 s doubling to 30 s, reset once it is live again. */
const RETRY_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

/**
 * A private channel on `topic` that stays subscribed. The server closes a channel when its token
 * expires, and the socket drops when a laptop sleeps or a background tab misses heartbeats; the library
 * rejoins only after some errors, so on any error, timeout, or close this removes the channel and
 * subscribes again with a fresh token, with backoff, and again when the tab becomes visible or the
 * network returns. Each failure is logged with its reason.
 */
function keepSubscribed(client: SupabaseClient, topic: string, onPayload: (m: Message) => void, onStatus: (s: StreamStatus) => void, onLive: () => void = () => undefined): () => void {
  let channel: RealtimeChannel | null = null;
  let stopped = false;
  let live = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = undefined;
    // Released before removal, so the old channel's close is not taken for a drop.
    const old = channel;
    channel = null;
    if (old) void client.removeChannel(old);
    const ch = client.channel(topic, { config: { private: true } });
    channel = ch;
    ch.on("broadcast", { event: "*" }, ({ payload }) => onPayload(payload as Message)).subscribe((status, err) => {
      if (stopped || ch !== channel) return;
      if (status === "SUBSCRIBED") {
        live = true;
        attempt = 0;
        onStatus("live");
        onLive();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        live = false;
        onStatus("reconnecting");
        console.warn(`realtime ${topic}: ${status}${err ? ` (${err.message})` : ""}; subscribing again`);
        if (!timer) timer = setTimeout(() => void client.realtime.setAuth().finally(open), RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
      }
    });
  };
  // Back in view or online again: subscribe at once rather than waiting out the backoff.
  const wake = () => {
    if (!live && !stopped && document.visibilityState === "visible") void client.realtime.setAuth().finally(open);
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", wake);
    const old = channel;
    channel = null;
    if (old) void client.removeChannel(old);
  };
}

export interface InstanceStream {
  /** Fetches commits missed so far; also the polling fallback while the channel is down. */
  backfill(): Promise<void>;
  stop(): void;
}

/**
 * Subscribes to an instance's messages after `afterVersion`, in version order. Each (re)connection
 * backfills from the last commit received.
 */
export function subscribeInstance(
  client: SupabaseClient,
  instanceId: string,
  afterVersion: number,
  history: (afterVersion: number) => Promise<HistoryItem[]>,
  onMessage: (m: Message) => void,
  onStatus: (s: StreamStatus) => void = () => undefined,
): InstanceStream {
  const sequencer = new Sequencer(afterVersion, instanceId, onMessage, history);
  const stop = keepSubscribed(client, instanceTopic(instanceId), (m) => sequencer.receive(m), onStatus, () => void sequencer.backfill());
  return { backfill: () => sequencer.backfill(), stop };
}

/** Subscribes to the user's own messages (subscribe_me): declarations, choices, rejections, reminders. */
export function subscribeUser(client: SupabaseClient, userId: string, onMessage: (m: Message) => void): () => void {
  return keepSubscribed(client, userTopic(userId), onMessage, () => undefined);
}
