import { describe, expect, it } from "vitest";
import fc from "fast-check";
import Ajv2020 from "ajv/dist/2020.js";
import { Rng } from "../../rng";
import { RulesError, type Combatant, type HeldItem, type RulesSystem } from "../contract";
import { QUEST } from "../quest";
import { conformance } from "../testing/conformance";
import { NO_SITUATION, WRENCH, character, creature, seedFor, structure } from "../testing/fixtures";
import { questCases } from "../testing/quest-cases";
import { CADMIUM } from "./index";

// docs/systems/README.md, "Conformance", per system and per module combination; engine milestone 3:
// "Cadmium passes every Quest case with no module enabled, and its module tests with each module
// enabled alone and together."
conformance(CADMIUM);
questCases(CADMIUM);
for (const modules of [["armor"], ["stash"], ["armor", "stash"]]) {
  conformance(CADMIUM.configure(modules), `cadmium [${modules.join(", ")}]`, CADMIUM);
}

const ARMORED = CADMIUM.configure(["armor"]);
const STASHED = CADMIUM.configure(["stash"]);
const BOTH = CADMIUM.configure(["armor", "stash"]);

const plain = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

function validator(system: RulesSystem, kind: keyof RulesSystem["SCHEMAS"]) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  return ajv.compile(system.SCHEMAS[kind]!);
}

describe("cadmium: relation to Quest", () => {
  it("returns Quest's results for identical arguments and Rng state with no module", () => {
    fc.assert(
      fc.property(fc.nat(), fc.integer({ min: 0, max: 12 }), (seed, amount) => {
        const calls = (s: RulesSystem) => [
          s.attack(character(s), creature(s), WRENCH, NO_SITUATION, new Rng(seed)),
          s.attack(creature(s), character(s), null, NO_SITUATION, new Rng(seed)),
          s.check(character(s), { tags: ["x"] }, NO_SITUATION, new Rng(seed)),
          s.harm(character(s), amount, new Rng(seed), null),
          s.harm(character(s, "c_1", { status: "deaths_door", hp: { value: 0, max: 10 } }), amount, new Rng(seed), "fire"),
          s.harm(structure(s), amount, new Rng(seed), null),
          s.heal(character(s, "c_1", { hp: { value: 2, max: 10 } }), amount),
          s.rest(character(s, "c_1", { hp: { value: 2, max: 10 } }), "short"),
          s.session_end(character(s)),
          s.pay_cost(character(s).sheet, { ap: Math.min(amount, 10) }),
          s.summary(character(s).sheet),
          s.initiative([character(s, "c_2"), creature(s), character(s)], new Rng(seed)),
          s.use_item(character(s), WRENCH, new Rng(seed)),
          s.can_carry(character(s), Array.from({ length: amount }, (_, i) => ({ ref: `x:${i}`, stats: {} }))),
          s.speed(creature(s, { template: "boss", speed: 3 })),
          s.reach(character(s), WRENCH),
        ];
        expect(plain(calls(CADMIUM))).toEqual(plain(calls(QUEST)));
      }),
      { numRuns: 200 },
    );
    expect(CADMIUM.ORDERING).toEqual(QUEST.ORDERING);
    expect(CADMIUM.SPATIAL).toEqual(QUEST.SPATIAL);
    expect(CADMIUM.STANDARD_CHECKS).toEqual(QUEST.STANDARD_CHECKS);
  });

  it("accepts every valid Quest object in its schemas", () => {
    const cases: [keyof RulesSystem["SCHEMAS"], unknown][] = [
      ["character", character(QUEST).sheet],
      ["creature", { template: "boss", hp: 12, damage: 3, speed: 4, ranged: true }],
      ["item", { weapon: true, damage: 3, ranged: false }],
      ["ability", { roles: ["invoker"], path: "light", cost: { ap: 2 }, roll: true }],
      ["check", { tags: ["athletics"] }],
      ["structure", { hp: 20 }],
    ];
    for (const system of [CADMIUM, ARMORED, STASHED, BOTH]) {
      for (const [kind, value] of cases) expect(validator(system, kind)(value), `${kind} in [${(system as typeof CADMIUM).ENABLED}]`).toBe(true);
    }
  });
});

describe("cadmium: modules and configuration", () => {
  it("offers armor and stash, in canonical order, and rejects unknown modules", () => {
    expect(CADMIUM.MODULES).toEqual(["armor", "stash"]);
    expect(CADMIUM.configure(["stash", "armor"])).toBe(BOTH);
    expect((BOTH as typeof CADMIUM).ENABLED).toEqual(["armor", "stash"]);
    expect(BOTH.configure([])).toBe(CADMIUM);
    expect(() => CADMIUM.configure(["armor", "lanterns"])).toThrow(RulesError);
  });

  it("accepts module fields only while their module is enabled", () => {
    const fields: [keyof RulesSystem["SCHEMAS"], unknown, "armor" | "stash"][] = [
      ["item", { armor: 4 }, "armor"],
      ["creature", { template: "minion", armor: 2 }, "armor"],
      ["character", { ...character(ARMORED).sheet }, "armor"],
      ["item", { slots: 6 }, "stash"],
    ];
    for (const [kind, value, module] of fields) {
      for (const system of [CADMIUM, ARMORED, STASHED, BOTH]) {
        const enabled = (system as typeof CADMIUM).ENABLED.includes(module);
        expect(validator(system, kind)(value), `${kind} ${module} in [${(system as typeof CADMIUM).ENABLED}]`).toBe(enabled);
      }
    }
  });

  it("lets a stash character schema hold more than 12 items", () => {
    const sheet = { ...character(CADMIUM).sheet, inventory: Array.from({ length: 14 }, (_, i) => ({ ref: `x:${i}` })) };
    expect(validator(STASHED, "character")(sheet)).toBe(true);
  });
});

describe("cadmium: module armor", () => {
  const armoredCreature = (armor: number, template = "boss") => creature(ARMORED, { template, armor });

  it("gives characters the default pool and creatures their starting pool", () => {
    expect(character(ARMORED).sheet.armor).toEqual({ value: 0, max: 6 });
    expect(armoredCreature(3).sheet.armor).toEqual({ value: 3, max: 3 });
    expect(armoredCreature(0).sheet.armor).toEqual({ value: 0, max: 0 });
    expect(creature(ARMORED).sheet.armor).toBeUndefined();
    expect(() => CADMIUM.instantiate({ template: "boss", armor: 3 }, new Rng(0))).toThrow(RulesError);
  });

  it("absorbs harm before hit points", () => {
    const r = ARMORED.harm(armoredCreature(3), 5, new Rng(0), null);
    expect(r.events).toEqual([
      { type: "resource_changed", target: "e_1", resource: "armor", delta: -3, value: 0 },
      { type: "damaged", target: "e_1", amount: 2, remaining: 8 },
    ]);
    expect(r.updates.e_1).toMatchObject({ armor: { value: 0, max: 3 }, hp: { value: 8, max: 10 } });
  });

  it("absorbs harm entirely when the pool is large enough", () => {
    const r = ARMORED.harm(armoredCreature(6), 4, new Rng(0), "fire");
    expect(r.events).toEqual([{ type: "resource_changed", target: "e_1", resource: "armor", delta: -4, value: 2 }]);
    expect(r.updates.e_1).toMatchObject({ armor: { value: 2, max: 6 }, hp: { value: 10, max: 10 } });
  });

  it("absorbs harm at death's door, rolling only for the remainder", () => {
    const atDoor = (value: number) =>
      character(ARMORED, "c_1", { status: "deaths_door", hp: { value: 0, max: 10 }, armor: { value, max: 6 } });
    const rng = new Rng(0);
    const absorbed = ARMORED.harm(atDoor(4), 3, rng, null);
    expect(rng.counter).toBe(0);
    expect(absorbed.updates.c_1).toMatchObject({ status: "deaths_door", armor: { value: 1, max: 6 } });
    const killed = ARMORED.harm(atDoor(1), 3, new Rng(seedFor(2)), null);
    expect(killed.rolls).toEqual([{ label: "death's door", dice: [2], total: 2 }]);
    expect(killed.updates.c_1).toMatchObject({ status: "dead", armor: { value: 0, max: 6 } });
  });

  it("absorbs attack damage", () => {
    const r = ARMORED.attack(character(ARMORED), armoredCreature(1), WRENCH, NO_SITUATION, new Rng(seedFor(15)));
    expect(r.updates.e_1).toMatchObject({ armor: { value: 0, max: 1 }, hp: { value: 9, max: 10 } });
  });

  it("does not shield structures", () => {
    expect(ARMORED.harm(structure(ARMORED), 2, new Rng(0), null).events).toEqual(QUEST.harm(structure(QUEST), 2, new Rng(0), null).events);
  });

  it("dons armor up to max, consuming the item, and refuses with a full pool", () => {
    const plate: HeldItem = { ref: "base:plate", stats: { armor: 4 } };
    const donned = ARMORED.use_item(character(ARMORED), plate, new Rng(0));
    expect(donned).toMatchObject({ consume: true, updates: { c_1: { armor: { value: 4, max: 6 } } } });
    expect(donned?.events).toEqual([{ type: "resource_changed", target: "c_1", resource: "armor", delta: 4, value: 4 }]);
    const nearlyFull = character(ARMORED, "c_1", { armor: { value: 5, max: 6 } });
    expect(ARMORED.use_item(nearlyFull, plate, new Rng(0))?.updates.c_1).toMatchObject({ armor: { value: 6, max: 6 } });
    const full = character(ARMORED, "c_1", { armor: { value: 6, max: 6 } });
    try {
      ARMORED.use_item(full, plate, new Rng(0));
      expect.unreachable();
    } catch (e) {
      expect((e as RulesError).code).toBe("requirement_unmet");
    }
    expect(CADMIUM.use_item(character(CADMIUM), plate, new Rng(0))).toBeNull();
  });

  it("is not restored by rests, and is reported by summary", () => {
    const worn: Combatant = character(ARMORED, "c_1", { hp: { value: 2, max: 10 }, armor: { value: 1, max: 6 } });
    expect(ARMORED.rest(worn, "long").updates.c_1).toMatchObject({ armor: { value: 1, max: 6 }, hp: { value: 10, max: 10 } });
    expect(ARMORED.summary(worn.sheet).resources).toEqual({ AP: "10", armor: "1/6" });
    expect(CADMIUM.summary(character(CADMIUM).sheet).resources).toEqual({ AP: "10" });
  });
});

describe("cadmium: module stash", () => {
  const items = (n: number, extra: HeldItem[] = []): HeldItem[] => [...Array.from({ length: n }, (_, i) => ({ ref: `x:i${i}`, stats: {} })), ...extra];
  const pack = (slots: number, ref = "x:pack"): HeldItem => ({ ref, stats: { slots } });
  const c = character(STASHED);

  it("holds base_slots items without containers", () => {
    expect(STASHED.can_carry(c, items(12))).toBe(true);
    expect(STASHED.can_carry(c, items(13))).toBe(false);
  });

  it("adds each carried container's slots, the container occupying one", () => {
    expect(STASHED.can_carry(c, items(17, [pack(6)]))).toBe(true);
    expect(STASHED.can_carry(c, items(18, [pack(6)]))).toBe(false);
    expect(STASHED.can_carry(c, items(18, [pack(6), pack(2, "x:pouch")]))).toBe(true);
    expect(STASHED.can_carry(c, items(19, [pack(6), pack(2, "x:pouch")]))).toBe(false);
  });

  it("allows at most max_containers containers", () => {
    expect(STASHED.can_carry(c, [pack(2, "x:a"), pack(2, "x:b"), pack(2, "x:c")])).toBe(false);
  });

  it("refuses dropping a container while the rest exceeds the reduced limit", () => {
    expect(STASHED.can_carry(c, items(14))).toBe(false);
  });

  it("does not raise capacity while disabled", () => {
    expect(CADMIUM.can_carry(c, items(12, [pack(6)]))).toBe(false);
    expect(ARMORED.can_carry(c, items(12, [pack(6)]))).toBe(false);
    expect(BOTH.can_carry(c, items(12, [pack(6)]))).toBe(true);
  });
});
