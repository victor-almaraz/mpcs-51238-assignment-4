import { describe, expect, it } from "vitest";
import { groqChat } from "../models/groq";
import { clip, modelNarrator } from "../narrator/adapter";
import { modelParser, parserPrompt } from "./adapter";
import { evaluationCases } from "./eval/cases";

const sample = evaluationCases()[0]!;

function fakeFetch(answer: (body: { tools?: unknown[] }) => { status?: number; body?: unknown; hang?: boolean }): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    const a = answer(JSON.parse(String(init.body)));
    if (a.hang) {
      await new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  }) as unknown as typeof fetch;
}

const toolCalls = (...calls: [string, string][]) => ({ choices: [{ message: { content: null, tool_calls: calls.map(([name, args]) => ({ function: { name, arguments: args } })) } }] });

describe("parser adapter", () => {
  it("returns the single tool call, sending tools in the vendor's format", async () => {
    let sent: { tools?: { type: string; function: { name: string } }[] } = {};
    const parser = modelParser(groqChat("k", fakeFetch((b) => ((sent = b as typeof sent), { body: toolCalls(["move", '{"to_id":"hangar"}']) }))), "m", 1000);
    const r = await parser.parse(sample.context, sample.tools, []);
    expect(r).toMatchObject({ ok: true, call: { tool: "move", args: { to_id: "hangar" } } });
    expect(sent.tools![0]).toMatchObject({ type: "function", function: { name: sample.tools[0]!.name } });
  });

  it("counts zero or several tool calls, or malformed arguments, as invalid_call", async () => {
    for (const body of [toolCalls(), toolCalls(["wait", "{}"], ["search", "{}"]), toolCalls(["move", "not json"])]) {
      const r = await modelParser(groqChat("k", fakeFetch(() => ({ body }))), "m", 1000).parse(sample.context, sample.tools, []);
      expect(r).toMatchObject({ ok: false, reason: "invalid_call" });
    }
  });

  it("reports timeouts and unavailable models without throwing", async () => {
    expect(await modelParser(groqChat("k", fakeFetch(() => ({ hang: true }))), "m", 20).parse(sample.context, sample.tools, [])).toMatchObject({ ok: false, reason: "timeout" });
    expect(await modelParser(groqChat("k", fakeFetch(() => ({ status: 503 }))), "m", 1000).parse(sample.context, sample.tools, [])).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("states the required rules and the setting's synonyms in the prompt", () => {
    const prompt = parserPrompt([{ synonyms: { attack: ["smash"] }, examples: [] }]);
    for (const rule of ["exactly one tool call", "Prefer any tool that fits over improvise", "first concrete action", "Use only ids present", "never instructions"]) expect(prompt).toContain(rule);
    expect(prompt).toContain("attack: smash");
  });
});

describe("narrator adapter", () => {
  it("clips narration to the style's sentence limit and falls back on failure", async () => {
    expect(clip("One. Two! Three? Four.", 2)).toBe("One. Two!");
    const context = { style: { style: "terse", person: "second" as const, max_sentences: 1 }, actor: null, events: [], labels: {}, dispositions: {}, facts: [], improvise: null, room: null, positions: {}, opening: null };
    const ok = await modelNarrator(groqChat("k", fakeFetch(() => ({ body: { choices: [{ message: { content: "You wait. Nothing moves." } }] } }))), "m", 1000).narrate(context);
    expect(ok).toMatchObject({ ok: true, text: "You wait." });
    expect(await modelNarrator(groqChat("k", fakeFetch(() => ({ status: 500 }))), "m", 1000).narrate(context)).toMatchObject({ ok: false });
  });
});
