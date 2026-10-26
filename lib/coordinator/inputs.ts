// Parsed input (architecture.md, Action pipeline; tools.md, Retry): parser context, one tool call, one
// retry with the engine's error, and `improvise` with category `unclear` as the fallback. The parser
// runs once against the state read; the call is then validated again on the write path.

import { speedOf, submit, toolsFor, view, type Bundles, type EngineError, type State } from "../engine";
import { parserContext, toolDefinitions, type ParserContext } from "../parser/context";
import type { ParseResult } from "../parser/adapter";
import { pinnedBundles } from "./admin";
import { CoordinatorError, catchUp, commit, load, requireStatus, rngFor, serialized, type Deps } from "./instance";
import { menuOptions, valid } from "./menus";
import { rejectionText } from "./rejections";

type Call = { tool: string; args: Record<string, unknown> };

/** Engine errors after which the parser gets one more try with the error appended. */
const RETRYABLE = new Set(["invalid_call", "unknown_id", "not_reachable", "requirement_unmet"]);

/** `improvise` with category `unclear` and a valid suggestion, for inputs the parser could not turn into a valid call. */
function fallbackCall(state: State, bundles: Bundles, actor: string, text: string, error: EngineError | null): Call {
  const preferred = error?.code === "not_your_turn" ? ["examine"] : ["move", "examine", "interact", "take", "wait"];
  const options = menuOptions(state, bundles, actor, 12);
  const suggestion = options.find((o) => preferred.includes(o.tool)) ?? options[0];
  return { tool: "improvise", args: { category: "unclear", intent: text.slice(0, 120), suggestions: suggestion ? [{ tool: suggestion.tool, args: suggestion.args }] : [] } };
}

/** Keeps only the suggestions of an `improvise` call that the engine would accept now. */
function checkedSuggestions(state: State, bundles: Bundles, actor: string, call: Call): Call {
  const suggestions = Array.isArray(call.args.suggestions) ? (call.args.suggestions as Call[]) : [];
  const ok = suggestions.filter((s) => s && typeof s.tool === "string" && s.tool !== "improvise" && s.args && typeof s.args === "object" && valid(state, bundles, actor, s)).slice(0, 2);
  return { tool: "improvise", args: { ...call.args, suggestions: ok } };
}

function exchange(attempt: number, r: ParseResult) {
  return r.ok ? { attempt, ms: r.ms, call: r.call, response: r.raw } : { attempt, ms: r.ms, failure: r.reason, detail: r.detail, response: r.raw };
}

async function recentNarration(deps: Deps, instanceId: string, version: number): Promise<string[]> {
  const items = await deps.store.history(instanceId, Math.max(0, version - 10), 10);
  return items.flatMap((i) => (i.narration ? [i.narration.text] : []));
}

/** Parses and commits one text input; the input log records the context, the exchanges, and the outcome. */
export async function processInput(deps: Deps, instanceId: string, actor: string, text: string, inputLog: string): Promise<{ version: number; outcome: "committed" | "fallback" }> {
  const parser = deps.parser;
  if (!parser) throw new CoordinatorError("conflict", "text input is not available");
  await catchUp(deps, instanceId);
  const instance = await load(deps, instanceId);
  requireStatus(instance, ["active"], "act in");
  const bundles = await pinnedBundles(deps.store, instance);
  const state = instance.state!;
  const trial = (call: Call) => submit(state, bundles, actor, call, rngFor(instance, state));

  const { tools, can_act } = toolsFor(state, bundles, actor);
  const context: ParserContext = parserContext(view(state, bundles, actor), {
    conditions: state.characters[actor]!.conditions.map((c) => c.id),
    speed: speedOf(state, bundles, actor),
    can_act,
    declared: state.round.declarations[actor] ?? null,
    recent: await recentNarration(deps, instanceId, instance.version),
    input: text,
  });
  const definitions = toolDefinitions(context, tools);
  const hints = bundles.settings.map((s) => s.parser);
  const exchanges: unknown[] = [];

  let call: Call | null = null;
  let error: EngineError | null = null;
  for (let attempt = 1; attempt <= 2 && !call; attempt++) {
    const r = await parser.parse(attempt === 1 ? context : { ...context, error: error! }, definitions, hints);
    exchanges.push(exchange(attempt, r));
    if (!r.ok) {
      // A timeout or an unavailable model is not retried; zero or several calls count as invalid_call.
      if (r.reason !== "invalid_call") break;
      error = { code: "invalid_call", detail: r.detail };
    } else {
      const t = trial(r.call);
      if (t.ok) call = r.call;
      else error = t.error;
    }
    if (!call && (!error || !RETRYABLE.has(error.code))) break;
  }
  let outcome: "committed" | "fallback" = call ? "committed" : "fallback";
  call = call ? (call.tool === "improvise" ? checkedSuggestions(state, bundles, actor, call) : call) : fallbackCall(state, bundles, actor, text, error);
  await deps.store.recordParse(inputLog, context, exchanges);

  return serialized(deps, instanceId, async (fresh) => {
    requireStatus(fresh, ["active"], "act in");
    let used = call!;
    let result = submit(fresh.state!, bundles, actor, used, rngFor(fresh, fresh.state!));
    if (!result.ok) {
      // Another commit changed the state since parsing.
      used = fallbackCall(fresh.state!, bundles, actor, text, result.error);
      outcome = "fallback";
      result = submit(fresh.state!, bundles, actor, used, rngFor(fresh, fresh.state!));
    }
    if (!result.ok) throw new CoordinatorError("conflict", rejectionText(fresh.state!, bundles, result.error), result.error.code);
    const c = await commit(deps, fresh, bundles, result, { call: { actor, tool: used.tool, args: used.args } }, { actor, inputLog, outcome });
    return { version: c.version, outcome };
  });
}
