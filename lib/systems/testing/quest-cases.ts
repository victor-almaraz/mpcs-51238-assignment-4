// Rule tests for docs/systems/quest.md, parameterized by system so that Cadmium runs every case
// with no module enabled (docs/systems/cadmium.md, "Relation to Quest").

import { describe, expect, it } from "vitest";
import { Rng } from "../../rng";
import { RulesError, type Combatant, type GameEvent, type RulesSystem } from "../contract";
import { ABILITIES, NO_SITUATION, WRENCH, character, creature, seedFor, structure } from "./fixtures";

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const hp = (c: Combatant) => (c.sheet.hp as { value: number; max: number }).value;

export function questCases(system: RulesSystem): void {
  describe(`${system.ID}: Quest rules`, () => {
    describe("outcome tiers", () => {
      it.each([
        [20, "critical_success"],
        [19, "success"],
        [11, "success"],
        [10, "partial"],
        [6, "partial"],
        [5, "failure"],
        [2, "failure"],
        [1, "critical_failure"],
      ])("d20 %i is %s, and the situation never modifies it", (roll, tier) => {
        const seed = seedFor(roll);
        const situation = { advantage: 1, modifier: 5, tags: ["cover", "dark"] };
        const r = system.check(creature(system), {}, situation, new Rng(seed));
        expect(r.outcome).toBe(tier);
        expect(r.rolls).toEqual([{ label: "check", dice: [roll], total: roll }]);
        expect(r.events).toEqual([{ type: "check_rolled", target: "e_1", outcome: tier, roll }]);
      });
    });

    describe("checks", () => {
      it("give creatures the tier without setbacks", () => {
        for (const roll of [1, 3, 8]) {
          const r = system.check(creature(system), {}, NO_SITUATION, new Rng(seedFor(roll)));
          expect(r.choice).toBeNull();
          expect(r.effects).toEqual([]);
          expect(r.updates).toEqual({});
        }
      });

      it("apply no setback to a character's success", () => {
        const r = system.check(character(system), { tags: ["athletics"] }, NO_SITUATION, new Rng(seedFor(15)));
        expect(r.outcome).toBe("success");
        expect([r.choice, r.effects, r.updates]).toEqual([null, [], {}]);
      });

      it("offer two distinct applicable tough-choice setbacks on a partial", () => {
        const seed = seedFor(8);
        const rng = new Rng(seed);
        const r = system.check(character(system), {}, NO_SITUATION, rng);
        expect(r.outcome).toBe("partial");
        expect(r.choice?.actor).toBe("c_1");
        expect(r.choice?.prompt).toBe("Success, at a cost. Choose a setback.");
        // Without an item in use, "lose your grip" does not apply.
        expect(r.choice?.options.map((o) => o.id).sort()).toEqual(["drained", "strain"]);
        const strain = r.choice!.options.find((o) => o.id === "strain")!;
        expect(strain.label).toBe("Strain yourself: lose 1 HP");
        expect(strain.effects).toEqual([{ damage: { target: "c_1", amount: 1 } }]);
        const drained = r.choice!.options.find((o) => o.id === "drained")!;
        expect(drained.updates.c_1?.ap).toBe(9);
        expect(drained.events).toEqual([{ type: "resource_changed", target: "c_1", resource: "ap", delta: -1, value: 9 }]);
        expect(rng.counter).toBe(3); // the check, then one draw per setback
      });

      it("offer only the setbacks that apply", () => {
        const r = system.check(character(system, "c_1", { ap: 0 }), {}, NO_SITUATION, new Rng(seedFor(8)));
        expect(r.choice?.options.map((o) => o.id)).toEqual(["strain"]);
      });

      it("apply one setback from the failure list on a failure", () => {
        const failure = ["strain", "lose_grip", "drained"];
        for (let s = 0, seen = 0; seen < 10; s++) {
          const r = system.check(character(system), {}, NO_SITUATION, new Rng(s));
          if (r.outcome !== "failure") continue;
          seen++;
          const pick = failure[new Rng(s, 1).die(3) - 1];
          expect(r.choice).toBeNull();
          if (pick === "strain") expect(r.effects).toEqual([{ damage: { target: "c_1", amount: 1 } }]);
          if (pick === "drained") expect(r.updates.c_1?.ap).toBe(9);
          if (pick === "lose_grip") expect([r.effects, r.updates]).toEqual([[], {}]); // nothing in use
        }
      });

      it("apply one severe setback on a critical failure", () => {
        const seed = seedFor(1);
        const r = system.check(character(system), {}, NO_SITUATION, new Rng(seed));
        const pick = ["wounded", "lose_grip"][new Rng(seed, 1).die(2) - 1];
        expect(r.outcome).toBe("critical_failure");
        expect(r.effects).toEqual(pick === "wounded" ? [{ damage: { target: "c_1", amount: 2 } }] : []);
      });

      it("reject an invalid specification", () => {
        expect(() => system.check(character(system), { dc: 10 }, NO_SITUATION, new Rng(0))).toThrow(RulesError);
      });
    });

    describe("attacks", () => {
      const damageOf = (roll: number, attacker: Combatant, weapon = WRENCH as typeof WRENCH | null) =>
        system.attack(attacker, creature(system, { template: "boss" }), weapon, NO_SITUATION, new Rng(seedFor(roll))).events[0]!.damage;

      it("deal double, standard, standard, none, none by tier", () => {
        expect([20, 15, 8, 3, 1].map((r) => damageOf(r, character(system)))).toEqual([4, 2, 2, 0, 0]);
      });

      it("deal the weapon's damage, 2 by default, and 1 unarmed", () => {
        expect(damageOf(15, character(system), null)).toBe(1);
        expect(damageOf(15, character(system), { ref: "base:club", stats: { weapon: true } })).toBe(2);
        expect(damageOf(15, character(system), { ref: "base:axe", stats: { weapon: true, damage: 3 } })).toBe(3);
        expect(damageOf(20, character(system), null)).toBe(2);
      });

      it("deal a creature's damage, 2 by default", () => {
        expect(damageOf(15, creature(system))).toBe(2);
        expect(damageOf(15, creature(system, { template: "minion", damage: 3 }))).toBe(3);
      });

      it("reproduce the api.md commit example: a partial hit on a drone", () => {
        const drone = creature(system, { template: "minion" }, "e_drone1");
        const r = system.attack(character(system, "c_17"), drone, WRENCH, NO_SITUATION, new Rng(seedFor(8)));
        expect(r.events).toEqual([
          { type: "attacked", actor: "c_17", target: "e_drone1", roll: 8, outcome: "partial", damage: 2 },
          { type: "damaged", target: "e_drone1", amount: 2, remaining: 2 },
        ]);
        expect(r.choice?.options.map((o) => o.id).every((id) => ["strain", "drained", "lose_grip"].includes(id))).toBe(true);
        expect(r.choice?.options).toHaveLength(2);
      });

      it("offer dropping the weapon as a setback and return it as a drop_item effect", () => {
        const options = new Set<string>();
        for (let s = 0; options.size < 3 && s < 10_000; s++) {
          const r = system.attack(character(system), creature(system), WRENCH, NO_SITUATION, new Rng(s));
          if (r.outcome !== "partial") continue;
          for (const o of r.choice!.options) {
            options.add(o.id);
            if (o.id === "lose_grip") expect(o.effects).toEqual([{ drop_item: { target: "c_1", ref: "base:wrench" } }]);
          }
        }
        expect([...options].sort()).toEqual(["drained", "lose_grip", "strain"]);
      });

      it("give the attacker a setback on a failure and a severe setback on a critical failure", () => {
        for (const roll of [3, 1]) {
          const seed = seedFor(roll);
          const r = system.attack(character(system), creature(system), WRENCH, NO_SITUATION, new Rng(seed));
          const list = roll === 1 ? ["wounded", "lose_grip"] : ["strain", "lose_grip", "drained"];
          const pick = list[new Rng(seed, 1).die(list.length) - 1];
          const expected = { strain: 1, wounded: 2 }[pick as "strain"];
          if (expected) expect(r.effects).toEqual([{ damage: { target: "c_1", amount: expected } }]);
          if (pick === "lose_grip") expect(r.effects).toEqual([{ drop_item: { target: "c_1", ref: "base:wrench" } }]);
          if (pick === "drained") expect(r.updates.c_1?.ap).toBe(9);
        }
      });

      it("give attacking creatures no setbacks", () => {
        for (const roll of [1, 3, 8]) {
          const r = system.attack(creature(system), character(system), null, NO_SITUATION, new Rng(seedFor(roll)));
          expect([r.choice, r.effects]).toEqual([null, []]);
          expect(r.updates.e_1).toBeUndefined();
        }
      });

      it("damage structures", () => {
        const r = system.attack(character(system), structure(system, 2), null, NO_SITUATION, new Rng(seedFor(20)));
        expect(r.updates.s_1!.status).toBe("destroyed");
        expect(types(r.events)).toEqual(["attacked", "damaged"]);
      });
    });

    describe("harm, death, and healing", () => {
      it("reduces HP to a minimum of 0 and puts a character at death's door", () => {
        const r = system.harm(character(system), 3, new Rng(0), null);
        expect(r.events).toEqual([{ type: "damaged", target: "c_1", amount: 3, remaining: 7 }]);
        const r2 = system.harm(character(system, "c_1", { hp: { value: 2, max: 10 } }), 5, new Rng(0), "fire");
        expect(r2.updates.c_1).toMatchObject({ hp: { value: 0, max: 10 }, status: "deaths_door" });
        expect(types(r2.events)).toEqual(["damaged"]);
      });

      it("rolls a d20 for harm at death's door and kills at or below the harm dealt", () => {
        const atDoor = character(system, "c_1", { hp: { value: 0, max: 10 }, status: "deaths_door" });
        const killed = system.harm(atDoor, 3, new Rng(seedFor(3)), null);
        expect(killed.rolls).toEqual([{ label: "death's door", dice: [3], total: 3 }]);
        expect(killed.updates.c_1!.status).toBe("dead");
        expect(types(killed.events)).toEqual(["damaged", "died"]);
        const spared = system.harm(atDoor, 3, new Rng(seedFor(4)), null);
        expect(spared.updates).toEqual({});
        expect(types(spared.events)).toEqual(["damaged"]);
      });

      it("kills a creature at 0 HP", () => {
        const r = system.harm(creature(system), 4, new Rng(0), null);
        expect(r.updates.e_1!.status).toBe("dead");
        expect(types(r.events)).toEqual(["damaged", "died"]);
      });

      it("ignores harm to the dead and the destroyed, and harm of 0", () => {
        const dead = character(system, "c_1", { status: "dead", hp: { value: 0, max: 10 } });
        expect(system.harm(dead, 3, new Rng(0), null).events).toEqual([]);
        expect(system.harm(character(system), 0, new Rng(0), null).events).toEqual([]);
        const rng = new Rng(0);
        system.harm(dead, 3, rng, null);
        expect(rng.counter).toBe(0);
      });

      it("heals up to the maximum and returns a character at death's door to active", () => {
        const r = system.heal(character(system, "c_1", { hp: { value: 8, max: 10 } }), 5);
        expect(r.events).toEqual([{ type: "healed", target: "c_1", amount: 2 }]);
        expect(r.updates.c_1).toMatchObject({ hp: { value: 10, max: 10 } });
        const up = system.heal(character(system, "c_1", { hp: { value: 0, max: 10 }, status: "deaths_door" }), 1);
        expect(up.updates.c_1).toMatchObject({ hp: { value: 1, max: 10 }, status: "active" });
      });

      it("does not heal structures or the dead", () => {
        expect(system.heal(structure(system), 3).updates).toEqual({});
        expect(system.heal(character(system, "c_1", { status: "dead", hp: { value: 0, max: 10 } }), 3).updates).toEqual({});
      });
    });

    describe("resting", () => {
      it("regains half of maximum HP on a short rest and all of it on a long rest, leaving AP unchanged", () => {
        const hurt = character(system, "c_1", { hp: { value: 1, max: 10 }, ap: 3 });
        expect(system.rest(hurt, "short").updates.c_1).toMatchObject({ hp: { value: 6, max: 10 }, ap: 3 });
        expect(system.rest(hurt, "long").updates.c_1).toMatchObject({ hp: { value: 10, max: 10 }, ap: 3 });
      });

      it("rejects an unknown kind", () => {
        expect(() => system.rest(character(system), "nap")).toThrow(RulesError);
      });
    });

    describe("abilities and AP", () => {
      it("deducts AP and fails with requirement_unmet when it is insufficient", () => {
        const sheet = character(system).sheet;
        expect(system.pay_cost(sheet, { ap: 2 }).ap).toBe(8);
        expect(sheet.ap).toBe(10);
        try {
          system.pay_cost(sheet, { ap: 11 });
          expect.unreachable();
        } catch (e) {
          expect(e).toBeInstanceOf(RulesError);
          expect((e as RulesError).code).toBe("requirement_unmet");
        }
      });

      it("awards ap_award_per_session at session end to characters only", () => {
        const r = system.session_end(character(system));
        expect(r.events).toEqual([{ type: "resource_changed", target: "c_1", resource: "ap", delta: 5, value: 15 }]);
        expect(system.session_end(creature(system)).updates).toEqual({});
      });

      it("ticks nothing at round end", () => {
        expect(system.tick(character(system)).events).toEqual([]);
      });
    });

    describe("creatures, items, and structures", () => {
      it.each([
        ["commoner", 2],
        ["minion", 4],
        ["boss", 10],
      ])("instantiates a %s with %i HP", (template, max) => {
        expect(creature(system, { template }).sheet).toEqual({ template, hp: { value: max, max }, damage: 2, status: "active" });
      });

      it("applies creature overrides and rejects invalid stats", () => {
        expect(creature(system, { template: "boss", hp: 15, damage: 4, speed: 3, ranged: true }).sheet).toMatchObject({
          hp: { value: 15, max: 15 },
          damage: 4,
          speed: 3,
          ranged: true,
        });
        for (const stats of [{}, { template: "goon" }, { template: "boss", hp: 0 }, { template: "boss", armor: 2 }]) {
          expect(() => system.instantiate(stats, new Rng(0))).toThrow(RulesError);
        }
      });

      it("builds structure sheets from hp", () => {
        expect(structure(system, 20).sheet).toEqual({ hp: { value: 20, max: 20 }, status: "active" });
        expect(() => system.instantiate_structure({})).toThrow(RulesError);
      });

      it("has no rules effect for used items", () => {
        expect(system.use_item(character(system), WRENCH, new Rng(0))).toBeNull();
      });

      it("carries at most 12 items", () => {
        const items = (n: number) => Array.from({ length: n }, (_, i) => ({ ref: `base:i${i}`, stats: {} }));
        expect(system.can_carry(character(system), items(12))).toBe(true);
        expect(system.can_carry(character(system), items(13))).toBe(false);
      });
    });

    describe("movement, reach, and vision", () => {
      it("moves 6 cells per combat turn unless a creature sets speed", () => {
        expect(system.speed(character(system))).toBe(6);
        expect(system.speed(creature(system))).toBe(6);
        expect(system.speed(creature(system, { template: "minion", speed: 2 }))).toBe(2);
      });

      it("reaches adjacent targets in melee and any visible target at range", () => {
        expect(system.reach(character(system), null)).toEqual({ range: 1, tag: "melee" });
        expect(system.reach(character(system), WRENCH)).toEqual({ range: 1, tag: "melee" });
        expect(system.reach(character(system), { ref: "base:rifle", stats: { weapon: true, ranged: true } })).toEqual({ range: null, tag: "ranged" });
        expect(system.reach(creature(system, { template: "minion", ranged: true }), null)).toEqual({ range: null, tag: "ranged" });
      });

      it("has no darkvision, no lighting limits, chebyshev distance, and approach", () => {
        expect(system.senses(character(system))).toEqual({ darkvision: 0 });
        expect(system.SPATIAL).toEqual({ metric: "chebyshev", approach: true, lighting: false });
      });
    });

    describe("ordering", () => {
      it("is simultaneous in both modes, by tool priority in exploration and characters first in combat", () => {
        expect(system.ORDERING.exploration.resolution).toBe("simultaneous");
        expect(system.ORDERING.exploration.order[0]!.key).toBe("tool_priority");
        expect(system.ORDERING.combat).toEqual({ resolution: "simultaneous", order: [{ key: "side", first: "characters" }], reroll: "never" });
      });
    });

    describe("character creation", () => {
      it("builds a sheet with 10 HP, 10 AP, and the chosen role and abilities", () => {
        const sheet = system.create_character("Vale", { role: "spy", abilities: ABILITIES, items: ["base:wrench"], profile: { look: "tall" } }, new Rng(0));
        expect(sheet).toEqual({
          name: "Vale",
          role: "spy",
          hp: { value: 10, max: 10 },
          ap: 10,
          abilities: ABILITIES,
          inventory: [{ ref: "base:wrench" }],
          status: "active",
          profile: { look: "tall" },
        });
      });

      it.each([
        ["an unknown role", "Vale", { role: "bard", abilities: ABILITIES }],
        ["five abilities", "Vale", { role: "spy", abilities: ABILITIES.slice(0, 5) }],
        ["repeated abilities", "Vale", { role: "spy", abilities: [...ABILITIES.slice(0, 5), ABILITIES[0]] }],
        ["an unknown choice", "Vale", { role: "spy", abilities: ABILITIES, hp: 20 }],
        ["an empty name", "", { role: "spy", abilities: ABILITIES }],
        ["a long name", "x".repeat(41), { role: "spy", abilities: ABILITIES }],
        ["a long profile answer", "Vale", { role: "spy", abilities: ABILITIES, profile: { look: "x".repeat(201) } }],
      ])("rejects %s", (_, name, choices) => {
        expect(() => system.create_character(name, choices, new Rng(0))).toThrow(RulesError);
      });
    });

    describe("summary", () => {
      it("reports health, status, and AP as labels", () => {
        expect(system.summary(character(system, "c_1", { hp: { value: 0, max: 10 }, status: "deaths_door" }).sheet)).toEqual({
          health: "0/10 HP",
          status: "at death's door",
          resources: { AP: "10" },
        });
        expect(system.summary(creature(system).sheet)).toEqual({ health: "4/4 HP", status: "active" });
      });
    });
  });
}
