// Rounds and combat (engine milestone 5): resolution methods, sort keys, initiative rerolls, entity
// behaviours, approach, cover, structures, the combat area, and combat end.

import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { QUEST } from "../systems/quest";
import { CADMIUM } from "../systems/cadmium";
import type { Combatant, ModePolicy, RulesSystem } from "../systems";
import { content } from "./content";
import { Ctx } from "./ctx";
import { applyEffects } from "./effects";
import { entityTurn } from "./entities";
import { advance, submit, type Bundles, type GameEvent, type Result, type State } from "./index";
import { situation } from "./situation";
import { character, start, trialBundles } from "./testing/world";

const SEED = 7;

/** Quest with other ordering, spatial, or initiative rules. */
function variant(overrides: Partial<RulesSystem>): RulesSystem {
  const system: RulesSystem = { ...QUEST, ...overrides };
  system.configure = () => system;
  return system;
}

const sequential = (order: ModePolicy["order"], reroll: ModePolicy["reroll"] = "never"): ModePolicy => ({ resolution: "sequential", order, reroll });

function act(state: State, bundles: Bundles, actor: string, tool: string, args: Record<string, unknown> = {}, rng = new Rng(SEED, state.rng_counter)): Result {
  return submit(state, bundles, actor, { tool, args }, rng);
}

function ok(r: Result): { events: GameEvent[]; state: State } {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.detail}`);
  return r;
}

const types = (events: GameEvent[]) => events.map((e) => e.type);

/** An Rng whose first d20 roll is `roll`. */
function rolling(roll: number, counter: number): Rng {
  for (let seed = 0; seed < 100_000; seed++) if (new Rng(seed, counter).die(20) === roll) return new Rng(seed, counter);
  throw new Error("no seed");
}

/** The trial with the drone next to the start room's character and the hatch open. */
function arena(bundles: Bundles = trialBundles(), characters = [character("c_1")]): State {
  const s = start(characters, SEED, bundles);
  s.entities._e1!.open = true;
  s.entities.drone!.at = [2, 2];
  return s;
}

function ctxOf(state: State, bundles: Bundles = trialBundles(), rng = new Rng(SEED, state.rng_counter)): Ctx {
  return new Ctx(structuredClone(state), content(bundles), rng, applyEffects);
}

describe("mode changes", () => {
  it("finishes the round in which combat starts under exploration, and starts the next in combat", () => {
    const B = trialBundles();
    const r = ok(act(arena(B), B, "c_1", "attack", { target_id: "drone" }));
    const started = r.events.find((e) => e.type === "round_started")!;
    expect(types(r.events).indexOf("combat_started")).toBeLessThan(types(r.events).indexOf("round_ended"));
    expect(started).toMatchObject({ number: 2, mode: "combat", resolution: "simultaneous" });
    expect(r.state.round.participants).toEqual(["c_1", "drone"]);
  });

  it("orders Quest combat with characters first, then entity turns", () => {
    const B = trialBundles();
    const s = ok(act(arena(B), B, "c_1", "attack", { target_id: "drone" })).state;
    const r = ok(act(s, B, "c_1", "wait"));
    const acted = r.events.filter((e) => e.type === "waited" || e.type === "attacked" || e.type === "moved").map((e) => e.actor);
    expect(acted).toEqual(["c_1", "drone"]);
  });

  it("ends combat when no combatant can act, and returns to exploration at the next round", () => {
    const B = trialBundles();
    let s = ok(act(arena(B), B, "c_1", "attack", { target_id: "drone" })).state;
    s.entities.drone!.sheet = { ...s.entities.drone!.sheet!, hp: { value: 1, max: 4 } };
    const r = ok(act(s, B, "c_1", "attack", { target_id: "drone" }, rolling(15, s.rng_counter)));
    expect(types(r.events)).toEqual(expect.arrayContaining(["died", "combat_ended"]));
    s = r.state;
    expect(s.mode).toBe("exploration");
    expect(s.round.mode).toBe("exploration");
    expect(s.combat_area).toEqual([]);
  });

  it("ends combat when no character is in the combat area or visible to a combatant", () => {
    const B = trialBundles();
    const s = ok(act(arena(B), B, "c_1", "attack", { target_id: "drone" })).state;
    const ctx = ctxOf(s, B);
    ctx.state.characters.c_1!.location = "vault";
    ctx.state.characters.c_1!.at = [2, 1];
    applyEffects(ctx, [], {});
    const r = ok(act(ctx.state, B, "c_1", "wait"));
    expect(types(r.events)).toContain("combat_ended");
  });

  it("adds a room to the combat area when a combatant enters it", () => {
    const B = trialBundles();
    let s = ok(act(arena(B), B, "c_1", "attack", { target_id: "drone" })).state;
    s.characters.c_1!.at = [7, 2];
    s.entities.drone!.at = [2, 2];
    s = ok(act(s, B, "c_1", "wait")).state;
    expect(s.combat_area).toEqual(expect.arrayContaining(["bay", "hold"]));
  });

  it("lets characters outside the combat area use exploration tools during combat", () => {
    const B = trialBundles();
    const s = ok(act(arena(B, [character("c_1"), character("c_2")]), B, "c_1", "attack", { target_id: "drone" })).state;
    const ready = ok(act(s, B, "c_2", "wait")).state;
    expect(ready.round.mode).toBe("combat");
    ready.combat_area = ["hold"];
    ready.characters.c_1!.at = [2, 3];
    const r = act(ready, B, "c_1", "take", { entity_id: "card" });
    expect(r.ok).toBe(true);
  });
});

describe("sequential resolution and initiative", () => {
  it("orders by initiative, resolves entity turns automatically, and rejects out-of-turn input", () => {
    const system = variant({
      ORDERING: { exploration: QUEST.ORDERING.exploration, combat: sequential([{ key: "initiative" }]) },
      initiative: (participants: readonly Combatant[]) => participants.map((p) => p.id).sort().reverse(),
    });
    const B = trialBundles(system);
    const r = ok(act(arena(B), B, "c_1", "attack", { target_id: "drone" }));
    const started = r.events.find((e) => e.type === "round_started")!;
    expect(started).toMatchObject({ mode: "combat", resolution: "sequential", order: ["drone", "c_1"] });
    const after = r.events.slice(r.events.indexOf(started));
    expect(types(after).slice(0, 2)).toEqual(["round_started", "turn_started"]);
    expect(after.find((e) => e.type === "turn_started")).toEqual({ type: "turn_started", participant: "drone", number: 2 });
    expect(after.some((e) => e.type === "attacked" && e.actor === "drone")).toBe(true);
    expect(after.at(-1)).toEqual({ type: "turn_started", participant: "c_1", number: 2 });
    expect(r.state.round.turn_index).toBe(1);
  });

  it("skips the current participant on advance", () => {
    const system = variant({ ORDERING: { exploration: sequential([{ key: "side", first: "characters" }]), combat: QUEST.ORDERING.combat } });
    const B = trialBundles(system);
    const s = start([character("c_1"), character("c_2")], SEED, B);
    const r = ok(advance(s, B, new Rng(SEED, s.rng_counter)));
    expect(r.events.filter((e) => e.type === "waited").map((e) => e.actor)).toEqual(["c_1"]);
    expect(r.state.round.turn_index).toBe(1);
  });

  it.each([
    ["per_round", 3],
    ["per_combat", 1],
    ["never", 1],
  ] as const)("rerolls initiative %s", (reroll, calls) => {
    let count = 0;
    const system = variant({
      ORDERING: { exploration: QUEST.ORDERING.exploration, combat: { resolution: "simultaneous", order: [{ key: "initiative" }], reroll } },
      initiative: (participants: readonly Combatant[]) => {
        count++;
        return participants.map((p) => p.id);
      },
    });
    const B = trialBundles(system);
    let s = arena(B);
    s.entities.drone!.sheet = { ...s.entities.drone!.sheet!, hp: { value: 99, max: 99 } };
    s = ok(act(s, B, "c_1", "attack", { target_id: "drone" }, rolling(3, s.rng_counter))).state;
    for (let i = 0; i < 2; i++) s = ok(act(s, B, "c_1", "wait")).state;
    expect(count).toBe(calls);
  });

  it("sorts by side, first entities", () => {
    const system = variant({ ORDERING: { exploration: QUEST.ORDERING.exploration, combat: { resolution: "simultaneous", order: [{ key: "side", first: "entities" }], reroll: "never" } } });
    const B = trialBundles(system);
    const s = ok(act(arena(B), B, "c_1", "attack", { target_id: "drone" })).state;
    const r = ok(act(s, B, "c_1", "wait"));
    const acted = r.events.filter((e) => ["waited", "attacked", "moved"].includes(e.type)).map((e) => e.actor);
    expect(acted[0]).toBe("drone");
  });
});

describe("entity behaviours", () => {
  const B = trialBundles();

  it("aggressive: attacks a character in reach", () => {
    const ctx = ctxOf(arena(B));
    entityTurn(ctx, "drone");
    expect(ctx.events[0]).toMatchObject({ type: "attacked", actor: "drone", target: "c_1" });
  });

  it("aggressive: moves toward the character with the cheapest path, then attacks with approach", () => {
    const s = arena(B);
    s.entities.drone!.at = [8, 2];
    const ctx = ctxOf(s);
    ctx.state.round.mode = "combat";
    entityTurn(ctx, "drone");
    expect(types(ctx.events)[0]).toBe("moved");
    expect(ctx.events[0]).toMatchObject({ actor: "drone", steps: 6 });
  });

  it("defensive: waits with no character in reach", () => {
    const s = arena(B);
    s.entities.drone!.at = [8, 2];
    s.entities.drone!.behavior = "defensive";
    const ctx = ctxOf(s);
    entityTurn(ctx, "drone");
    expect(ctx.events).toEqual([{ type: "waited", actor: "drone" }]);
  });

  it("passive: waits", () => {
    const s = arena(B);
    s.entities.drone!.behavior = "passive";
    const ctx = ctxOf(s);
    entityTurn(ctx, "drone");
    expect(ctx.events).toEqual([{ type: "waited", actor: "drone" }]);
  });

  it("fleeing: moves to the reachable free cell farthest from the nearest character", () => {
    const s = arena(B);
    s.entities.drone!.behavior = "fleeing";
    const ctx = ctxOf(s);
    ctx.state.round.mode = "combat";
    entityTurn(ctx, "drone");
    const moved = ctx.events[0]!;
    expect(moved.type).toBe("moved");
    const [x] = moved.at as [number, number];
    expect(x).toBeGreaterThan(2);
  });

  it("switches to fleeing at its first damaged event with flee_when_harmed", () => {
    const s = arena(B);
    s.entities.frame = { ref: "base:security_frame", kind: "creature", location: "deck", at: [3, 3], conditions: [], behavior: "defensive", sheet: { template: "boss", hp: { value: 10, max: 10 }, damage: 3, status: "active" } };
    const ctx = ctxOf(s);
    applyEffects(ctx, [{ damage: { target: "frame", amount: 1 } }], {});
    expect(ctx.state.entities.frame!.behavior).toBe("fleeing");
  });
});

describe("approach, reach, and cover", () => {
  it("approaches an out-of-reach target before attacking", () => {
    const B = trialBundles();
    const s = arena(B);
    s.entities.drone!.at = [8, 2];
    s.locations.deck!.rooms.hold!.visited = true;
    const r = ok(act(s, B, "c_1", "attack", { target_id: "drone" }));
    expect(types(r.events).slice(1, 3)).toEqual(["moved", "attacked"]);
  });

  it("rejects an out-of-reach target with not_reachable when approach is false", () => {
    const B = trialBundles(variant({ SPATIAL: { ...QUEST.SPATIAL, approach: false } }));
    const s = arena(B);
    s.entities.drone!.at = [8, 2];
    const r = act(s, B, "c_1", "attack", { target_id: "drone" });
    expect(!r.ok && r.error.code).toBe("not_reachable");
  });

  it("voids the attack when no cell in reach can be reached; the move stands", () => {
    const B = trialBundles();
    const s = arena(B);
    s.entities._e1 = { ref: "base:airlock_door", kind: "door", location: "deck", at: [5, 2], open: false, locked: true, lock: { has_item: "base:override_code" }, conditions: [] };
    s.entities.drone!.at = [8, 2];
    const r = ok(act(s, B, "c_1", "attack", { target_id: "drone" }));
    expect(r.events.find((e) => e.type === "action_voided")).toEqual({ type: "action_voided", actor: "c_1", tool: "attack", reason: "not_reachable" });
  });

  it("adds cover when a cover entity lies strictly between attacker and target", () => {
    const B = trialBundles();
    const s = arena(B);
    s.characters.c_1!.at = [1, 2];
    s.entities.drone!.at = [4, 2];
    expect(situation(ctxOf(s, B), "c_1", "drone", ["melee"]).tags).toEqual(["melee"]);
    s.entities.barricade = { ref: "trial:barricade", kind: "fixture", location: "deck", at: [2, 2], conditions: [] };
    expect(situation(ctxOf(s, B), "c_1", "drone", ["melee"]).tags).toEqual(["melee", "cover"]);
    // A cover entity at an endpoint gives no cover.
    s.entities.barricade.at = [4, 3];
    expect(situation(ctxOf(s, B), "c_1", "drone", ["melee"]).tags).toEqual(["melee"]);
  });

  it("destroys a structure attacked to 0 HP and places its remains", () => {
    const B = trialBundles();
    const s = arena(B);
    s.entities.drone!.location = "vault";
    s.entities.crate = { ref: "base:crate_stack", kind: "obstacle", location: "deck", at: [2, 2], conditions: [], sheet: { hp: { value: 1, max: 4 }, status: "active" } };
    const r = ok(act(s, B, "c_1", "attack", { target_id: "crate" }, rolling(15, s.rng_counter)));
    expect(types(r.events)).toEqual(expect.arrayContaining(["attacked", "damaged", "destroyed", "entity_spawned"]));
    expect(r.state.entities.crate).toBeUndefined();
    expect(r.state.mode).toBe("exploration");
  });
});

describe("with each implemented system", () => {
  it.each([
    ["quest", QUEST],
    ["cadmium [armor, stash]", CADMIUM.configure(["armor", "stash"])],
  ])("%s plays a combat round to its end", (_, system) => {
    const B = trialBundles(system as RulesSystem);
    let s = ok(act(arena(B), B, "c_1", "attack", { target_id: "drone" })).state;
    expect(s.round.mode).toBe("combat");
    s = ok(act(s, B, "c_1", "wait")).state;
    expect(s.round.number).toBe(3);
    expect(s.clock.turn).toBe(2);
  });
});
