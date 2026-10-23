// The conformance requirements of docs/systems/README.md, "Conformance", as a reusable suite.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { Rng } from "../../rng";
import { RulesError, type Combatant, type RulesSystem } from "../contract";
import { NO_SITUATION, WRENCH, character, clone, creature, frozen, structure } from "./fixtures";

const NAMES = [
  "ID",
  "VERSION",
  "SCHEMAS",
  "ORDERING",
  "STANDARD_CHECKS",
  "MODULES",
  "SPATIAL",
  "configure",
  "create_character",
  "instantiate",
  "instantiate_structure",
  "speed",
  "senses",
  "reach",
  "summary",
  "check",
  "attack",
  "harm",
  "heal",
  "rest",
  "tick",
  "session_end",
  "initiative",
  "pay_cost",
  "can_carry",
  "use_item",
] as const;

const SCHEMA_KINDS = ["character", "creature", "item", "ability", "check", "structure"] as const;
const RESOLUTION_FIELDS = ["choice", "effects", "events", "outcome", "rolls", "updates"];
// engine.md, "Ordering policy" and `ordered_tool` in defs.schema.json.
const RESOLUTIONS = ["sequential", "simultaneous"];
const REROLLS = ["never", "per_round", "per_combat"];
const ORDERED_TOOLS = ["move", "attack", "ability", "use", "interact", "search", "take", "drop", "give", "talk", "rest", "wait"];

function schemaRegistry(system: RulesSystem): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const schema of Object.values(system.SCHEMAS)) ajv.addSchema(schema);
  return ajv;
}

const schemaId = (schema: object): string => (schema as { $id: string }).$id;

/** Every call that returns a resolution, with fresh arguments and a fresh Rng from `seed`. */
function resolvingCalls(system: RulesSystem): Record<string, (seed: number) => unknown> {
  const rng = (seed: number) => new Rng(seed);
  return {
    attack: (s) => system.attack(character(system), creature(system), WRENCH, NO_SITUATION, rng(s)),
    creatureAttack: (s) => system.attack(creature(system), character(system), null, NO_SITUATION, rng(s)),
    attackStructure: (s) => system.attack(character(system), structure(system), null, NO_SITUATION, rng(s)),
    check: (s) => system.check(character(system), system.STANDARD_CHECKS.search, NO_SITUATION, rng(s)),
    harm: (s) => system.harm(character(system), 3, rng(s), null),
    harmAtDeathsDoor: (s) => system.harm(character(system, "c_1", { status: "deaths_door", hp: { value: 0, max: 10 } }), 3, rng(s), null),
    heal: () => system.heal(character(system, "c_1", { hp: { value: 4, max: 10 } }), 3),
    rest: () => system.rest(character(system, "c_1", { hp: { value: 4, max: 10 } }), "short"),
    tick: () => system.tick(character(system)),
    session_end: () => system.session_end(character(system)),
  };
}

/**
 * Runs the conformance list against `system`. For a system configured with modules, `unconfigured`
 * is the system as registered, against which `configure([])` is compared.
 */
export function conformance(system: RulesSystem, label = system.ID, unconfigured: RulesSystem = system): void {
  describe(`${label}: rules-system conformance`, () => {
    it("exposes every name in the contract", () => {
      for (const name of NAMES) expect(system[name], name).toBeDefined();
      expect(system.ID).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(system.VERSION).toMatch(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/);
      expect(Array.isArray(system.MODULES)).toBe(true);
    });

    it("has a valid 2020-12 schema for every kind, and STANDARD_CHECKS.search validates", () => {
      const ajv = schemaRegistry(system);
      for (const kind of SCHEMA_KINDS) {
        const schema = system.SCHEMAS[kind];
        expect(schema, kind).toBeDefined();
        expect(ajv.validateSchema(schema), kind).toBe(true);
      }
      const validate = ajv.getSchema(schemaId(system.SCHEMAS.check))!;
      expect(validate(system.STANDARD_CHECKS.search), JSON.stringify(validate.errors)).toBe(true);
    });

    it("creates characters that validate and are identical for identical arguments and seed", () => {
      const validate = schemaRegistry(system).getSchema(schemaId(system.SCHEMAS.character))!;
      fc.assert(
        fc.property(fc.nat(), (seed) => {
          const args = ["Vale", { role: "spy", abilities: ["s:a1", "s:a2", "s:a3", "s:a4", "s:a5", "s:a6"], profile: { look: "tall" } }] as const;
          const a = system.create_character(args[0], clone(args[1]), new Rng(seed));
          const b = system.create_character(args[0], clone(args[1]), new Rng(seed));
          return validate(a) === true && JSON.stringify(a) === JSON.stringify(b);
        }),
        { numRuns: 50 },
      );
    });

    it("instantiates creatures and structures with status active", () => {
      expect(creature(system).sheet.status).toBe("active");
      expect(structure(system).sheet.status).toBe("active");
    });

    it("destroys a structure under repeated harm without a died event", () => {
      let target = structure(system, 5);
      const rng = new Rng(1);
      const events: unknown[] = [];
      for (let i = 0; i < 20 && target.sheet.status === "active"; i++) {
        const r = system.harm(target, 1, rng, null);
        events.push(...r.events);
        target = { ...target, sheet: r.updates[target.id] ?? target.sheet };
      }
      expect(target.sheet.status).not.toBe("active");
      expect(events.some((e) => (e as { type: string }).type === "died")).toBe(false);
    });

    it("returns resolutions with exactly the six fields", () => {
      for (const [name, call] of Object.entries(resolvingCalls(system))) {
        for (const seed of [0, 1, 2, 3, 42]) {
          expect(Object.keys(call(seed) as object).sort(), name).toEqual(RESOLUTION_FIELDS);
        }
      }
    });

    it("does not mutate its arguments", () => {
      fc.assert(
        fc.property(fc.nat(), (seed) => {
          const attacker = frozen(character(system));
          const defender = frozen(creature(system));
          const wall = frozen(structure(system));
          const weapon = frozen(clone(WRENCH));
          const situation = frozen(clone(NO_SITUATION));
          const spec = frozen(clone(system.STANDARD_CHECKS.search));
          const rng = new Rng(seed);
          system.attack(attacker, defender, weapon, situation, rng);
          system.attack(defender, attacker, null, situation, rng);
          system.attack(attacker, wall, null, situation, rng);
          system.check(attacker, spec, situation, rng);
          system.harm(attacker, 4, rng, null);
          system.harm(wall, 4, rng, null);
          system.heal(attacker, 2);
          system.rest(attacker, "long");
          system.tick(attacker);
          system.session_end(attacker);
          system.pay_cost(attacker.sheet, frozen({ ap: 1 }));
          system.can_carry(attacker, frozen([weapon]));
          system.use_item(attacker, weapon, rng);
          system.initiative(frozen([attacker, defender]), rng);
          return true;
        }),
        { numRuns: 50 },
      );
    });

    it("returns a permutation of the participants' ids from initiative", () => {
      fc.assert(
        fc.property(fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9_]{0,8}$/), { minLength: 0, maxLength: 12 }), fc.nat(), (ids, seed) => {
          const participants: Combatant[] = ids.map((id, i) => (i % 2 ? creature(system, undefined, id) : character(system, id)));
          const order = system.initiative(participants, new Rng(seed));
          return order.length === ids.length && [...order].sort().join() === [...ids].sort().join();
        }),
      );
    });

    it("configure([]) behaves identically to the unconfigured system and rejects unknown modules", () => {
      const configured = system.configure([]);
      for (const name of ["ID", "VERSION", "SCHEMAS", "ORDERING", "STANDARD_CHECKS", "MODULES", "SPATIAL"] as const) {
        expect(configured[name]).toEqual(unconfigured[name]);
      }
      const plain = resolvingCalls(unconfigured);
      const conf = resolvingCalls(configured);
      for (const name of Object.keys(plain)) {
        for (const seed of [0, 1, 7, 42, 99]) expect(conf[name]!(seed), name).toEqual(plain[name]!(seed));
      }
      expect(() => system.configure(["no_such_module"])).toThrow(RulesError);
    });

    it("returns null from use_item for an item whose stats carry no field the system uses", () => {
      expect(system.use_item(character(system), { ref: "base:pebble", stats: {} }, new Rng(0))).toBeNull();
    });

    it("returns valid speed, reach, and senses", () => {
      const subjects = [character(system), creature(system), creature(system, { template: "boss", ranged: true, speed: 3 })];
      for (const c of subjects) {
        const speed = system.speed(c);
        expect(Number.isInteger(speed) && speed >= 1).toBe(true);
        for (const weapon of [null, WRENCH, { ref: "base:rifle", stats: { weapon: true, ranged: true } }]) {
          const { range, tag } = system.reach(c, weapon);
          expect(range === null || (Number.isInteger(range) && range >= 1)).toBe(true);
          expect(["melee", "ranged"]).toContain(tag);
        }
        expect(system.senses(c).darkvision).toBeGreaterThanOrEqual(0);
      }
    });

    it("has a boolean SPATIAL.lighting and a documented metric", () => {
      expect(typeof system.SPATIAL.lighting).toBe("boolean");
      expect(typeof system.SPATIAL.approach).toBe("boolean");
      expect(["chebyshev", "manhattan"]).toContain(system.SPATIAL.metric);
    });

    it("uses only documented resolution methods and sort keys", () => {
      for (const mode of ["exploration", "combat"] as const) {
        const policy = system.ORDERING[mode];
        expect(RESOLUTIONS).toContain(policy.resolution);
        expect(REROLLS).toContain(policy.reroll);
        for (const key of policy.order) {
          if (key.key === "side") expect(["characters", "entities"]).toContain(key.first);
          else if (key.key === "tool_priority") {
            expect(policy.resolution).toBe("simultaneous");
            for (const tool of key.tools) expect(ORDERED_TOOLS).toContain(tool);
          } else expect(key.key).toBe("initiative");
        }
      }
    });
  });
}
