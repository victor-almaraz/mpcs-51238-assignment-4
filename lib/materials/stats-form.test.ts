// StatsEditor fields generated from the rules systems' schemas, with module fields only while enabled.

import { describe, expect, it } from "vitest";
import { extraKeys, fits, hiddenModuleFields, parseNumber, statsFields, statsKindOf, statsSchema, withField } from "./stats-form";

const keys = (system: string, modules: string[], kind: Parameters<typeof statsSchema>[2]) => statsFields(statsSchema(system, modules, kind))!.fields.map((f) => f.key);

describe("statsFields", () => {
  it("builds Quest's creature form with types, bounds, enums, and required fields", () => {
    const form = statsFields(statsSchema("quest", [], "creature"))!;
    expect(form.open).toBe(false);
    expect(form.fields).toEqual([
      { key: "template", label: "template", required: true, type: "enum", options: ["commoner", "minion", "boss"] },
      { key: "hp", label: "hp", required: false, type: "integer", min: 1 },
      { key: "damage", label: "damage", required: false, type: "integer", min: 0 },
      { key: "speed", label: "speed", required: false, type: "integer", min: 1, max: 24, description: "Cells per combat turn. Default from data.json spatial.speed." },
      { key: "ranged", label: "ranged", required: false, type: "boolean", description: "Attacks any visible target instead of adjacent ones." },
    ]);
  });

  it("nests objects and lists of strings for abilities", () => {
    const form = statsFields(statsSchema("quest", [], "ability"))!;
    expect(form.fields.find((f) => f.key === "roles")).toMatchObject({ type: "strings" });
    expect(form.fields.find((f) => f.key === "cost")).toMatchObject({ type: "object", required: true, fields: [{ key: "ap", type: "integer", required: true, min: 0 }] });
  });

  it("shows Cadmium's module fields only for enabled modules, marked with the module", () => {
    expect(keys("cadmium", [], "item")).toEqual(["weapon", "damage", "ranged"]);
    expect(keys("cadmium", ["stash"], "item")).toEqual(["weapon", "damage", "ranged", "slots"]);
    const armor = statsFields(statsSchema("cadmium", ["armor"], "creature"))!.fields.find((f) => f.key === "armor");
    expect(armor).toMatchObject({ module: "armor", description: "starting armor pool.", min: 0, max: 40 });
    expect(hiddenModuleFields("cadmium", ["armor"], "item")).toEqual([["stash", "slots"]]);
    expect(hiddenModuleFields("quest", [], "item")).toEqual([]);
  });

  it("falls back to raw for schema features the form does not cover", () => {
    expect(statsFields({ type: "object", oneOf: [] })).toBeNull();
    expect(statsFields({ type: "string" })).toBeNull();
    const form = statsFields({ type: "object", properties: { a: { oneOf: [{ type: "string" }] }, b: { type: "array", items: { type: "integer" } }, c: { type: ["integer", "null"], minimum: 1 } } })!;
    expect(form.fields.map((f) => f.type)).toEqual(["raw", "raw", "integer"]);
    expect(form.open).toBe(true);
  });

  it("returns nothing for an unknown system", () => {
    expect(statsSchema("nope", [], "item")).toBeUndefined();
  });
});

describe("values", () => {
  const [template, hp] = statsFields(statsSchema("quest", [], "creature"))!.fields;
  it("checks that a value fits its input", () => {
    expect(fits(template!, "boss")).toBe(true);
    expect(fits(template!, "dragon")).toBe(false);
    expect(fits(hp!, 2.5)).toBe(false);
    expect(fits(hp!, undefined)).toBe(true);
  });

  it("sets and removes fields without changing the input", () => {
    const v = { template: "boss" };
    expect(withField(v, "hp", 4)).toEqual({ template: "boss", hp: 4 });
    expect(withField({ template: "boss", hp: 4 }, "hp", undefined)).toEqual({ template: "boss" });
    expect(v).toEqual({ template: "boss" });
    expect(withField(undefined, "hp", 1)).toEqual({ hp: 1 });
  });

  it("lists keys outside the schema and parses numbers", () => {
    expect(extraKeys({ template: "boss", armor: 2 }, statsFields(statsSchema("quest", [], "creature"))!.fields)).toEqual(["armor"]);
    expect([parseNumber(""), parseNumber("3"), parseNumber("x")]).toEqual([undefined, 3, undefined]);
  });

  it("maps entity kinds to stats kinds", () => {
    expect(["creature", "item", "obstacle", "door", "container", "fixture"].map(statsKindOf)).toEqual(["creature", "item", "structure", "structure", undefined, undefined]);
  });
});
