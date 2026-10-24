// Agent-driven runs (SPRINTS.md, sprint 24): a player model writes free text, the Parser Adapter turns
// it into one tool call, and the engine resolves it, until the instance ends. The same retry and
// fallback rules as the Coordinator's text input apply (tools.md, Retry). Runs on a harness session,
// so the log replays like a golden one.

import { speedOf, submit, toolsFor, view, type Bundles, type EngineError, type GameEvent, type State } from "../engine";
import { begin, step, type Session } from "../harness/harness";
import { menuOptions } from "../coordinator/menus";
import { ModelError, type Chat } from "../models/groq";
import type { Parser } from "../parser/adapter";
import { parserContext, toolDefinitions, type ParserContext } from "../parser/context";
import { Rng, type U64 } from "../rng";
import type { JoiningCharacter } from "../engine";

type Call = { tool: string; args: Record<string, unknown> };

/** Writes the player's next input from a description of the situation. */
export type Player = (prompt: string) => Promise<string>;

export interface Turn {
  turn: number;
  input: string;
  call: Call | null;
  outcome: "committed" | "fallback" | "rejected";
  error?: string;
  facts: string[];
}

export interface RunResult {
  session: Session;
  ending: string | null;
  turns: Turn[];
  /** Turns whose input became the `improvise` fallback. */
  fallbacks: number;
}

const RETRYABLE = new Set(["invalid_call", "unknown_id", "not_reachable", "requirement_unmet"]);
const ACTOR = "c_1";

/** Trigger narrations by trigger id: the facts a player would read in narration. */
function narrations(bundles: Bundles): Map<string, string> {
  return new Map(bundles.adventure.arcs.flatMap((a) => a.triggers.flatMap((t) => (t.narrate ? [[t.id, t.narrate] as const] : []))));
}

function factsOf(events: readonly GameEvent[], said: Map<string, string>, topicBrief: (npc: string, topic: string) => string | undefined, secret: (ref: string) => string | undefined): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.type === "trigger_fired") {
      const t = said.get(e.trigger as string);
      if (t) out.push(t);
    } else if (e.type === "talked" && e.actor === ACTOR && typeof e.topic === "string") {
      const b = topicBrief(e.npc as string, e.topic);
      if (b) out.push(b);
    } else if (e.type === "revealed" && typeof e.secret === "string") {
      const t = secret(e.secret);
      if (t) out.push(t);
    }
    else if (e.type === "damaged" && e.target === ACTOR) out.push(`You take ${e.amount} harm; ${e.remaining} hit points remain.`);
    else if (e.type === "died") out.push(`${e.target} is defeated.`);
    else if (e.type === "combat_started") out.push("Combat starts.");
    else if (e.type === "combat_ended") out.push("Combat ends.");
  }
  return out;
}

/** The situation as plain text for the player model. Ids appear only as the parser sees them. */
export function describe(c: ParserContext, goal: string, guide: string, history: readonly Turn[], hp: unknown): string {
  const list = (xs: string[]) => (xs.length ? xs.join("; ") : "nothing");
  const lines = [
    `You are playing a text adventure. Your goal: ${goal}`,
    `A guide to the route:\n${guide}`,
    "",
    `Mode: ${c.mode}${c.round.can_act ? "" : " (you cannot act until the round closes)"}.`,
    `Room: ${c.room?.label ?? "none"} (${c.room?.light ?? "?"} light). You: ${c.character.name}, ${JSON.stringify(hp)}, conditions: ${list(c.character.conditions)}.`,
    `You see: ${list(c.visible.map((v) => `${v.label} (${v.kind}, ${v.distance} away${v.in_reach ? ", in reach" : ""}${v.verbs ? `, can ${v.verbs.join("/")}` : ""}${v.contents?.length ? `, holding ${v.contents.map((i) => i.label).join(", ")}` : ""})`))}.`,
    `Ways to go: ${list(c.destinations.map((d) => `${d.label} (${d.kind}, ${d.distance} away)`))}.`,
    `People here: ${list(c.npcs.map((n) => `${n.name} (topics: ${n.topics.map((t) => t.label).join(", ") || "none"})`))}.`,
    `You carry: ${list(c.inventory.map((i) => i.label))}.`,
    ...(c.pending_choice ? [`You must choose: ${c.pending_choice.prompt} Options: ${c.pending_choice.options.map((o) => o.label).join("; ")}.`] : []),
    "",
    "Your recent inputs and what happened:",
    ...history.slice(-8).map((t) => `> ${t.input}\n  ${t.outcome === "committed" ? (t.facts.join(" ") || "(done)") : `(${t.outcome}${t.error ? `: ${t.error}` : ""})`}`),
    "",
    "Write the player's next input: one short sentence naming one concrete action, in plain words, using the names above. Reply with the sentence only.",
  ];
  return lines.join("\n");
}

export interface RunOptions {
  bundles: Bundles;
  seed: U64;
  characters: JoiningCharacter[];
  player: Player;
  parser: Parser;
  goal: string;
  guide: string;
  maxTurns: number;
  onTurn?: (t: Turn) => void;
}

/** Plays one character with the player model until the instance ends or `maxTurns` inputs. */
export async function agentRun(o: RunOptions): Promise<RunResult> {
  const session = begin(o.bundles, o.seed, o.characters);
  const said = narrations(o.bundles);
  const brief = (npc: string, topic: string) => o.bundles.adventure.npcs[npc]?.topics?.[topic]?.brief;
  const secret = (ref: string) => {
    const [npc, id] = ref.split(".");
    return o.bundles.adventure.npcs[npc!]?.secrets?.[id!];
  };
  const hints = o.bundles.settings.map((s) => s.parser);
  const turns: Turn[] = [];
  let fallbacks = 0;
  const recent: string[] = [];

  for (let n = 1; n <= o.maxTurns && !session.state.ended; n++) {
    const state: State = session.state;
    const { tools, can_act } = toolsFor(state, o.bundles, ACTOR);
    if (!can_act) {
      step(session, { advance: true });
      continue;
    }
    const v = view(state, o.bundles, ACTOR);
    const base = parserContext(v, { conditions: state.characters[ACTOR]!.conditions.map((c) => c.id), speed: speedOf(state, o.bundles, ACTOR), can_act, declared: state.round.declarations[ACTOR] ?? null, recent: recent.slice(-3), input: "" });
    const input = (await o.player(describe(base, o.goal, o.guide, turns, (v.character.sheet as { hp?: unknown }).hp))).trim().split("\n")[0]!.slice(0, 300);
    const context = { ...base, input };
    const definitions = toolDefinitions(context, tools);
    const trial = (call: Call) => submit(state, o.bundles, ACTOR, call, new Rng(session.seed, state.rng_counter));

    let call: Call | null = null;
    let error: EngineError | null = null;
    let failure: string | undefined;
    for (let attempt = 1; attempt <= 2 && !call; attempt++) {
      const r = await o.parser.parse(attempt === 1 ? context : { ...context, error: error! }, definitions, hints);
      if (!r.ok) {
        if (r.reason !== "invalid_call") {
          failure = `parser ${r.reason}: ${r.detail}`;
          break;
        }
        error = { code: "invalid_call", detail: r.detail };
      } else {
        const t = trial(r.call);
        if (t.ok) call = r.call;
        else error = t.error;
      }
      if (!call && (!error || !RETRYABLE.has(error.code))) break;
    }
    let outcome: Turn["outcome"] = "committed";
    if (!call) {
      // The Coordinator's fallback: improvise `unclear`, with a valid suggestion.
      const suggestion = menuOptions(state, o.bundles, ACTOR, 12).find((m) => ["move", "examine", "interact", "take", "wait"].includes(m.tool));
      call = { tool: "improvise", args: { category: "unclear", intent: input.slice(0, 120), suggestions: suggestion ? [{ tool: suggestion.tool, args: suggestion.args }] : [] } };
      outcome = "fallback";
      fallbacks++;
    }
    const out = step(session, { actor: ACTOR, tool: call.tool, args: call.args }) as { events?: GameEvent[]; error?: EngineError };
    const events = [...(out.events ?? [])];
    // A single character closes the round it declared in.
    if (out.events && session.state.round.declarations?.[ACTOR] && !session.state.ended) events.push(...(((step(session, { advance: true }) as { events?: GameEvent[] }).events) ?? []));
    const facts = factsOf(events, said, brief, secret);
    recent.push(...facts);
    const turn: Turn = { turn: n, input, call, outcome: out.error ? "rejected" : outcome, ...(out.error ? { error: out.error.detail } : outcome === "fallback" && (error || failure) ? { error: error?.detail ?? failure } : {}), facts };
    turns.push(turn);
    o.onTurn?.(turn);
  }
  return { session, ending: session.state.ended?.ending ?? null, turns, fallbacks };
}

/** A player model over chat completions. */
export function chatPlayer(chat: Chat, model: string, timeoutMs = 20000): Player {
  return async (prompt) => {
    const r = await chat({ model, messages: [{ role: "user", content: prompt }], temperature: 0.4, max_tokens: 60 }, timeoutMs);
    return r.content ?? "look around";
  };
}

/**
 * Retries a model call that may recover (a timeout, a rate limit, or a server error) with doubling
 * waits, reporting each wait. Other errors, such as an unknown model or a rejected key, fail at once.
 */
export function patient(
  chat: Chat,
  waits: readonly number[] = [4000, 8000, 16000, 32000, 60000],
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  onRetry: (error: ModelError, waitMs: number) => void = () => {},
): Chat {
  const recoverable = (e: ModelError) => e.kind === "timeout" || e.status === undefined || e.status === 429 || e.status >= 500;
  return async (request, timeoutMs) => {
    for (let i = 0; ; i++) {
      try {
        return await chat(request, timeoutMs);
      } catch (e) {
        if (!(e instanceof ModelError) || e.kind === "malformed" || !recoverable(e) || i >= waits.length) throw e;
        onRetry(e, waits[i]!);
        await sleep(waits[i]!);
      }
    }
  };
}
