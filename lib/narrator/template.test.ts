import { describe, expect, it } from "vitest";
import type { GameEvent } from "../engine";
import { templateNarration, type Labels } from "./template";

const labels: Labels = {
  entity: (id) => ({ c_1: "Vale", e_drone: "the maintenance drone", e_panel: "the control panel", d_1: "the bulkhead" })[id] ?? id,
  room: (id) => ({ hangar: "the hangar" })[id] ?? id,
  ability: (ref) => ({ "base:overload": "Overload" })[ref] ?? ref,
  ending: (id) => ({ escaped: "Escaped with the core" })[id] ?? id,
};

const ev = (e: Record<string, unknown>) => e as unknown as GameEvent;

describe("template narration", () => {
  it("describes resolved events in order", () => {
    const text = templateNarration(
      [
        ev({ type: "moved", actor: "c_1", location: "dock", from: "airlock", to: "hangar", at: [5, 2], steps: 3, stopped: "arrived" }),
        ev({ type: "interacted", actor: "c_1", target: "e_panel", verb: "operate" }),
        ev({ type: "door_opened", door: "d_1", actor: "c_1" }),
        ev({ type: "attacked", actor: "c_1", target: "e_drone" }),
        ev({ type: "damaged", target: "e_drone", amount: 2, remaining: 2 }),
        ev({ type: "instance_ended", ending: "escaped" }),
      ],
      labels,
    );
    expect(text).toBe("Vale moves to the hangar. Vale operates the control panel. The bulkhead opens. Vale attacks the maintenance drone. The maintenance drone takes 2 damage. The adventure ends: Escaped with the core.");
  });

  it("does not narrate declarations or bookkeeping", () => {
    expect(templateNarration([ev({ type: "action_declared", actor: "c_1" }), ev({ type: "round_started", number: 2, mode: "exploration", resolution: "simultaneous" })], labels)).toBeNull();
  });
});
