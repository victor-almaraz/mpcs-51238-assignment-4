// Replay (architecture.md, "Determinism and replay"; engine.md, `state_restored`): rebuilds state by
// re-running each commit's input from the start, checking every commit's events.

import { Rng, type U64 } from "../rng";
import { compareText } from "../systems";
import { advance, join, leave, sessionEnd, startInstance, submit } from "./index";
import type { Bundles, GameEvent, JoiningCharacter, Result, State } from "./types";

/** What produced a commit. */
export type CommitInput =
  | { start: { seed: string; characters: JoiningCharacter[] } }
  | { call: { actor: string; tool: string; args: Record<string, unknown> } }
  | { advance: true }
  | { join: { character: JoiningCharacter } }
  | { leave: { character_id: string } }
  | { session_end: { session_id: string; occurrence_start: string } }
  | { restore: { to_version: number; reason: string } };

export interface Commit {
  version: number;
  input: CommitInput;
  events: GameEvent[];
}

/** JSON with object keys sorted at every level, so values read back from a store compare equal. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => compareText(a, b))) : v,
  );
}

export interface Replayed {
  state: State;
  version: number;
}

/**
 * Applies one input to `state`, the state at `version`. A restore's state comes from `restored`, which
 * replays the commits up to the target version.
 */
export function applyInput(bundles: Bundles, state: State | undefined, version: number, input: CommitInput, seed: U64, restored: (toVersion: number) => State | undefined): Result {
  if ("start" in input) return startInstance({ bundles, characters: input.start.characters, seed: BigInt(input.start.seed) });
  if (!state) return { ok: false, error: { code: "instance_not_active", detail: `no state at version ${version}` } };
  if ("restore" in input) {
    const target = input.restore.to_version < version ? restored(input.restore.to_version) : undefined;
    if (!target) return { ok: false, error: { code: "invalid_call", detail: `cannot restore version ${input.restore.to_version} at version ${version}` } };
    const event: GameEvent = { type: "state_restored", from_version: version, to_version: input.restore.to_version, reason: input.restore.reason };
    return { ok: true, events: [event], state: target };
  }
  const rng = new Rng(seed, state.rng_counter);
  if ("advance" in input) return advance(state, bundles, rng);
  if ("join" in input) return join(state, bundles, input.join.character, rng);
  if ("leave" in input) return leave(state, bundles, input.leave.character_id, rng);
  if ("session_end" in input) return sessionEnd(state, bundles, rng);
  return submit(state, bundles, input.call.actor, { tool: input.call.tool, args: input.call.args }, rng);
}

/**
 * Replays commits in version order, from the start commit at version 1, up to `toVersion`. Fails at the
 * first commit whose input is not committed at its version, or whose events differ from the record.
 * A `state_restored` commit replaces the state with the state replayed up to its `to_version`.
 */
export function replay(bundles: Bundles, commits: readonly Commit[], toVersion = Infinity): ({ ok: true } & Replayed) | { ok: false; version: number; reason: string } {
  const first = commits[0];
  if (!first || !("start" in first.input) || first.version !== 1) return { ok: false, version: 1, reason: "the commits do not begin with a start at version 1" };
  const seed = BigInt(first.input.start.seed);
  let state: State | undefined;
  let version = 0;
  for (const commit of commits) {
    if (commit.version > toVersion) break;
    if (commit.version !== version + 1) return { ok: false, version: commit.version, reason: `expected version ${version + 1}` };
    const restored = (to: number) => {
      const prefix = replay(bundles, commits, to);
      return prefix.ok ? prefix.state : undefined;
    };
    const r = applyInput(bundles, state, version, commit.input, seed, restored);
    if (!r.ok) return { ok: false, version: commit.version, reason: `the input was rejected: ${r.error.code}: ${r.error.detail}` };
    if (canonical(r.events) !== canonical(commit.events)) return { ok: false, version: commit.version, reason: "events differ" };
    version = commit.version;
    state = r.state;
  }
  return { ok: true, state: state!, version };
}
