// The agent-driven run loop, with a scripted parser and player in place of the models.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { replay } from "../engine";
import { commitOf } from "../harness/harness";
import { SCENARIOS } from "../harness/scenarios";
import { ModelError, type Chat } from "../models/groq";
import { functionParser } from "../parser/adapter";
import { GOALS } from "./goals";
import { agentRun, patient } from "./run";

const golden = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../harness/golden/${name}.input.jsonl`, import.meta.url)), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as { tool?: string; args?: Record<string, unknown> })
    .filter((l) => l.tool);

describe("agent-driven runs", () => {
  it("plays to the ending through the parser and replays", async () => {
    const goal = GOALS.find((g) => g.ending === "lost")!;
    const scenario = SCENARIOS.find((s) => s.name === goal.scenario)!;
    const calls = golden(goal.scenario);
    let i = 0;
    const prompts: string[] = [];
    const parser = functionParser((context) => {
      expect(context.input).toBe(`input ${prompts.length}`);
      return i < calls.length ? { tool: calls[i]!.tool!, args: calls[i++]!.args! } : { tool: "wait", args: {} };
    });
    const r = await agentRun({ bundles: scenario.bundles(), seed: scenario.seed, characters: scenario.characters(), parser, player: async (p) => (prompts.push(p), `input ${prompts.length}`), goal: goal.goal, guide: goal.guide, maxTurns: goal.maxTurns });
    expect(r.ending).toBe("lost");
    expect(r.fallbacks).toBe(0);
    expect(prompts[0]).toContain("Your goal: play recklessly");
    expect(prompts[0]).toContain("Orvelle plaza");
    expect(r.turns.some((t) => t.facts.some((f) => f.includes("Gull Company privateers")))).toBe(true);
    expect(replay(scenario.bundles(), r.session.log.map(commitOf)).ok).toBe(true);
  });

  it("falls back to improvise when the parser's call is rejected twice", async () => {
    const goal = GOALS.find((g) => g.ending === "lost")!;
    const scenario = SCENARIOS.find((s) => s.name === goal.scenario)!;
    let asked = 0;
    const parser = functionParser(() => (asked++, { tool: "take", args: { entity_id: "nothing_here" } }));
    const r = await agentRun({ bundles: scenario.bundles(), seed: scenario.seed, characters: scenario.characters(), parser, player: async () => "grab the moon", goal: goal.goal, guide: goal.guide, maxTurns: 1 });
    expect(asked).toBe(2);
    expect(r.turns[0]).toMatchObject({ outcome: "fallback", call: { tool: "improvise" } });
  });

  it("waits out an unavailable model, then gives up", async () => {
    let n = 0;
    const flaky: Chat = async () => {
      if (n++ < 2) throw new ModelError("unavailable", "Groq answered HTTP 429", 429);
      return { content: "ok", tool_calls: [], raw: null };
    };
    const slept: number[] = [];
    const chat = patient(flaky, [1, 2, 3], async (ms) => void slept.push(ms));
    expect((await chat({ model: "m", messages: [] }, 10)).content).toBe("ok");
    expect(slept).toEqual([1, 2]);
    const down = patient(async () => Promise.reject(new ModelError("unavailable", "down")), [1], async () => {});
    await expect(down({ model: "m", messages: [] }, 10)).rejects.toThrow("down");
    // A rate limit waits as long as Groq asks.
    let limited = 0;
    const waited: number[] = [];
    const throttled = patient(async () => {
      if (limited++ < 2) throw new ModelError("unavailable", "Groq answered HTTP 429", 429, 5600);
      return { content: "ok", tool_calls: [], raw: null };
    }, [1], async (ms) => void waited.push(ms));
    expect((await throttled({ model: "m", messages: [] }, 10)).content).toBe("ok");
    expect(waited).toEqual([5850, 5850]);
    let tries = 0;
    const rejected = patient(async () => (tries++, Promise.reject(new ModelError("unavailable", "Groq answered HTTP 400: model not found", 400))), [1, 2], async () => {});
    await expect(rejected({ model: "m", messages: [] }, 10)).rejects.toThrow("HTTP 400");
    expect(tries).toBe(1);
  });
});

describe("groqChat errors", () => {
  it("carries Groq's requested wait on a rate limit", async () => {
    const { groqChat } = await import("../models/groq");
    const body = JSON.stringify({ error: { message: "Rate limit reached. Please try again in 5.6325s." } });
    const fetcher = (async () => new Response(body, { status: 429 })) as unknown as typeof fetch;
    const error = await groqChat("k", fetcher)({ model: "m", messages: [] }, 1000).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, retryAfterMs: 5633 });
    const header = (async () => new Response("{}", { status: 429, headers: { "retry-after": "3" } })) as unknown as typeof fetch;
    expect(await groqChat("k", header)({ model: "m", messages: [] }, 1000).catch((e: unknown) => e)).toMatchObject({ retryAfterMs: 3000 });
  });
});

describe("groqModels", () => {
  it("lists the model ids, sorted", async () => {
    const { groqModels } = await import("../models/groq");
    const fetcher = (async () => new Response(JSON.stringify({ data: [{ id: "b-model" }, { id: "a-model" }] }))) as unknown as typeof fetch;
    expect(await groqModels("k", fetcher)).toEqual(["a-model", "b-model"]);
  });
});

describe("tunedForReasoning", () => {
  it("asks GPT-OSS for low effort with room to reason, Qwen for no reasoning, and leaves other models alone", async () => {
    const { tunedForReasoning } = await import("../models/groq");
    const seen: unknown[] = [];
    const chat = tunedForReasoning(async (r) => (seen.push(r), { content: "", tool_calls: [], raw: null }));
    await chat({ model: "openai/gpt-oss-20b", messages: [], max_tokens: 300 }, 10);
    await chat({ model: "qwen/qwen3.8-27b", messages: [], max_tokens: 300 }, 10);
    await chat({ model: "other/model", messages: [], max_tokens: 300 }, 10);
    expect(seen).toEqual([
      { model: "openai/gpt-oss-20b", messages: [], max_tokens: 512, reasoning_effort: "low" },
      { model: "qwen/qwen3.8-27b", messages: [], max_tokens: 300, reasoning_effort: "none" },
      { model: "other/model", messages: [], max_tokens: 300 },
    ]);
  });
});
