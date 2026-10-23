// The Instance Coordinator (architecture.md, Action pipeline, Concurrency, Round timeouts): one writer per
// instance through optimistic versioning, commits of engine results, round deadlines, and the messages
// each commit produces (api.md, Messages).

import { advance, join, leave, sessionEnd, sharedEvents, startInstance, submit, view, type Bundles, type CommitInput, type GameEvent, type JoiningCharacter, type Result, type State } from "../engine";
import { instanceTopic, userTopic, type Broadcaster, type Message } from "../broadcast";
import type { Narrator } from "../narrator/adapter";
import type { Parser } from "../parser/adapter";
import { narrate } from "./narration";
import { sendActionMenus } from "./menus";
import { Rng } from "../rng";
import { VersionConflict, type CharacterRecord, type InstanceRecord, type InstanceStatus, type Store } from "../store";
import { pinnedBundles } from "./admin";

export class CoordinatorError extends Error {
  constructor(
    readonly code: "not_found" | "conflict" | "invalid_request",
    message: string,
    readonly engineCode?: string,
  ) {
    super(message);
  }
}

export interface Timeouts {
  /** Seconds a round waits outside combat; 0 disables the timer. */
  exploration: number;
  /** Seconds a combat round or turn waits; 0 disables the timer. */
  combat: number;
}

export const DEFAULT_TIMEOUTS: Timeouts = { exploration: 120, combat: 60 };

export interface Deps {
  store: Store;
  broadcast: Broadcaster;
  now: () => Date;
  timeouts: Timeouts;
  /** The parser for submit_input; without one, text input is unavailable. */
  parser?: Parser;
  /** The model narrator; without one, or when it fails, narration is template text. */
  narrator?: Narrator;
  /** Runs work after the response, such as narration (Next.js `after`); without it, work runs inline. */
  defer?: (task: () => Promise<void>) => void;
  /** Sends `action_menu` to every character at each round and turn start (tools.md, improvise). */
  actionMenuMode?: boolean;
  /** Logs a failed broadcast; the commit stands and clients backfill. */
  warn?: (message: string) => void;
}

/** Attempts per write before giving up on repeated version conflicts. */
const ATTEMPTS = 8;

export async function load(deps: Deps, id: string): Promise<InstanceRecord> {
  const instance = await deps.store.getInstance(id);
  if (!instance) throw new CoordinatorError("not_found", "no such instance");
  return instance;
}

export const rngFor = (instance: InstanceRecord, state: State) => new Rng(BigInt(instance.seed), state.rng_counter);

/** Seconds the current wait of `state` may last, or null when untimed. */
function timeoutOf(deps: Deps, state: State): number | null {
  const seconds = state.mode === "combat" ? deps.timeouts.combat : deps.timeouts.exploration;
  return seconds > 0 ? seconds : null;
}

const startsWait = (events: readonly GameEvent[]) => events.some((e) => e.type === "round_started" || e.type === "turn_started");

/** The `round` message payload (api.md, Messages). */
export function roundOf(state: State, deadline: Date | null) {
  const r = state.round;
  const characters = r.participants.filter((id) => state.characters[id]);
  const current = r.resolution === "sequential" && r.order && r.turn_index !== null ? r.order[r.turn_index] : undefined;
  const declared = characters.filter((id) => r.declarations[id] !== undefined);
  const waiting = r.resolution === "sequential" ? (current && state.characters[current] ? [current] : []) : characters.filter((id) => r.declarations[id] === undefined);
  return { number: r.number, mode: r.mode, resolution: r.resolution, ...(current ? { current } : {}), declared, waiting_on: waiting, ...(deadline ? { deadline: deadline.toISOString() } : {}) };
}

/** Sheets to write back: a dead character stays dead; everyone else is available again. */
function sheetsOf(state: State, ids: readonly string[]) {
  return ids
    .filter((id) => state.characters[id])
    .map((id) => {
      const sheet = state.characters[id]!.sheet as CharacterRecord["sheet"];
      return { id, sheet, status: (sheet.status === "dead" ? "dead" : "available") as CharacterRecord["status"] };
    });
}

export async function send(deps: Deps, topic: string, messages: Message[]): Promise<void> {
  try {
    await deps.broadcast.send(topic, messages);
  } catch (e) {
    deps.warn?.(`${topic}: ${(e as Error).message}`);
  }
}

interface Committed {
  version: number;
  state: State;
  events: GameEvent[];
}

/**
 * Commits an engine result at `instance.version + 1` and sends its messages. Throws VersionConflict
 * when another writer committed first.
 */
export async function commit(
  deps: Deps,
  instance: InstanceRecord,
  bundles: Bundles,
  result: Extract<Result, { ok: true }>,
  input: CommitInput,
  extra: { actor?: string; inputLog?: string; outcome?: "committed" | "fallback"; status?: InstanceStatus } = {},
): Promise<Committed> {
  const ended = result.state.ended !== null;
  const version = await deps.store.commit({
    instanceId: instance.id,
    expectedVersion: instance.version,
    state: result.state,
    events: result.events,
    input,
    inputLog: extra.inputLog ? { id: extra.inputLog, outcome: extra.outcome ?? "committed" } : undefined,
    status: ended ? "ended" : extra.status,
    ending: ended ? result.state.ended!.ending : undefined,
  });
  let deadline: Date | null = null;
  if (!ended && startsWait(result.events)) {
    const seconds = timeoutOf(deps, result.state);
    deadline = seconds === null ? null : new Date(deps.now().getTime() + seconds * 1000);
    await deps.store.setDeadline(instance.id, version, deadline);
  } else if (!ended) {
    deadline = await deps.store.deadline(instance.id);
  }
  if (ended) await deps.store.releaseCharacters(instance.id, sheetsOf(result.state, Object.keys(result.state.characters)));

  const visible = sharedEvents(instance.state, result.state, bundles, result.events);
  await deps.store.shareEvents(instance.id, version, result.events.flatMap((e, i) => (visible.includes(e) ? [i + 1] : [])));
  const base = { instance_id: instance.id, version };
  const shared: Message[] = [{ type: "commit", ...base, events: visible, actor_id: extra.actor ?? null, ...(extra.inputLog ? { input_id: extra.inputLog } : {}) }];
  if (!ended && (startsWait(result.events) || result.events.some((e) => e.type === "action_declared"))) shared.push({ type: "round", ...base, ...roundOf(result.state, deadline) });
  if (ended || extra.status) shared.push({ type: "instance_status", ...base, status: ended ? "ended" : extra.status!, ...(ended ? { ending: result.state.ended!.ending } : {}) });
  await send(deps, instanceTopic(instance.id), shared);

  // Recipient-specific messages, on each owner's user channel.
  const owners = new Map<string, Message[]>();
  const to = (characterId: string, m: Message) => {
    const owner = result.state.characters[characterId]?.user_id;
    if (owner) owners.set(owner, [...(owners.get(owner) ?? []), m]);
  };
  for (const e of result.events) {
    const p = e as { actor?: string };
    if (e.type === "action_declared" && p.actor) {
      const d = result.state.round.declarations[p.actor];
      if (d) to(p.actor, { type: "declaration", ...base, character_id: p.actor, tool: d.tool, args: d.args, label: d.tool });
    }
    if (e.type === "choice_offered" && p.actor) {
      const choice = result.state.pending_choices[p.actor];
      if (choice) to(p.actor, { type: "choice", ...base, character_id: p.actor, prompt: choice.prompt, options: choice.options.map((o) => ({ id: o.id, label: o.label })) });
    }
  }
  for (const [user, messages] of owners) await send(deps, userTopic(user), messages);

  await sendActionMenus(deps, instance.id, version, bundles, result.state, result.events, extra.actor);
  // auto_pause waits for the round under way to close.
  if (!ended && result.events.some((e) => e.type === "round_ended") && (await deps.store.pauseRequested(instance.id))) await setStatus(deps, instance.id, "paused");

  // Narration after the commit; a commit with nothing resolved, such as a declaration, has none.
  const job = () => narrate(deps, { instanceId: instance.id, version, bundles, before: instance.state, after: result.state, events: visible, facts: result.facts ?? [], actor: extra.actor ?? null });
  if (deps.defer) deps.defer(job);
  else await job();
  return { version, state: result.state, events: result.events };
}

/** Repeats `attempt` on a fresh read of the instance until it commits without a version conflict. */
export async function serialized<T>(deps: Deps, id: string, attempt: (instance: InstanceRecord) => Promise<T>): Promise<T> {
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return await attempt(await load(deps, id));
    } catch (e) {
      if (!(e instanceof VersionConflict)) throw e;
    }
  }
  throw new CoordinatorError("conflict", "the instance is busy; try again");
}

export function requireStatus(instance: InstanceRecord, allowed: InstanceStatus[], action: string): void {
  if (!allowed.includes(instance.status)) throw new CoordinatorError("conflict", `cannot ${action} an instance that is ${instance.status}`);
}

/** Starts an instance from the lobby: builds round 1 and commits version 1 with status `active`. */
export async function start(deps: Deps, instanceId: string, characters: JoiningCharacter[]): Promise<Committed> {
  return serialized(deps, instanceId, async (instance) => {
    requireStatus(instance, ["lobby"], "start");
    const bundles = await pinnedBundles(deps.store, instance);
    const result = startInstance({ bundles, characters, seed: BigInt(instance.seed) });
    if (!result.ok) throw new CoordinatorError("conflict", `the instance cannot start: ${result.error.detail}`, result.error.code);
    return commit(deps, instance, bundles, result, { start: { seed: instance.seed, characters } }, { status: "active" });
  });
}

/** Invokes `advance` when the current wait's deadline has passed. Returns whether it committed. */
export async function catchUp(deps: Deps, instanceId: string): Promise<boolean> {
  const instance = await load(deps, instanceId);
  if (instance.status !== "active" || !instance.state) return false;
  const deadline = await deps.store.deadline(instanceId);
  if (!deadline || deadline.getTime() > deps.now().getTime()) return false;
  const bundles = await pinnedBundles(deps.store, instance);
  const result = advance(instance.state, bundles, rngFor(instance, instance.state));
  if (!result.ok) return false;
  try {
    await commit(deps, instance, bundles, result, { advance: true });
    return true;
  } catch (e) {
    // Another request advanced or committed first.
    if (e instanceof VersionConflict) return false;
    throw e;
  }
}

export type ActOutcome = { committed: number } | { rejected: { code: string; detail: string } };

/**
 * Runs one tool call for `actor` through the engine and commits it, first advancing past an expired
 * deadline. A rejection is returned, not thrown; the caller records it.
 */
export async function act(deps: Deps, instanceId: string, actor: string, call: { tool: string; args: Record<string, unknown> }, inputLog?: string): Promise<ActOutcome> {
  await catchUp(deps, instanceId);
  return serialized(deps, instanceId, async (instance) => {
    requireStatus(instance, ["active"], "act in");
    const bundles = await pinnedBundles(deps.store, instance);
    const result = submit(instance.state!, bundles, actor, call, rngFor(instance, instance.state!));
    if (!result.ok) return { rejected: result.error };
    const c = await commit(deps, instance, bundles, result, { call: { actor, tool: call.tool, args: call.args } }, { actor, inputLog });
    return { committed: c.version };
  });
}

/** The author's `advance_round`: ends the current wait now. */
export async function advanceRound(deps: Deps, instanceId: string): Promise<Committed> {
  return serialized(deps, instanceId, async (instance) => {
    requireStatus(instance, ["active"], "advance");
    const bundles = await pinnedBundles(deps.store, instance);
    const result = advance(instance.state!, bundles, rngFor(instance, instance.state!));
    if (!result.ok) throw new CoordinatorError("conflict", result.error.detail, result.error.code);
    return commit(deps, instance, bundles, result, { advance: true });
  });
}

/** Pauses, resumes, or ends an instance without a commit; ending writes every sheet back. */
export async function setStatus(deps: Deps, instanceId: string, status: "active" | "paused" | "ended"): Promise<void> {
  await serialized(deps, instanceId, async (instance) => {
    const from: Record<typeof status, InstanceStatus[]> = { paused: ["active"], active: ["paused"], ended: ["active", "paused"] };
    requireStatus(instance, from[status], status === "active" ? "resume" : status === "paused" ? "pause" : "end");
    // A resumed wait gets a full timeout; a paused or ended instance has none.
    const seconds = status === "active" && instance.state ? timeoutOf(deps, instance.state) : null;
    const deadline = seconds === null ? null : new Date(deps.now().getTime() + seconds * 1000);
    await deps.store.setInstanceStatus(instance.id, instance.version, status, deadline);
    await deps.store.setPauseRequested(instance.id, false);
    if (status === "ended" && instance.state) await deps.store.releaseCharacters(instance.id, sheetsOf(instance.state, Object.keys(instance.state.characters)));
    const base = { instance_id: instance.id, version: instance.version };
    const messages: Message[] = [{ type: "instance_status", ...base, status }];
    if (status === "active" && instance.state) messages.push({ type: "round", ...base, ...roundOf(instance.state, deadline) });
    await send(deps, instanceTopic(instance.id), messages);
  });
}

/** Adds a character to a paused instance's party; the store has already claimed the character. */
export async function joinPaused(deps: Deps, instanceId: string, joining: JoiningCharacter): Promise<Committed> {
  return serialized(deps, instanceId, async (instance) => {
    requireStatus(instance, ["paused"], "join");
    const bundles = await pinnedBundles(deps.store, instance);
    const result = join(instance.state!, bundles, joining, rngFor(instance, instance.state!));
    if (!result.ok) throw new CoordinatorError("conflict", `the character cannot join: ${result.error.detail}`, result.error.code);
    return commit(deps, instance, bundles, result, { join: { character: joining } });
  });
}

/** Removes a character from a running or paused party and writes its sheet back. */
export async function leaveParty(deps: Deps, instanceId: string, characterId: string): Promise<Committed> {
  return serialized(deps, instanceId, async (instance) => {
    requireStatus(instance, ["active", "paused"], "leave");
    const bundles = await pinnedBundles(deps.store, instance);
    const before = instance.state!;
    const result = leave(before, bundles, characterId, rngFor(instance, before));
    if (!result.ok) throw new CoordinatorError("conflict", result.error.detail, result.error.code);
    const c = await commit(deps, instance, bundles, result, { leave: { character_id: characterId } });
    await deps.store.releaseCharacters(instance.id, sheetsOf(before, [characterId]));
    return c;
  });
}

/** The view of one character, after advancing past an expired deadline. */
export async function characterView(deps: Deps, instanceId: string, characterId: string) {
  await catchUp(deps, instanceId);
  const instance = await load(deps, instanceId);
  if (!instance.state || !instance.state.characters[characterId]) return null;
  return view(instance.state, await pinnedBundles(deps.store, instance), characterId);
}

/** Applies the rules system's end-of-session changes at an occurrence's end (architecture.md, Scheduling). */
export async function endOfSession(deps: Deps, instanceId: string, sessionId: string, occurrenceStart: string): Promise<Committed | null> {
  return serialized(deps, instanceId, async (instance) => {
    if (!instance.state || (instance.status !== "active" && instance.status !== "paused")) return null;
    const bundles = await pinnedBundles(deps.store, instance);
    const result = sessionEnd(instance.state, bundles, rngFor(instance, instance.state));
    if (!result.ok) throw new CoordinatorError("conflict", result.error.detail, result.error.code);
    return commit(deps, instance, bundles, result, { session_end: { session_id: sessionId, occurrence_start: occurrenceStart } });
  });
}

/** auto_pause: pauses now when no round is under way, else after the current round closes. */
export async function pauseWhenRoundCloses(deps: Deps, instanceId: string): Promise<"paused" | "requested" | "skipped"> {
  const instance = await load(deps, instanceId);
  if (instance.status !== "active" || !instance.state) return "skipped";
  const r = instance.state.round;
  const quiet = Object.keys(r.declarations).length === 0 && Object.keys(instance.state.pending_choices).length === 0 && r.order === null;
  if (quiet) {
    await setStatus(deps, instanceId, "paused");
    return "paused";
  }
  await deps.store.setPauseRequested(instanceId, true);
  return "requested";
}
