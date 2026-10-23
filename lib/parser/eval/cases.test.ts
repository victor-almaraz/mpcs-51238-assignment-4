import { describe, expect, it } from "vitest";
import { submit } from "../../engine";
import { sunkenBundles } from "../../harness/scenarios";
import { Rng } from "../../rng";
import { evaluate, evaluationCases } from "./cases";

const cases = evaluationCases();

describe("parser evaluation set", () => {
  it("covers every tool and every improvise category", () => {
    const tools = new Set(cases.map((c) => c.expected.tool));
    for (const t of ["move", "attack", "ability", "use", "interact", "examine", "search", "take", "drop", "talk", "rest", "wait", "choose", "improvise"]) expect(tools).toContain(t);
    const categories = new Set(cases.filter((c) => c.expected.tool === "improvise").map((c) => c.expected.args!.category));
    expect([...categories].sort()).toEqual(["flavor", "impossible", "meta", "overreach", "unclear", "unsupported"]);
  });

  // A correct parse may still be refused by the rules (a locked lift, a hatch out of reach); it must
  // never be malformed or name an unknown id.
  it.each(cases.filter((c) => c.expected.tool !== "improvise").map((c) => [c.name, c] as const))("%s: offers the expected call, well formed", (_name, c) => {
    const def = c.tools.find((t) => t.name === c.expected.tool);
    expect(def, `tool ${c.expected.tool} is offered`).toBeDefined();
    for (const [k, v] of Object.entries(c.expected.args ?? {})) {
      const values = (def!.input_schema.properties[k] as { enum?: string[] } | undefined)?.enum;
      expect(values, `${k} is an argument`).toBeDefined();
      expect(values).toContain(v);
    }
    const args: Record<string, unknown> = { ...(c.expected.args ?? {}) };
    if (c.expected.tool === "talk") args.utterance = "Hello.";
    const r = submit(c.state, sunkenBundles(), "c_1", { tool: c.expected.tool, args }, new Rng(11n, c.state.rng_counter));
    expect(r.ok ? "ok" : r.error.code).toMatch(/^(ok|not_reachable|requirement_unmet)$/);
  });

  it("scores an oracle at 100% with no overreach violations", async () => {
    const report = await evaluate(async (c) => ({ tool: c.expected.tool, args: { ...(c.expected.args ?? {}) } }));
    expect(report).toMatchObject({ accuracy: 1, overreach_violations: [] });
  });
});
