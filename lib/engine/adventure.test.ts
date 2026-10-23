// The authoring guide's sunken_archive, started and played through its lift into the generated
// lower_archive (engine milestones 4 and 6 together).

import { describe, expect, it } from "vitest";
import { compileAdventure } from "../materials";
import { derelictStation, guideAdventure } from "../materials/testing/fixtures";
import { Rng } from "../rng";
import { QUEST } from "../systems/quest";
import { startInstance, submit, type Bundles, type GameEvent, type State } from "./index";
import { character } from "./testing/world";

const setting = derelictStation();
const bundles: Bundles = { system: QUEST, settings: [setting], adventure: compileAdventure(guideAdventure(), [setting]).bundle! };
const SEED = 11;

function started(): State {
  const r = startInstance({ bundles, characters: [character("c_1", "Vale", { abilities: [] })], seed: SEED });
  if (!r.ok) throw new Error(r.error.detail);
  return r.state;
}

function step(state: State, tool: string, args: Record<string, unknown>): { state: State; events: GameEvent[] } {
  const r = submit(state, bundles, "c_1", { tool, args }, new Rng(SEED, state.rng_counter));
  if (!r.ok) throw new Error(`${tool}: ${r.error.code}: ${r.error.detail}`);
  return r;
}

describe("sunken_archive", () => {
  it("starts with the generated lower_archive, its aliases, and its anchored core", () => {
    const s = started();
    const lower = s.locations.lower_archive!;
    expect(Object.keys(lower.aliases!).sort()).toEqual(["boss", "core_anchor", "entry", "r1", "x_up"]);
    expect(lower.aliases!.entry).toBe("r1");
    expect(lower.links.x_up!.to).toEqual({ location: "dock", link: "x_lift" });
    const core = Object.entries(s.entities).find(([, e]) => e.ref === "sunken_archive:reactor_core");
    expect(core?.[1].location).toBe("lower_archive");
    expect(Object.keys(s.entities).some((id) => id.startsWith("lower_archive/d"))).toBe(true);
    expect(s.entities.lift_door).toMatchObject({ locked: true, lock: { flag: "lift_powered" } });
  });

  it("is deterministic per seed", () => {
    expect(JSON.stringify(started())).toBe(JSON.stringify(started()));
  });

  it("powers the lift with the keycard and travels to the generated archive", () => {
    let s = started();
    const card = Object.entries(s.entities).find(([, e]) => e.ref === "base:keycard" && e.location === "dock")![0];
    s.locations.dock!.seen = s.locations.dock!.seen.map((row) => "1".repeat(row.length));
    for (const [tool, args] of [
      ["move", { to_id: "hangar" }],
      ["move", { to_id: card }],
      ["take", { entity_id: card }],
      ["move", { to_id: "lift_panel" }],
    ] as const) s = step(s, tool, args).state;
    const powered = step(s, "interact", { target_id: "lift_panel", verb: "operate" });
    expect(powered.events.map((e) => e.type)).toEqual(expect.arrayContaining(["trigger_fired", "flag_set", "door_opened"]));
    s = powered.state;
    expect(s.flags.lift_powered).toBe(true);
    const down = step(s, "move", { to_id: "x_lift" });
    const moved = down.events.find((e) => e.type === "moved")!;
    expect(moved).toMatchObject({ location: "lower_archive", via: "x_lift", to: "r1" });
    expect(down.state.locations.lower_archive!.rooms.r1!.visited).toBe(true);
  });
});
