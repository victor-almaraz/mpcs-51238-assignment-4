import { describe, expect, it } from "vitest";
import type { Message } from "./index";
import { Sequencer, type HistoryItem } from "./sequencer";

const commit = (version: number): Message => ({ type: "commit", instance_id: "i_1", version, events: [], actor_id: null });
const round = (version: number): Message => ({ type: "round", instance_id: "i_1", version });

function harness(last: number, stored: number[]) {
  const got: string[] = [];
  const history = async (after: number): Promise<HistoryItem[]> => stored.filter((v) => v > after).slice(0, 2).map((version) => ({ version, actor_id: null, events: [], narration: version === 3 ? { text: "…", source: "template" } : null }));
  const s = new Sequencer(last, "i_1", (m) => got.push(`${m.type}@${m.version}`), history);
  return { s, got };
}

describe("instance stream ordering", () => {
  it("delivers commits in version order with their messages, dropping repeats", () => {
    const { s, got } = harness(4, []);
    s.receive(commit(5));
    s.receive(round(5));
    s.receive(commit(5));
    s.receive(commit(6));
    expect(got).toEqual(["commit@5", "round@5", "commit@6"]);
  });

  it("holds messages after a gap and backfills the missing commits from history", async () => {
    const { s, got } = harness(1, [2, 3, 4, 5]);
    s.receive(round(5));
    s.receive(commit(5));
    expect(got).toEqual([]);
    await s.backfill();
    expect(got).toEqual(["commit@2", "commit@3", "narration@3", "commit@4", "commit@5", "round@5"]);
    expect(s.last).toBe(5);
  });

  it("catches up on reconnection with after_version", async () => {
    const { s, got } = harness(3, [1, 2, 3, 4]);
    await s.backfill();
    expect(got).toEqual(["commit@4"]);
  });
});
