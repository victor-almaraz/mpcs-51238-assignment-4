// The balance simulation is seeded and replayable (AGENTS.md, phase 11).

import { describe, expect, it } from "vitest";
import { replay } from "../../lib/engine";
import { commitOf } from "../../lib/harness/harness";
import { arena, LOADOUTS } from "./arena";
import { ENCOUNTERS } from "./encounters";
import { simulate, sweep } from "./run";

const octopus = ENCOUNTERS.find((e) => e.id === "octopus")!;

describe("balance simulation", () => {
  it("reproduces a fight from its configuration and seed, and its log replays", () => {
    const a = simulate(octopus, { party: 2, loadout: "full", armorMax: 6 }, 7);
    const b = simulate(octopus, { party: 2, loadout: "full", armorMax: 6 }, 7);
    expect(JSON.stringify(a.session.log)).toBe(JSON.stringify(b.session.log));
    expect(replay(arena(octopus, LOADOUTS.full!, 2), a.session.log.map(commitOf)).ok).toBe(true);
  });

  it("takes the gear, dons the armor, and fights", () => {
    const o = simulate(octopus, { party: 1, loadout: "full", armorMax: 6 }, 3);
    const tools = o.session.log.flatMap((l) => ("input" in l && "tool" in l.input ? [l.input.tool] : []));
    expect(tools.slice(0, 5)).toEqual(["take", "take", "take", "use", "use"]);
    expect(tools).toContain("attack");
    expect(o.rounds).toBeGreaterThan(0);
  });

  it("counts a first-blow kill as a win and caps armor at the pool's maximum", () => {
    const marsh = ENCOUNTERS.find((e) => e.id === "marsh")!;
    expect(sweep(marsh, { party: 4, loadout: "unarmored", armorMax: 6 }, 10).winRate).toBe(1);
    const small = simulate(octopus, { party: 1, loadout: "full", armorMax: 3 }, 3);
    const peak = Math.max(...small.session.log.flatMap((l) => l.events.filter((e) => e.type === "resource_changed" && e.resource === "armor").map((e) => e.value as number)));
    expect(peak).toBe(3);
  });

  it("applies statistic overrides", () => {
    const weak = simulate({ ...octopus, override: { hp: 1 } }, { party: 1, loadout: "axe", armorMax: 6 }, 1);
    expect(weak.session.state.entities.foe_0!.sheet).toMatchObject({ hp: { max: 1 } });
  });
});
