import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { QUEST } from "../systems/quest";
import type { RulesSystem } from "../systems";
import { content } from "./content";
import { Ctx } from "./ctx";
import { applyEffects } from "./effects";
import { advance, submit, view, type GameEvent, type Result, type State } from "./index";
import { holds } from "./requirements";
import { situation } from "./situation";
import { character, start, trialBundles } from "./testing/world";
import { Perception, bodyOf, illumination } from "./world";

const B = trialBundles();
const SEED = 7;

/** An Rng for the next resolution whose first d20 roll is `roll`. */
function rngRolling(roll: number, counter: number): Rng {
  for (let seed = 0; seed < 100_000; seed++) if (new Rng(seed, counter).die(20) === roll) return new Rng(seed, counter);
  throw new Error("no seed");
}

function act(state: State, actor: string, tool: string, args: Record<string, unknown> = {}, rng = new Rng(SEED, state.rng_counter), bundles = B): Result {
  return submit(state, bundles, actor, { tool, args }, rng);
}

function ok(r: Result): { events: GameEvent[]; state: State } {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.detail}`);
  return r;
}

function err(r: Result): string {
  if (r.ok) throw new Error(`expected an error, got ${JSON.stringify(r.events)}`);
  return r.error.code;
}

const types = (events: GameEvent[]) => events.map((e) => e.type);
const find = (events: GameEvent[], type: string) => events.find((e) => e.type === type);

/** Runs a sequence of calls for one actor; returns the final state and every event. */
function play(state: State, actor: string, calls: [string, Record<string, unknown>][]): { state: State; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const [tool, args] of calls) {
    const r = ok(act(state, actor, tool, args));
    events.push(...r.events);
    state = r.state;
  }
  return { state, events };
}

function ctxOf(state: State, rng = new Rng(SEED, state.rng_counter), bundles = B): Ctx {
  return new Ctx(structuredClone(state), content(bundles), rng, applyEffects);
}

describe("instance start", () => {
  it("places characters on the start room's free cells in row-major order, by ascending id", () => {
    const s = start([character("c_2"), character("c_1")]);
    expect(s.characters.c_1!.at).toEqual([1, 1]);
    expect(s.characters.c_2!.at).toEqual([2, 1]);
    expect(s.locations.deck!.rooms.bay!.visited).toBe(true);
  });

  it("starts round 1 in exploration with every active character", () => {
    const s = start([character("c_1"), character("c_2")]);
    expect(s.round).toMatchObject({ number: 1, mode: "exploration", resolution: "simultaneous", participants: ["c_1", "c_2"], order: null });
  });

  it("sets flags, character flags, stages, starting items, and seen cells", () => {
    const s = start();
    expect(s.flags).toEqual({ power: false, alarm: 0 });
    expect(s.character_flags.c_1).toEqual({ purse: 12 });
    expect(s.stages).toEqual({ main: "start" });
    expect(s.characters.c_1!.items).toHaveLength(2);
    expect((s.characters.c_1!.sheet.inventory as unknown[]).length).toBe(2);
    expect(s.locations.deck!.seen[1]).toBe("111111000000");
    expect(s.locations.deck!.seen[1]![9]).toBe("0");
  });

  it("places entities with their engine state", () => {
    const s = start();
    expect(s.entities.gate).toMatchObject({ kind: "door", location: "vault", at: [3, 1], open: false, locked: true, lock: { flag: "power" } });
    expect(s.entities.drone).toMatchObject({ kind: "creature", behavior: "aggressive", sheet: { template: "minion", status: "active" } });
    expect(s.entities.keeper).toMatchObject({ npc: "keeper", ref: "base:civilian" });
    expect(s.entities.cache!.conditions).toEqual([{ id: "hidden", remaining: null }]);
    expect(s.entities.chest).toMatchObject({ locked: true, contents: [] });
    expect(s.entities.locker!.contents).toHaveLength(2);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(start())).toBe(JSON.stringify(start()));
  });
});

describe("error codes", () => {
  const s = start();

  it("invalid_call: unknown tool, unknown argument, wrong type, and move with both targets", () => {
    expect(err(act(s, "c_1", "fly"))).toBe("invalid_call");
    expect(err(act(s, "c_1", "wait", { now: true }))).toBe("invalid_call");
    expect(err(act(s, "c_1", "take", { entity_id: 3 }))).toBe("invalid_call");
    expect(err(act(s, "c_1", "move", { to_id: "hold", away_from_id: "drone" }))).toBe("invalid_call");
    expect(err(submit(s, B, "c_1", { tool: "wait" }, new Rng(1)))).toBe("invalid_call");
  });

  it("unknown_id: ids not in state", () => {
    expect(err(act(s, "c_1", "move", { to_id: "bridge" }))).toBe("unknown_id");
    expect(err(act(s, "c_9", "wait"))).toBe("unknown_id");
  });

  it("not_reachable: entities out of sight and targets out of reach", () => {
    expect(err(act(s, "c_1", "move", { to_id: "drone" }))).toBe("not_reachable");
    expect(err(act(s, "c_1", "take", { entity_id: "card" }))).toBe("not_reachable");
  });

  it("requirement_unmet: a verb requirement fails", () => {
    expect(err(act(s, "c_1", "interact", { target_id: "panel", verb: "operate" }))).toBe("requirement_unmet");
  });

  it("blocked_by_condition: a condition blocks the tool", () => {
    const t = structuredClone(s);
    t.characters.c_1!.conditions.push({ id: "panicked", remaining: 1 });
    expect(err(act(t, "c_1", "attack", { target_id: "keeper" }))).toBe("blocked_by_condition");
  });

  it("choice_pending: only choose and free tools while a choice is pending", () => {
    const t = structuredClone(s);
    t.pending_choices.c_1 = { actor: "c_1", prompt: "Pick", options: [{ id: "a", label: "A", updates: {}, events: [], effects: [] }] };
    expect(err(act(t, "c_1", "wait"))).toBe("choice_pending");
    expect(ok(act(t, "c_1", "examine")).events[0]!.type).toBe("examined");
  });

  it("invalid_in_mode: exploration-only tools in the combat area", () => {
    const t = structuredClone(s);
    t.round.mode = "combat";
    t.mode = "combat";
    t.combat_area = ["bay"];
    expect(err(act(t, "c_1", "search"))).toBe("invalid_in_mode");
  });

  it("instance_not_active: the instance has ended", () => {
    const t = structuredClone(s);
    t.ended = { ending: "escaped" };
    expect(err(act(t, "c_1", "wait"))).toBe("instance_not_active");
  });

  it("not_your_turn: sequential resolution and another participant's turn", () => {
    const sequential: RulesSystem = {
      ...QUEST,
      ORDERING: {
        exploration: { resolution: "sequential", order: [{ key: "side", first: "characters" }], reroll: "never" },
        combat: { resolution: "sequential", order: [{ key: "side", first: "characters" }], reroll: "never" },
      },
    };
    sequential.configure = () => sequential;
    const bundles = trialBundles(sequential);
    const t = start([character("c_1"), character("c_2")], SEED, bundles);
    expect(t.round.order).toEqual(["c_1", "c_2"]);
    expect(err(act(t, "c_2", "wait", {}, new Rng(SEED, t.rng_counter), bundles))).toBe("not_your_turn");
    const after = ok(act(t, "c_1", "wait", {}, new Rng(SEED, t.rng_counter), bundles));
    expect(after.state.round.turn_index).toBe(1);
    expect(types(after.events)).toEqual(["waited", "turn_started"]);
  });

  it("rejections return no state and leave the input unchanged", () => {
    const before = JSON.stringify(s);
    const r = act(s, "c_1", "interact", { target_id: "panel", verb: "operate" });
    expect(r.ok).toBe(false);
    expect("state" in r).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("movement", () => {
  it("opens a closed unlocked door on an exploration path and stops on the first cell of an unvisited room", () => {
    const s = start();
    const r = ok(act(s, "c_1", "move", { to_id: "x_down" }).ok ? act(s, "c_1", "move", { to_id: "x_down" }) : act(start(), "c_1", "move", { to_id: "hold" }));
    expect(find(r.events, "door_opened")).toEqual({ type: "door_opened", door: "_e1", actor: "c_1" });
    expect(find(r.events, "moved")).toMatchObject({ actor: "c_1", from: "bay", to: "hold", at: [5, 2] });
    expect(r.state.locations.deck!.rooms.hold!.visited).toBe(true);
  });

  it("rejects moving to a link that has not been seen", () => {
    expect(err(act(start(), "c_1", "move", { to_id: "x_down" }))).toBe("not_reachable");
  });

  it("stops where a hostile creature first becomes visible", () => {
    const s = start();
    s.locations.deck!.rooms.hold!.visited = true;
    s.locations.deck!.seen = s.locations.deck!.seen.map((row) => "1".repeat(row.length));
    const r = ok(act(s, "c_1", "move", { to_id: "x_down" }));
    expect(find(r.events, "moved")).toMatchObject({ stopped: "hostile_seen", at: [5, 2] });
  });

  it("travels a link to the paired link in the other location", () => {
    let s = start();
    s.entities.drone!.location = "vault";
    s.entities.drone!.at = [4, 1];
    s.locations.deck!.rooms.hold!.visited = true;
    s.locations.deck!.seen = s.locations.deck!.seen.map((row) => "1".repeat(row.length));
    const r = ok(act(s, "c_1", "move", { to_id: "x_down" }));
    s = r.state;
    expect(find(r.events, "moved")).toMatchObject({ location: "vault", from: "bay", to: "cellar", at: [1, 1], via: "x_down", stopped: "arrived" });
    expect(s.characters.c_1).toMatchObject({ location: "vault", at: [1, 1] });
    expect(s.locations.vault!.rooms.cellar!.visited).toBe(true);
  });

  it("marks seen every cell a character perceives after the action", () => {
    const { state } = play(start(), "c_1", [["move", { to_id: "hold" }]]);
    expect(state.locations.deck!.seen[1]!.slice(6, 11)).toBe("11111");
  });
});

describe("items and containers", () => {
  it("takes, drops, and syncs the sheet's inventory", () => {
    let s = start();
    s = play(s, "c_1", [["move", { to_id: "card" }]]).state;
    const taken = ok(act(s, "c_1", "take", { entity_id: "card" }));
    expect(find(taken.events, "item_taken")).toEqual({ type: "item_taken", actor: "c_1", item: "card", ref: "base:keycard" });
    expect(taken.state.characters.c_1!.items).toContain("card");
    expect((taken.state.characters.c_1!.sheet.inventory as { ref: string }[]).map((i) => i.ref)).toContain("base:keycard");
    const dropped = ok(act(taken.state, "c_1", "drop", { item_id: "card" }));
    expect(dropped.state.entities.card).toMatchObject({ location: "deck", at: taken.state.characters.c_1!.at });
  });

  it("refuses a locked container until its lock holds, then unlocks it for everyone", () => {
    let s = start();
    s = play(s, "c_1", [["move", { to_id: "lamp" }], ["take", { entity_id: "lamp" }], ["move", { to_id: "chest" }]]).state;
    expect(err(act(s, "c_1", "give", { item_id: "lamp", target_id: "chest" }))).toBe("requirement_unmet");
    s = play(s, "c_1", [["move", { to_id: "card" }], ["take", { entity_id: "card" }], ["move", { to_id: "chest" }]]).state;
    const given = ok(act(s, "c_1", "give", { item_id: "lamp", target_id: "chest" }));
    expect(find(given.events, "item_given")).toEqual({ type: "item_given", actor: "c_1", item: "lamp", ref: "trial:lamp", to: "chest" });
    expect(given.state.entities.chest).toMatchObject({ locked: false, contents: ["lamp"] });
    expect(view(given.state, B, "c_1").visible.find((v) => v.id === "chest")!.contents).toEqual([{ id: "lamp", label: "lamp" }]);
    const back = ok(act(given.state, "c_1", "take", { entity_id: "lamp" }));
    expect(back.state.entities.chest!.contents).toEqual([]);
  });

  it("refuses to give past a container's capacity", () => {
    let s = start();
    s = play(s, "c_1", [["move", { to_id: "card" }], ["take", { entity_id: "card" }], ["move", { to_id: "chest" }]]).state;
    const [a, b] = s.characters.c_1!.items;
    s = play(s, "c_1", [
      ["give", { item_id: a!, target_id: "chest" }],
      ["give", { item_id: b!, target_id: "chest" }],
    ]).state;
    expect(err(act(s, "c_1", "give", { item_id: "card", target_id: "chest" }))).toBe("requirement_unmet");
  });

  it("takes every item of a container without capacity", () => {
    let s = start();
    s.entities._e1!.open = true;
    s.locations.deck!.seen = s.locations.deck!.seen.map((row) => "1".repeat(row.length));
    s.entities.drone!.location = "vault";
    s = play(s, "c_1", [["move", { to_id: "hold" }], ["move", { to_id: "locker" }]]).state;
    const contents = [...s.entities.locker!.contents!];
    const r = ok(act(s, "c_1", "take", { entity_id: "locker" }));
    expect(r.events.filter((e) => e.type === "item_taken").map((e) => e.item)).toEqual(contents);
  });

  it("refuses an inventory that can_carry rejects", () => {
    let s = start();
    s = play(s, "c_1", [["move", { to_id: "card" }]]).state;
    const extra = Array.from({ length: 10 }, (_, i) => `x${i}`);
    for (const id of extra) {
      s.entities[id] = { ref: "base:battery", kind: "item", carrier: "c_1", conditions: [], uses: null };
      s.characters.c_1!.items.push(id);
    }
    expect(err(act(s, "c_1", "take", { entity_id: "card" }))).toBe("requirement_unmet");
  });
});

describe("use, interact, and light", () => {
  it("toggles a carried light source without use effects", () => {
    let s = start();
    s = play(s, "c_1", [["move", { to_id: "lamp" }], ["take", { entity_id: "lamp" }]]).state;
    const r = ok(act(s, "c_1", "use", { item_id: "lamp" }));
    expect(types(r.events).slice(1, 3)).toEqual(["item_used", "light_changed"]);
    expect(r.state.entities.lamp!.lit).toBe(false);
  });

  it("applies item use effects and decrements uses", () => {
    const s = start();
    const medkit = s.characters.c_1!.items.find((i) => s.entities[i]!.ref === "base:medkit");
    const hurt = structuredClone(s);
    if (!medkit) {
      hurt.entities.mk = { ref: "base:medkit", kind: "item", carrier: "c_1", conditions: [], uses: 3 };
      hurt.characters.c_1!.items.push("mk");
    }
    const id = medkit ?? "mk";
    hurt.characters.c_1!.sheet = { ...hurt.characters.c_1!.sheet, hp: { value: 5, max: 10 } };
    const r = ok(act(hurt, "c_1", "use", { item_id: id }));
    expect(find(r.events, "healed")).toEqual({ type: "healed", target: "c_1", amount: 2 });
    expect(r.state.entities[id]!.uses).toBe((hurt.entities[id]!.uses as number) - 1);
  });

  it("lights and extinguishes a fixture light source", () => {
    let s = start();
    s.entities._e1!.open = true;
    s.entities.drone!.location = "vault";
    s.locations.deck!.rooms.hold!.visited = true;
    s = play(s, "c_1", [["move", { to_id: "hold" }], ["move", { to_id: "brazier" }]]).state;
    const r = ok(act(s, "c_1", "interact", { target_id: "brazier", verb: "light" }));
    expect(find(r.events, "light_changed")).toEqual({ type: "light_changed", target: "brazier", lit: true, actor: "c_1" });
    expect(err(act(r.state, "c_1", "interact", { target_id: "brazier", verb: "smash" }))).toBe("requirement_unmet");
  });

  it("fires a trigger on a verb, once", () => {
    let s = start();
    s = play(s, "c_1", [["move", { to_id: "card" }], ["take", { entity_id: "card" }], ["move", { to_id: "panel" }]]).state;
    const first = ok(act(s, "c_1", "interact", { target_id: "panel", verb: "operate" }));
    expect(types(first.events)).toEqual(expect.arrayContaining(["interacted", "trigger_fired", "flag_set", "stage_set", "door_opened"]));
    expect(first.state.entities.gate).toMatchObject({ open: true, locked: false });
    const second = ok(act(first.state, "c_1", "interact", { target_id: "panel", verb: "operate" }));
    expect(types(second.events)).not.toContain("trigger_fired");
  });
});

describe("talk, search, rest, and free tools", () => {
  it("talks about an available topic and rejects an unavailable one", () => {
    let s = start();
    s = play(s, "c_1", [["move", { to_id: "keeper" }]]).state;
    const r = ok(act(s, "c_1", "talk", { npc_id: "keeper", topic_id: "power", utterance: "Hello." }));
    expect(find(r.events, "talked")).toEqual({ type: "talked", actor: "c_1", npc: "keeper", topic: "power", utterance: "Hello." });
    expect(err(act(s, "c_1", "talk", { npc_id: "keeper", topic_id: "gate", utterance: "" }))).toBe("requirement_unmet");
  });

  it("reveals hidden entities in the room on a passing search", () => {
    let s = start();
    s.entities.drone!.location = "vault";
    s = play(s, "c_1", [["move", { to_id: "hold" }]]).state;
    const pass = ok(act(s, "c_1", "search", {}, rngRolling(15, s.rng_counter)));
    expect(find(pass.events, "searched")).toEqual({ type: "searched", actor: "c_1", success: true, revealed: ["cache"] });
    expect(pass.state.entities.cache!.conditions).toEqual([]);
    const fail = ok(act(s, "c_1", "search", {}, rngRolling(3, s.rng_counter)));
    expect(find(fail.events, "searched")).toMatchObject({ success: false, revealed: [] });
  });

  it("rests only when no hostile creature is visible", () => {
    const s = start();
    s.characters.c_1!.sheet = { ...s.characters.c_1!.sheet, hp: { value: 2, max: 10 } };
    const r = ok(act(s, "c_1", "rest", { kind: "short" }));
    expect(find(r.events, "healed")).toMatchObject({ amount: 5 });
    const t = structuredClone(s);
    t.entities.drone!.at = [3, 2];
    expect(err(act(t, "c_1", "rest", { kind: "long" }))).toBe("requirement_unmet");
  });

  it("resolves free tools immediately without a declaration, and tracks the improvise streak", () => {
    const s = start([character("c_1"), character("c_2")]);
    const ex = ok(act(s, "c_1", "examine", { target_id: "panel" }));
    expect(types(ex.events)).toEqual(["examined"]);
    expect(ex.state.round.declarations).toEqual({});
    const imp = ok(act(s, "c_1", "improvise", { category: "flavor", intent: "hums", suggestions: [] }));
    expect(imp.state.improvise_streak.c_1).toBe(1);
    const again = ok(act(imp.state, "c_1", "improvise", { category: "meta", intent: "rules?", suggestions: [] }));
    expect(again.state.improvise_streak.c_1).toBe(2);
    expect(ok(act(again.state, "c_1", "wait")).state.improvise_streak.c_1).toBe(0);
  });
});

describe("simultaneous rounds", () => {
  it("stores declarations until every character has declared, then resolves by tool priority", () => {
    const s = start([character("c_1"), character("c_2")]);
    const first = ok(act(s, "c_2", "wait"));
    expect(types(first.events)).toEqual(["action_declared"]);
    expect(first.state.round.declarations.c_2).toEqual({ tool: "wait", args: {} });
    const second = ok(act(first.state, "c_1", "move", { to_id: "lamp" }));
    expect(second.state.round.number).toBe(2);
    const order = second.events.filter((e) => e.type === "moved" || e.type === "waited").map((e) => [e.type, e.actor]);
    expect(order).toEqual([
      ["moved", "c_1"],
      ["waited", "c_2"],
    ]);
  });

  it("produces identical results for every arrival order", () => {
    const s = start([character("c_1"), character("c_2")]);
    const a = ok(act(ok(act(s, "c_1", "move", { to_id: "lamp" })).state, "c_2", "move", { to_id: "card" }));
    const b = ok(act(ok(act(s, "c_2", "move", { to_id: "card" })).state, "c_1", "move", { to_id: "lamp" }));
    const resolved = (r: { events: GameEvent[]; state: State }) => ({ events: r.events.filter((e) => e.type !== "action_declared"), state: r.state });
    expect(resolved(a)).toEqual(resolved(b));
  });

  it("lets a character replace its declaration before the round closes", () => {
    const s = start([character("c_1"), character("c_2")]);
    const r = ok(act(ok(act(s, "c_1", "wait")).state, "c_1", "move", { to_id: "lamp" }));
    expect(r.state.round.declarations.c_1!.tool).toBe("move");
  });

  it("voids an action that fails validation at its resolution point", () => {
    const s = start([character("c_1"), character("c_2")]);
    const t = ok(act(s, "c_1", "move", { to_id: "lamp" })).state;
    t.entities.lamp!.location = "vault";
    const r = ok(act(t, "c_2", "wait"));
    expect(find(r.events, "action_voided")).toEqual({ type: "action_voided", actor: "c_1", tool: "move", reason: "not_reachable" });
  });

  it("closes the round on advance, with wait for characters that did not declare", () => {
    const s = start([character("c_1"), character("c_2")]);
    const r = ok(advance(ok(act(s, "c_1", "wait")).state, B, new Rng(SEED, s.rng_counter)));
    expect(r.events.filter((e) => e.type === "waited").map((e) => e.actor)).toEqual(["c_1", "c_2"]);
    expect(r.state.round.number).toBe(2);
  });
});

describe("pending choices", () => {
  it("holds the round open until the choice is made", () => {
    let s = start();
    s.entities._e1!.open = true;
    s.entities.drone!.location = "vault";
    s.locations.deck!.seen = s.locations.deck!.seen.map((row) => "1".repeat(row.length));
    s = play(s, "c_1", [["move", { to_id: "hold" }], ["move", { to_id: "locker" }]]).state;
    const r = ok(act(s, "c_1", "interact", { target_id: "locker", verb: "open" }, rngRolling(8, s.rng_counter)));
    expect(types(r.events)).toEqual(expect.arrayContaining(["check_rolled", "interacted", "choice_offered"]));
    expect(types(r.events)).not.toContain("round_ended");
    expect(r.state.pending_choices.c_1).toBeDefined();
    const option = r.state.pending_choices.c_1!.options[0]!.id;
    const chosen = ok(act(r.state, "c_1", "choose", { option_id: option }));
    expect(types(chosen.events)).toEqual(expect.arrayContaining(["choice_made", "round_ended", "round_started"]));
    expect(chosen.state.pending_choices).toEqual({});
  });
});

describe("endings", () => {
  it("ends the instance with the ending a trigger names", () => {
    let s = start();
    s.entities._e1!.open = true;
    s.entities.drone!.location = "vault";
    s.entities.cache!.conditions = [];
    s = play(s, "c_1", [["move", { to_id: "hold" }], ["move", { to_id: "cache" }]]).state;
    const r = ok(act(s, "c_1", "take", { entity_id: "cache" }));
    expect(find(r.events, "instance_ended")).toEqual({ type: "instance_ended", ending: "escaped" });
    expect(r.state.ended).toEqual({ ending: "escaped" });
    expect(err(act(r.state, "c_1", "wait"))).toBe("instance_not_active");
  });

  it("ends with lost when no character is active", () => {
    const s = start();
    s.characters.c_1!.sheet = { ...s.characters.c_1!.sheet, status: "dead" };
    const r = ok(advance(s, B, new Rng(SEED, s.rng_counter)));
    expect(r.state.ended).toEqual({ ending: "lost" });
  });
});

describe("combat start", () => {
  it("starts combat at the next round when an attack targets a creature, recruiting hostile combatants", () => {
    let s = start();
    s.entities.drone!.at = [3, 2];
    const r = ok(act(s, "c_1", "attack", { target_id: "drone" }));
    expect(types(r.events)).toEqual(expect.arrayContaining(["attacked", "round_ended", "round_started"]));
    s = r.state;
    expect(s.round.mode).toBe("combat");
    expect(s.combatants).toContain("drone");
    expect(s.combat_area).toEqual(["bay"]);
  });
});

describe("effects", () => {
  it("spawns on a free cell chosen by RNG, despawns, and moves entities", () => {
    const ctx = ctxOf(start());
    applyEffects(ctx, [{ spawn: { ref: "base:civilian", room: "deck.hold", id: "guest" } }], {});
    const guest = ctx.state.entities.guest!;
    expect(guest.location).toBe("deck");
    applyEffects(ctx, [{ move_entity: { target: "guest", room: "vault.cellar", at: [2, 1] } }], {});
    expect(ctx.state.entities.guest).toMatchObject({ location: "vault", at: [2, 1] });
    applyEffects(ctx, [{ despawn: { target: "guest" } }], {});
    expect(ctx.state.entities.guest).toBeUndefined();
    expect(types(ctx.events)).toEqual(["entity_spawned", "moved", "entity_despawned"]);
  });

  it("changes flags with clamping, for the party and for characters in the actor's room", () => {
    const ctx = ctxOf(start([character("c_1"), character("c_2")]));
    applyEffects(ctx, [{ add_flag: { flag: "alarm", value: 9 } }, { add_flag: { flag: "purse", value: -20, target: "room" } }], { actor: "c_1" });
    expect(ctx.state.flags.alarm).toBe(3);
    expect(ctx.state.character_flags).toEqual({ c_1: { purse: 0 }, c_2: { purse: 0 } });
  });

  it("applies conditions with durations that expire at round end", () => {
    const s = start();
    const ctx = ctxOf(s);
    applyEffects(ctx, [{ apply_condition: { target: "actor", condition: "panicked" } }], { actor: "c_1" });
    expect(ctx.state.characters.c_1!.conditions).toEqual([{ id: "panicked", remaining: 1 }]);
    const r = ok(act(ctx.state, "c_1", "wait"));
    expect(find(r.events, "condition_removed")).toEqual({ type: "condition_removed", target: "c_1", condition: "panicked" });
  });

  it("applies on_turn_start effects when the bearer's action resolves", () => {
    const s = start();
    s.characters.c_1!.conditions.push({ id: "irradiated", remaining: 3 });
    const r = ok(act(s, "c_1", "wait"));
    expect(types(r.events).slice(0, 3)).toEqual(["action_declared", "damaged", "waited"]);
  });

  it("damages through the rules system and destroys structures, placing their remains", () => {
    const s = start();
    s.entities.crate = { ref: "base:crate_stack", kind: "obstacle", location: "deck", at: [3, 3], conditions: [], sheet: { hp: { value: 4, max: 4 }, status: "active" } };
    const ctx = ctxOf(s);
    applyEffects(ctx, [{ damage: { target: "crate", amount: 4 } }], {});
    expect(types(ctx.events)).toEqual(["damaged", "destroyed", "entity_spawned"]);
    const remains = ctx.events[2]!.entity as string;
    expect(ctx.state.entities[remains]).toMatchObject({ ref: "base:scrap", at: [3, 3] });
  });

  it("gives, removes, and drops items, reveals secrets, sets room light and hostility, and branches with if", () => {
    const ctx = ctxOf(start());
    applyEffects(
      ctx,
      [
        { give_item: { target: "actor", ref: "base:battery" } },
        { drop_item: { target: "actor", ref: "base:battery" } },
        { reveal: { secret: "keeper.past" } },
        { set_room_light: { room: "hold", level: "bright" } },
        { set_hostile: { target: "keeper", hostile: true } },
        { if: { when: { flag: "power" }, then: [{ set_flag: { flag: "alarm", value: 1 } }], else: [{ set_flag: { flag: "alarm", value: 2 } }] } },
      ],
      { actor: "c_1", location: "deck" },
    );
    expect(types(ctx.events)).toEqual(["entity_spawned", "item_dropped", "revealed", "room_light_changed", "flag_set"]);
    expect(ctx.facts).toEqual(["She was a pilot."]);
    expect(ctx.state.revealed).toEqual(["keeper.past"]);
    expect(ctx.state.locations.deck!.rooms.hold!.light).toBe("bright");
    expect(ctx.state.entities.keeper!.hostile).toBe(true);
    expect(ctx.state.flags.alarm).toBe(2);
  });
});

describe("requirements", () => {
  const s = start();
  const ctx = ctxOf(s);
  it.each([
    [{ flag: "power" }, false],
    [{ flag: "alarm", eq: 0 }, true],
    [{ flag: "alarm", gte: 1 }, false],
    [{ flag: "purse", lte: 12 }, true],
    [{ stage: ["main", "start"] }, true],
    [{ has_item: "base:keycard" }, false],
    [{ location: "deck" }, true],
    [{ room: "bay" }, true],
    [{ room: "deck.hold" }, false],
    [{ near: "panel", within: 1 }, true],
    [{ near: "drone", within: 3 }, false],
    [{ illumination: "bright" }, true],
    [{ defeated: "drone" }, false],
    [{ all: [{ location: "deck" }, { not: { flag: "power" } }] }, true],
    [{ any: [{ flag: "power" }, { room: "hold" }] }, false],
  ])("%j is %s", (req, expected) => {
    expect(holds(ctx, req as never, "c_1")).toBe(expected);
  });

  it("is false for requirements about the actor when there is none", () => {
    expect(holds(ctx, { location: "deck" } as never, undefined)).toBe(false);
  });
});

describe("situation", () => {
  it("sums condition advantage, clamped to [-1, 1], and modifier", () => {
    const s = start();
    s.characters.c_1!.conditions = [{ id: "panicked", remaining: 1 }, { id: "panicked", remaining: 1 }];
    expect(situation(ctxOf(s), "c_1", null, ["melee"])).toEqual({ advantage: -1, modifier: 0, tags: ["melee"] });
  });

  it("adds dark or dim for a target on such a cell", () => {
    const s = start();
    expect(situation(ctxOf(s), "c_1", "drone", []).tags).toEqual(["dark"]);
  });
});

describe("lighting and perception", () => {
  it("computes illumination from room light and lit sources", () => {
    const s = start();
    const c = content(B);
    const deck = illumination(s, c, "deck");
    const at = (x: number, y: number) => deck[y * 12 + x];
    expect(at(2, 2)).toBe("bright");
    expect(at(8, 2)).toBe("dark");
    s.entities.lamp!.location = "deck";
    s.entities.lamp!.at = [8, 2];
    const lit = illumination(s, c, "deck");
    expect(lit[2 * 12 + 8]).toBe("bright");
    expect(lit[2 * 12 + 10]).toBe("bright");
    expect(lit[2 * 12 + 5]).toBe("dim");
  });

  it("limits perception by light only when the system's SPATIAL.lighting is true", () => {
    const lighting: RulesSystem = { ...QUEST, SPATIAL: { ...QUEST.SPATIAL, lighting: true } };
    lighting.configure = () => lighting;
    const bundles = trialBundles(lighting);
    const arrange = (t: State) => {
      t.entities._e1!.open = true;
      t.characters.c_1!.at = [4, 2];
      t.entities.drone!.at = [9, 2];
      return t;
    };
    const s = arrange(start([character("c_1")], SEED, bundles));
    const c = content(bundles);
    const body = bodyOf(s, c, "c_1")!;
    expect(new Perception(s, c).visible(body, "drone")).toBe(false);
    s.entities.lamp!.location = "deck";
    s.entities.lamp!.at = [8, 2];
    expect(new Perception(s, c).visible(body, "drone")).toBe(true);
    const plain = arrange(start());
    expect(new Perception(plain, content(B)).visible(bodyOf(plain, content(B), "c_1")!, "drone")).toBe(true);
  });
});

describe("views", () => {
  it("masks unseen cells, omits hidden entities, locks, and flags, and shows currencies", () => {
    const s = start();
    const v = view(s, B, "c_1");
    expect(v.map.rows[1]).toBe("#....#      ");
    expect(v.visible.map((e) => e.id)).not.toContain("cache");
    expect(v.visible.map((e) => e.id)).not.toContain("drone");
    expect(JSON.stringify(v)).not.toContain("lock");
    expect(JSON.stringify(v)).not.toContain("power");
    expect(v.character.currencies).toEqual([{ flag: "purse", label: "credits", amount: 12, coins: [{ id: "scrip", label: "scrip", count: 1 }, { id: "credit", label: "credit", count: 2 }] }]);
    expect(v.round).toEqual({ number: 1, resolution: "simultaneous", declared: [], waiting_on: ["c_1"] });
    // The lamp lying in the bay is lit, so the walls around it are lit too.
    expect(v.map.light[1]).toBe("122222000000");
  });
});

describe("engine properties", () => {
  it("is deterministic and never mutates its input", () => {
    const s = start([character("c_1"), character("c_2")]);
    const frozen = JSON.stringify(s);
    const a = act(s, "c_1", "move", { to_id: "hold" });
    const b = act(s, "c_1", "move", { to_id: "hold" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it("stores the final Rng counter in state", () => {
    const s = start();
    const rng = new Rng(SEED, s.rng_counter);
    const r = ok(act(s, "c_1", "search", {}, rng));
    expect(r.state.rng_counter).toBe(rng.counter);
    expect(r.state.rng_counter).toBeGreaterThan(s.rng_counter);
  });
});
