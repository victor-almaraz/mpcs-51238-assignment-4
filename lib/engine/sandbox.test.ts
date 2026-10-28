import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { QUEST } from "../systems/quest";
import type { RulesSystem } from "../systems";
import { startInstance, submit, toolsFor, type Result, type State } from "./index";
import { catalog } from "./sandbox";
import { character, trialBundles } from "./testing/world";

const B = trialBundles();

function begin(sandbox: boolean, bundles = B, characters = [character("c_1", "Vale")]): State {
  const r = startInstance({ bundles, characters, seed: 7, sandbox });
  if (!r.ok) throw new Error(r.error.detail);
  return r.state;
}

const alter = (s: State, effects: unknown[], bundles = B, actor = "c_1"): Result => submit(s, bundles, actor, { tool: "alter", args: { effects, intent: "make it so" } }, new Rng(7, s.rng_counter));

function ok(r: Result) {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.detail}`);
  return r;
}
const code = (r: Result) => (r.ok ? "ok" : r.error.code);
const hatch = (s: State) => Object.keys(s.entities).find((id) => s.entities[id]!.kind === "door")!;
const item = catalog(B).find((t) => t.kind === "item")!.ref;

describe("sandbox games", () => {
  it("offer alter only in a sandbox, and refuse it elsewhere", () => {
    expect(toolsFor(begin(false), B, "c_1").tools).not.toContain("alter");
    expect(toolsFor(begin(true), B, "c_1").tools).toContain("alter");
    expect(code(alter(begin(false), [{ give_item: { target: "actor", ref: item } }]))).toBe("invalid_call");
  });

  it("apply alter's effects: an item conjured into the hands, a door opened", () => {
    const s = begin(true);
    const door = hatch(s);
    const r = ok(alter(s, [{ give_item: { target: "actor", ref: item } }, { open_door: { door } }]));
    expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(["altered", "entity_spawned", "door_opened"]));
    expect(r.state.characters.c_1!.items.some((i) => r.state.entities[i]!.ref === item)).toBe(true);
    expect(r.state.entities[door]!.open).toBe(true);
  });

  it("check each effect: allowed names only, targets the actor sees, refs that exist, bounded amounts", () => {
    const s = begin(true);
    expect(code(alter(s, [{ set_flag: { flag: "power", value: true } }]))).toBe("invalid_call");
    expect(code(alter(s, [{ end_campaign: { ending: "escaped" } }]))).toBe("invalid_call");
    expect(code(alter(s, [{ damage: { target: "drone", amount: 5 } }]))).toBe("not_reachable");
    expect(code(alter(s, [{ give_item: { target: "actor", ref: "trial:nothing" } }]))).toBe("unknown_id");
    expect(code(alter(s, [{ damage: { target: "actor", amount: 500 } }]))).toBe("invalid_call");
    expect(code(alter(s, [{ despawn: { target: "actor" } }]))).toBe("invalid_call");
    expect(code(alter(s, Array.from({ length: 4 }, () => ({ heal: { target: "actor", amount: 1 } }))))).toBe("invalid_call");
  });

  it("keep a character standing: knocked out of active, it is healed by 1 at once", () => {
    const r = ok(alter(begin(true), [{ damage: { target: "actor", amount: 20 } }]));
    const sheet = r.state.characters.c_1!.sheet as { status: string; hp: { value: number } };
    expect(sheet.status).toBe("active");
    expect(sheet.hp.value).toBe(1);
    expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(["damaged", "healed"]));
  });

  it("resolve every round simultaneously, whatever the rules system orders", () => {
    const sequential: RulesSystem = {
      ...QUEST,
      ORDERING: {
        exploration: { resolution: "sequential", order: [{ key: "side", first: "characters" }], reroll: "never" },
        combat: { resolution: "sequential", order: [{ key: "side", first: "characters" }], reroll: "never" },
      },
    };
    sequential.configure = () => sequential;
    const bundles = trialBundles(sequential);
    const party = [character("c_1"), character("c_2")];
    expect(begin(false, bundles, party).round.resolution).toBe("sequential");
    const s = begin(true, bundles, party);
    expect(s.round.resolution).toBe("simultaneous");
    expect(toolsFor(s, bundles, "c_2").can_act).toBe(true);
  });
});
