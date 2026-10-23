// Browser subscriptions (app-flow.md, Real-time channels; Stack constraints: subscribe is a Supabase
// Realtime channel; clients reconnect and backfill with get_history(after_version)). Private channels
// authorize with the Clerk session token, which Supabase accepts through its Clerk integration.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { instanceTopic, userTopic, type Message } from "./index";
import { Sequencer, type HistoryItem } from "./sequencer";

/** A browser client that presents the Clerk session token to Realtime. */
export function realtimeClient(url: string, publishableKey: string, token: () => Promise<string | null>): SupabaseClient {
  return createClient(url, publishableKey, { accessToken: token, auth: { persistSession: false } });
}

/**
 * Subscribes to an instance's messages after `afterVersion`, in version order. Each (re)connection
 * backfills from the last commit received. Returns a function that unsubscribes.
 */
export function subscribeInstance(client: SupabaseClient, instanceId: string, afterVersion: number, history: (afterVersion: number) => Promise<HistoryItem[]>, onMessage: (m: Message) => void): () => void {
  const sequencer = new Sequencer(afterVersion, instanceId, onMessage, history);
  const channel = client
    .channel(instanceTopic(instanceId), { config: { private: true } })
    .on("broadcast", { event: "*" }, ({ payload }) => sequencer.receive(payload as Message))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void sequencer.backfill();
    });
  return () => void client.removeChannel(channel);
}

/** Subscribes to the user's own messages (subscribe_me): declarations, choices, rejections, reminders. */
export function subscribeUser(client: SupabaseClient, userId: string, onMessage: (m: Message) => void): () => void {
  const channel = client
    .channel(userTopic(userId), { config: { private: true } })
    .on("broadcast", { event: "*" }, ({ payload }) => onMessage(payload as Message))
    .subscribe();
  return () => void client.removeChannel(channel);
}
