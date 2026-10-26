// The command-line harness core (engine-implementation.md, "Command-line harness"): drives the engine
// from JSON lines with no network, store, or model. Pure; the command line in cli.ts does the I/O.

import { advance, replay as replayCommits, startInstance, submit, view, type Bundles, type Commit, type GameEvent, type JoiningCharacter, type State } from "../engine";
import { Rng, type U64 } from "../rng";

/** One input line: a tool call, an advance, or a view request. */
export type Input = { actor: string; tool: string; args: Record<string, unknown> } | { advance: true } | { view: string };

// SPEC_ISSUES.md#replay-source: the log records each commit's input, so replay re-runs inputs and
// compares events and state; the event payloads alone cannot rebuild state.
/** One log line: the start commit, or the commit an input produced. */
export type LogLine =
  | { version: number; start: { seed: string; characters: JoiningCharacter[] }; events: GameEvent[] }
  | { version: number; input: Input; events: GameEvent[] };

export class HarnessError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`line ${line}: ${message}`);
  }
}

/** Parses and checks one input line; throws HarnessError for anything that is not an input form. */
export function parseInput(text: string, line: number): Input {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HarnessError(line, "not valid JSON");
  }
  const v = value as Record<string, unknown>;
  const keys = typeof v === "object" && v !== null && !Array.isArray(v) ? Object.keys(v).sort().join(",") : "";
  if (keys === "advance" && v.advance === true) return { advance: true };
  if (keys === "view" && typeof v.view === "string") return { view: v.view };
  if (keys === "actor,args,tool" && typeof v.actor === "string" && typeof v.tool === "string" && typeof v.args === "object" && v.args !== null && !Array.isArray(v.args)) {
    return { actor: v.actor, tool: v.tool, args: v.args as Record<string, unknown> };
  }
  throw new HarnessError(line, "expected { actor, tool, args }, { advance: true }, or { view: ID }");
}

export interface Session {
  bundles: Bundles;
  seed: bigint;
  state: State;
  version: number;
  log: LogLine[];
}

/** Starts an instance; the start is version 1. */
export function begin(bundles: Bundles, seed: U64, characters: JoiningCharacter[]): Session {
  const big = BigInt(seed);
  const r = startInstance({ bundles, characters, seed: big });
  if (!r.ok) throw new Error(`instance start failed: ${r.error.code}: ${r.error.detail}`);
  return { bundles, seed: big, state: r.state, version: 1, log: [{ version: 1, start: { seed: big.toString(), characters }, events: r.events }] };
}

/** Applies one input; returns the output line. Engine rejections are data. */
export function step(session: Session, input: Input): Record<string, unknown> {
  if ("view" in input) {
    if (!session.state.characters[input.view]) return { error: { code: "unknown_id", detail: `'${input.view}' is not a character` } };
    return { view: view(session.state, session.bundles, input.view) };
  }
  const rng = new Rng(session.seed, session.state.rng_counter);
  const r = "advance" in input ? advance(session.state, session.bundles, rng) : submit(session.state, session.bundles, input.actor, { tool: input.tool, args: input.args }, rng);
  if (!r.ok) return { error: r.error };
  session.state = r.state;
  session.version += 1;
  session.log.push({ version: session.version, input, events: r.events });
  return { version: session.version, events: r.events };
}

/** Plays every line; returns the output lines. Throws HarnessError for a malformed line. */
export function play(session: Session, lines: readonly string[]): string[] {
  const out: string[] = [];
  lines.forEach((text, i) => {
    if (text.trim() === "") return;
    out.push(JSON.stringify(step(session, parseInput(text, i + 1))));
  });
  return out;
}

/** The engine commit an input line records. */
export function commitOf(line: LogLine): Commit {
  if ("start" in line) return { version: line.version, input: { start: line.start }, events: line.events };
  const input = line.input;
  if ("advance" in input) return { version: line.version, input: { advance: true }, events: line.events };
  if ("view" in input) throw new Error(`version ${line.version}: a view is not a commit`);
  return { version: line.version, input: { call: input }, events: line.events };
}

/** Rebuilds state from a log up to `toVersion`, re-running each input; reports the first version that differs. */
export function replay(bundles: Bundles, log: readonly LogLine[], toVersion = Infinity): ReturnType<typeof replayCommits> {
  let commits: Commit[];
  try {
    commits = log.map(commitOf);
  } catch (e) {
    return { ok: false, version: 0, reason: (e as Error).message };
  }
  return replayCommits(bundles, commits, toVersion);
}
