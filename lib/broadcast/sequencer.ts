// Client-side ordering for an instance stream (api.md, subscribe: messages arrive in version order; a
// client that detects a gap backfills with after_version). Realtime channels may drop or reorder
// messages, so commits are delivered strictly in version order and gaps are filled from history.

import type { Message } from "./index";

export interface HistoryItem {
  version: number;
  actor_id: string | null;
  events: unknown[];
  narration: { text: string; source: string } | null;
}

/** Commit and narration messages for history items, as the stream would have carried them. */
export function messagesOf(instanceId: string, items: readonly HistoryItem[]): Message[] {
  return items.flatMap((h) => [
    { type: "commit", instance_id: instanceId, version: h.version, events: h.events, actor_id: h.actor_id },
    ...(h.narration ? [{ type: "narration", instance_id: instanceId, version: h.version, ...h.narration }] : []),
  ]);
}

export class Sequencer {
  #last: number;
  #pending: Message[] = [];
  #filling: Promise<void> | null = null;

  /**
   * @param last the last commit version the client has
   * @param deliver receives messages in order
   * @param history fetches commits after a version (get_history)
   */
  constructor(
    last: number,
    private readonly instanceId: string,
    private readonly deliver: (m: Message) => void,
    private readonly history: (afterVersion: number) => Promise<HistoryItem[]>,
  ) {
    this.#last = last;
  }

  get last(): number {
    return this.#last;
  }

  /** Accepts a live message: delivers it if its commit has arrived, else holds it and backfills. */
  receive(m: Message): void {
    if (m.type === "commit" && m.version <= this.#last) return;
    this.#pending.push(m);
    this.#flush();
    if (this.#pending.some((p) => p.type === "commit")) void this.backfill();
  }

  /** Fetches and delivers every commit after the last one; called on (re)connection and on gaps. */
  backfill(): Promise<void> {
    this.#filling ??= (async () => {
      try {
        let after = this.#last;
        for (;;) {
          const items = await this.history(after);
          if (items.length === 0) break;
          for (const m of messagesOf(this.instanceId, items)) this.#pending.push(m);
          after = items.at(-1)!.version;
          this.#flush();
        }
      } finally {
        this.#filling = null;
      }
    })();
    return this.#filling;
  }

  #flush(): void {
    for (;;) {
      this.#pending.sort((a, b) => a.version - b.version || Number(b.type === "commit") - Number(a.type === "commit"));
      const next = this.#pending[0];
      if (!next) return;
      if (next.type === "commit") {
        if (next.version <= this.#last) {
          this.#pending.shift();
          continue;
        }
        if (next.version !== this.#last + 1) return;
        this.#last = next.version;
      } else if (next.version > this.#last) return;
      this.#pending.shift();
      this.deliver(next);
    }
  }
}
