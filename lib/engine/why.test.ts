// whyHeld: the playtest trace names the part of a trigger's `when` that failed.

import { describe, expect, it } from "vitest";
import type { Requirement } from "../bundle/types/defs";
import { Rng } from "../rng";
import { QUEST } from "../systems/quest";
import { submit, type GameEvent, type State } from "./index";
import { TRIAL, character, start, trialBundles } from "./testing/world";
import { describe as describeReq, whyHeld } from "./why";

const bundles = trialBundles(QUEST, TRIAL);
const event: GameEvent = { type: "interacted", actor: "c_1", target: "panel", verb: "operate" };

function why(when: Requirement | undefined, patch: (s: State) => void = () => {}, once = false): string[] {
  const s = start([character("c_1", "Vale")], 7, bundles);
  patch(s);
  return whyHeld({ id: "t", when, once }, event, s, s, bundles);
}

describe("whyHeld", () => {
  it("names a failing flag comparison with its value", () => {
    expect(why({ flag: "alarm", gte: 2 })).toEqual(["flag alarm ≥ 2 (is 0)"]);
    expect(why({ flag: "alarm", eq: 3 }, (s) => void (s.flags.alarm = 1))).toEqual(["flag alarm = 3 (is 1)"]);
    expect(why({ flag: "power" })).toEqual(["flag power (is false)"]);
  });

  it("reports only the failing members of all, and every member of a failed any", () => {
    expect(why({ all: [{ flag: "alarm", lte: 3 }, { stage: ["main", "powered"] }] })).toEqual(["arc main at powered (is at start)"]);
    expect(why({ any: [{ flag: "power" }, { has_item: "base:keycard" }] })).toEqual(["none of: flag power (is false); has_item base:keycard (c_1 carries base:wrench, base:medkit)"]);
  });

  it("explains a not whose inner condition holds", () => {
    expect(why({ not: { stage: ["main", "start"] } })).toEqual(["not arc main at start (it holds, is at start)"]);
  });

  it("names the actor's room and location", () => {
    expect(why({ room: "hold" })).toEqual(["in room hold (c_1 is in deck.bay)"]);
    expect(why({ location: "vault" })).toEqual(["in location vault (c_1 is in deck)"]);
  });

  it("reports once triggers that fired before, and conditions that hold now", () => {
    expect(why(undefined, (s) => void s.fired_triggers.push("t"), true)).toEqual(["once: it fired earlier"]);
    expect(why({ flag: "alarm", lte: 3 })).toEqual(["its conditions hold after the action; they did not when the event occurred"]);
  });

  it("does not roll checks", () => {
    const s = start([character("c_1", "Vale")], 7, bundles);
    const before = JSON.stringify(s);
    expect(whyHeld({ id: "t", when: { check: { stat: "spy", dc: 30 } } as never }, event, s, s, bundles)).toEqual(['check {"stat":"spy","dc":30} did not pass']);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("agrees with the engine on a trigger it held", () => {
    const files = {
      ...TRIAL,
      "plot/side.yaml": `
id: side
title: Side
stages: [idle, done]
initial: idle
triggers:
  - id: gated
    on: { type: item_taken, ref: base:keycard }
    when: { all: [{ flag: alarm, gte: 2 }, { has_item: base:keycard }] }
    effects: [{ set_stage: { arc: side, stage: done } }]
`,
    };
    const b = trialBundles(QUEST, files);
    let s = start([character("c_1", "Vale")], 7, b);
    for (const [tool, args] of [["move", { to_id: "card" }]] as const) {
      const r = submit(s, b, "c_1", { tool, args }, new Rng(7, s.rng_counter));
      if (!r.ok) throw new Error(r.error.detail);
      s = r.state;
    }
    const r = submit(s, b, "c_1", { tool: "take", args: { entity_id: "card" } }, new Rng(7, s.rng_counter));
    if (!r.ok) throw new Error(r.error.detail);
    const fired = r.events.filter((e) => e.type === "trigger_fired").map((e) => e.trigger);
    expect(fired).not.toContain("gated");
    const matched = r.events.find((e) => e.type === "item_taken")!;
    const trigger = b.adventure.arcs.find((a) => a.id === "side")!.triggers[0]!;
    expect(whyHeld(trigger, matched, s, r.state, b)).toEqual(["flag alarm ≥ 2 (is 0)"]);
  });

  it("describes conditions in words", () => {
    expect(describeReq({ all: [{ flag: "a" }, { not: { defeated: "boss" } }] })).toBe("all of (flag a; not boss defeated)");
  });
});
