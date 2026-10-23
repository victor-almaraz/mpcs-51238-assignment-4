// The Broadcaster (architecture.md, Components; app-flow.md, Real-time channels): delivers messages
// on `instance:{id}` and `user:{id}` channels. Delivery is best effort: a client that misses a
// commit backfills it with get_history(after_version).

export interface Message {
  type: string;
  instance_id: string;
  version: number;
  [field: string]: unknown;
}

export interface Broadcaster {
  send(topic: string, messages: readonly Message[]): Promise<void>;
}

export const instanceTopic = (id: string) => `instance:${id}`;
export const userTopic = (id: string) => `user:${id}`;

/** Records messages; for tests. */
export class MemoryBroadcaster implements Broadcaster {
  readonly sent: { topic: string; message: Message }[] = [];

  async send(topic: string, messages: readonly Message[]): Promise<void> {
    for (const message of messages) this.sent.push({ topic, message: structuredClone(message) });
  }

  on(topic: string): Message[] {
    return this.sent.filter((s) => s.topic === topic).map((s) => s.message);
  }
}

/**
 * Supabase Realtime broadcast over its REST endpoint, as private channels, so only subscribers the
 * `realtime.messages` policy admits receive them. Each message's `type` is its broadcast event.
 */
export function supabaseBroadcaster(url: string, serviceKey: string, fetcher: typeof fetch = fetch): Broadcaster {
  return {
    async send(topic, messages) {
      if (messages.length === 0) return;
      const response = await fetcher(`${url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ messages: messages.map((m) => ({ topic, event: m.type, payload: m, private: true })) }),
      });
      if (!response.ok) throw new Error(`broadcast to ${topic} failed with HTTP ${response.status}`);
    },
  };
}
