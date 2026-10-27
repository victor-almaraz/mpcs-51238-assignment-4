// Parsed input and narration (sprint 15): one tool call per input, one retry, the improvise fallback,
// model narration with template fallback, action menus, and play continuing without models.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryBroadcaster } from "../broadcast";
import type { Narrator } from "../narrator/adapter";
import { functionParser, type Parser } from "../parser/adapter";
import type { ParserContext } from "../parser/context";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCharacter } from "./characters";
import { createCampaign } from "./campaigns";
import type { Entropy } from "./entropy";
import { addCharacter, createInstance, getHistory, inputWithOutcome, pauseInstance, startInstance, submitInput, type Deps } from "./instances";
import { code, entropy, SIX, SUNKEN, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let broadcast: MemoryBroadcaster;
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps, broadcast } = await world(["user_a"]));
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

async function solo() {
  const campaign = await createCampaign(store, "user_a", { title: "Solo", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
  const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Solo" }, e);
  const vale = await createCharacter(store, "user_a", { system: "quest", name: "Vale", choices: { role: "fighter", abilities: SIX } }, e);
  await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: vale.id });
  await startInstance(deps, "user_a", instance.id);
  return { instance, vale };
}

let seen: ParserContext[];
function scripted(...answers: ({ tool: string; args: Record<string, unknown> } | null)[]): Parser {
  seen = [];
  let n = 0;
  return functionParser((context) => {
    seen.push(context);
    return answers[Math.min(n++, answers.length - 1)] ?? null;
  });
}

const say = (instanceId: string, text: string, key: string) => submitInput(deps, "user_a", { instance_id: instanceId, text, idempotency_key: key }, e);

async function inputRow(id: string) {
  return (await db.query<{ outcome: string; parser_context: unknown; tool_calls: unknown[]; character_id: string }>("select outcome, parser_context, tool_calls, character_id from input_logs where id = $1", [id])).rows[0]!;
}

describe("submit_input", () => {
  it("commits the parsed call and records the parser context and exchange", async () => {
    deps.parser = scripted({ tool: "move", args: { to_id: "hangar" } });
    const { instance, vale } = await solo();
    const r = await say(instance.id, "head into the hangar", "text-move-0001");
    expect(r.accepted).toBe(true);
    const row = await inputRow(r.input_id);
    expect(row).toMatchObject({ outcome: "committed", character_id: vale.id });
    expect(row.tool_calls).toHaveLength(1);
    const context = seen[0]!;
    expect(context).toMatchObject({ input: "head into the hangar", character: { id: vale.id, name: "Vale" }, round: { can_act: true } });
    expect(context.destinations.map((d) => d.id)).toContain("hangar");
    // No coordinates, flags, or stages reach the parser.
    const text = JSON.stringify(context);
    expect(text).not.toMatch(/"at"|"footprint"|"flags"|"stages"|"lock"/);
    expect((await store.instanceView(instance.id))!.version).toBe(2);
  });

  it("retries once with the engine's error, then commits the corrected call", async () => {
    deps.parser = scripted({ tool: "move", args: { to_id: "nowhere" } }, { tool: "move", args: { to_id: "hangar" } });
    const { instance } = await solo();
    const r = await say(instance.id, "go to the hangar", "text-retry-0001");
    expect(seen).toHaveLength(2);
    expect(seen[1]!.error).toMatchObject({ code: "unknown_id" });
    expect((await inputRow(r.input_id)).outcome).toBe("committed");
  });

  it("falls back to improvise with a valid suggestion when both attempts fail", async () => {
    deps.parser = scripted({ tool: "move", args: { to_id: "nowhere" } });
    const { instance } = await solo();
    const r = await say(instance.id, "fly to the moon", "text-fail-00001");
    expect(seen).toHaveLength(2);
    expect((await inputRow(r.input_id)).outcome).toBe("fallback");
    const commit = broadcast.on(`instance:${instance.id}`).filter((m) => m.type === "commit").at(-1)!;
    const improvised = (commit.events as { type: string; category?: string; suggestions?: unknown[] }[]).find((x) => x.type === "improvised")!;
    expect(improvised.category).toBe("unclear");
    expect(improvised.suggestions).toHaveLength(1);
    const history = await getHistory(store, "user_a", { instance_id: instance.id, after_version: 1 });
    expect(history.items[0]!.narration!.text).toMatch(/^Vale hesitates\. Perhaps /);
  });

  it("does not retry an unavailable parser, and keeps play going", async () => {
    deps.parser = scripted(null);
    const { instance } = await solo();
    const r = await say(instance.id, "look around", "text-down-00001");
    expect(seen).toHaveLength(1);
    expect((await inputRow(r.input_id)).outcome).toBe("fallback");
  });

  it("keeps only valid suggestions of a parsed improvise", async () => {
    deps.parser = scripted({ tool: "improvise", args: { category: "flavor", intent: "wave", suggestions: [{ tool: "move", args: { to_id: "nowhere" } }, { tool: "wait", args: {} }] } });
    const { instance } = await solo();
    await say(instance.id, "I wave at nobody", "text-flavor-001");
    const commit = broadcast.on(`instance:${instance.id}`).filter((m) => m.type === "commit").at(-1)!;
    const improvised = (commit.events as { type: string; suggestions?: { tool: string }[] }[]).find((x) => x.type === "improvised")!;
    expect(improvised.suggestions!.map((s) => s.tool)).toEqual(["wait"]);
  });

  it("sends an action menu once the improvise streak reaches 4", async () => {
    deps.parser = scripted({ tool: "improvise", args: { category: "unclear", intent: "?", suggestions: [] } });
    const { instance } = await solo();
    for (let n = 1; n <= 4; n++) await say(instance.id, "hmm", `text-streak-00${n}`);
    const menus = broadcast.on("user:user_a").filter((m) => m.type === "action_menu");
    expect(menus).toHaveLength(1);
    expect((menus[0]!.options as unknown[]).length).toBeGreaterThan(0);
  });

  it("refuses a second input while one is in processing, and text input without a parser", async () => {
    deps.parser = scripted({ tool: "wait", args: {} });
    const { instance, vale } = await solo();
    await db.query("insert into input_logs (id, instance_id, user_id, idempotency_key, text, character_id) values ('in_busy', $1, 'user_a', 'busy-key-0001', 'x', $2)", [instance.id, vale.id]);
    expect(await code(say(instance.id, "wait", "text-busy-00001"))).toBe("rate_limited");
    deps.parser = undefined;
    expect(await code(say(instance.id, "wait", "text-none-00001"))).toBe("unavailable");
  });

  it("reports an input that did not commit as a sentence, on the user channel and to the play page", async () => {
    // The author pauses the game while the parser works, so the parsed call finds the game stopped.
    let instanceId = "";
    deps.parser = {
      async parse() {
        await pauseInstance(deps, "user_a", instanceId);
        return { ok: true, call: { tool: "wait", args: {} }, raw: null, ms: 0 };
      },
    };
    const { instance } = await solo();
    instanceId = instance.id;
    const r = await inputWithOutcome(deps, "user_a", { instance_id: instance.id, text: "wait", idempotency_key: "text-paused-0001" }, e);
    expect(r.rejected).toBe("The game is not running.");
    expect(broadcast.on("user:user_a").at(-1)).toMatchObject({ type: "input_rejected", input_id: r.input_id, reason: "conflict", detail: "The game is not running." });
    expect((await inputRow(r.input_id)).outcome).toBe("rejected");
  });
});

describe("narration", () => {
  it("opens the game with the scene and the party, from the premise when the adventure has no opening text", async () => {
    const { instance } = await solo();
    const [opening] = (await getHistory(store, "user_a", { instance_id: instance.id, after_version: 0 })).items;
    expect(opening!.narration).toMatchObject({ source: "template" });
    expect(opening!.narration!.text).toMatch(/^[^.!?]+[.!?] Vale is in the .+\.$/);
  });

  it("gives the model narrator the opening, with two more sentences to set the scene", async () => {
    const calls: { opening: unknown; style: { max_sentences: number }; actor: unknown }[] = [];
    deps.narrator = {
      async narrate(context) {
        calls.push(context as never);
        return { ok: true, text: "Fog lies on the dock. Vale waits by the hatch.", raw: null, ms: 1 };
      },
    };
    const { instance } = await solo();
    expect(calls[0]).toMatchObject({ opening: { party: ["Vale"], text: null }, actor: null });
    expect((calls[0]!.opening as { title: string }).title).toBeTruthy();
    const [opening] = (await getHistory(store, "user_a", { instance_id: instance.id, after_version: 0 })).items;
    expect(opening!.narration).toMatchObject({ source: "model", text: "Fog lies on the dock. Vale waits by the hatch." });
    deps.parser = scripted({ tool: "wait", args: {} });
    await say(instance.id, "wait", "text-open-00001");
    expect(calls[1]!.opening).toBeNull();
    expect(calls[1]!.style.max_sentences).toBe(calls[0]!.style.max_sentences - 2);
  });

  it("uses the model narrator when it answers, and template text when it fails", async () => {
    const calls: unknown[] = [];
    let fail = false;
    const narrator: Narrator = {
      async narrate(context) {
        calls.push(context);
        return fail ? { ok: false, reason: "timeout", ms: 1 } : { ok: true, text: "You step into the vast, flooded hangar.", raw: null, ms: 1 };
      },
    };
    deps.narrator = narrator;
    deps.parser = scripted({ tool: "move", args: { to_id: "hangar" } });
    const { instance } = await solo();
    await say(instance.id, "go to the hangar", "text-narr-00001");
    fail = true;
    deps.parser = scripted({ tool: "wait", args: {} });
    await say(instance.id, "wait", "text-narr-00002");
    const items = (await getHistory(store, "user_a", { instance_id: instance.id, after_version: 1 })).items;
    expect(items.map((i) => i.narration?.source)).toEqual(["model", "template"]);
    expect(items[1]!.narration!.text).toBe("Vale waits.");
    // The first call opens the game; the second narrates the move.
    const context = calls[1] as { style: { person: string }; actor: { name: string }; labels: Record<string, string> };
    expect(context).toMatchObject({ style: { person: "second" }, actor: { name: "Vale" } });
    expect(JSON.stringify(context)).not.toMatch(/"at"|"flags"|"stages"/);
  });
});
