// Operator operations on instances (api.md, "Administrative operations"; runbooks/instance-recovery.md):
// the pinned bundles of an instance, replay_instance, and restore_instance.

import type { AdventureBundle } from "../bundle/adventure";
import type { SettingBundle } from "../bundle/setting";
import { applyInput, canonical, replay, type Bundles, type State } from "../engine";
import type { InstanceRecord, Store } from "../store";
import { SYSTEMS } from "../systems";

export class AdminError extends Error {
  constructor(
    readonly code: "not_found" | "conflict" | "invalid_request",
    message: string,
  ) {
    super(message);
  }
}

/** The configured system and the bundles an instance pinned, settings in material order. */
export async function pinnedBundles(store: Store, instance: InstanceRecord): Promise<Bundles> {
  const base = SYSTEMS[instance.system];
  if (!base) throw new AdminError("invalid_request", `rules system '${instance.system}' is not installed`);
  if (base.VERSION !== instance.system_version) throw new AdminError("invalid_request", `installed ${instance.system} ${base.VERSION} is not the pinned ${instance.system_version}`);
  const settings: SettingBundle[] = [];
  let adventure: AdventureBundle | undefined;
  for (const m of [...instance.materials].sort((a, b) => a.position - b.position)) {
    const b = await store.getBundle(m.kind, m.id, m.version);
    if (!b) throw new AdminError("invalid_request", `bundle ${m.kind} ${m.id} ${m.version} is missing`);
    if (b.kind === "adventure") adventure = b;
    else settings.push(b);
  }
  if (!adventure) throw new AdminError("invalid_request", "the instance pins no adventure");
  return { system: base.configure(instance.modules), settings, adventure };
}

async function instanceOrThrow(store: Store, id: string): Promise<InstanceRecord> {
  const instance = await store.getInstance(id);
  if (!instance) throw new AdminError("not_found", `instance ${id} does not exist`);
  return instance;
}

// SPEC_ISSUES.md#replay-to-version: replay stops at the first diverging version, which it reports.
/**
 * Replays an instance's commits to `toVersion` (default: latest). `matches_stored` holds when every
 * commit's events reproduce and, at the latest version, the replayed state equals the stored state.
 */
export async function replayInstance(store: Store, id: string, toVersion?: number): Promise<{ state: State | null; matches_stored: boolean; diverges_at: number | null }> {
  const instance = await instanceOrThrow(store, id);
  const bundles = await pinnedBundles(store, instance);
  const commits = await store.commits(id);
  const to = toVersion ?? instance.version;
  const r = replay(bundles, commits, to);
  if (!r.ok) return { state: null, matches_stored: false, diverges_at: r.version };
  const atLatest = r.version === instance.version;
  const matches = !atLatest || canonical(r.state) === canonical(instance.state);
  return { state: r.state, matches_stored: matches, diverges_at: matches ? null : r.version };
}

/** Commits a `state_restored` event and sets state to the replayed state at `toVersion`. Requires `paused`. */
export async function restoreInstance(store: Store, id: string, toVersion: number, reason: string): Promise<InstanceRecord> {
  const instance = await instanceOrThrow(store, id);
  if (instance.status !== "paused") throw new AdminError("conflict", `instance ${id} is ${instance.status}, not paused`);
  const bundles = await pinnedBundles(store, instance);
  const commits = await store.commits(id);
  const input = { restore: { to_version: toVersion, reason } };
  const restored = (to: number) => {
    const r = replay(bundles, commits, to);
    return r.ok ? r.state : undefined;
  };
  const r = applyInput(bundles, instance.state ?? undefined, instance.version, input, BigInt(instance.seed), restored);
  if (!r.ok) throw new AdminError("invalid_request", r.error.detail);
  await store.commit({ instanceId: id, expectedVersion: instance.version, state: r.state, events: r.events, input });
  return instanceOrThrow(store, id);
}
