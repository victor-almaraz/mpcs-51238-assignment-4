// The store (engine milestone 9): atomic commits, and replay of stored instances reproducing stored
// state, including across state_restored.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonical, replay, submit, type Bundles, type Commit } from "../engine";
import { AdminError, replayInstance, restoreInstance } from "../coordinator/admin";
import { commitOf } from "../harness/harness";
import { SCENARIOS, author } from "../harness/scenarios";
import { Rng } from "../rng";
import { Store, VersionConflict } from "./index";
import { testDb } from "./testing/pglite";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;

beforeEach(async () => {
  db = await testDb();
  store = new Store(db);
});
afterEach(async () => {
  await db.close();
});

const trial = SCENARIOS.find((s) => s.name === "trial_escaped")!;

async function install(bundles: Bundles, id = "i_1", seed = 7): Promise<void> {
  for (const b of [...bundles.settings, bundles.adventure]) {
    if (!(await store.getBundle(b.kind, b.id, b.version))) await store.putBundle(b, { origin: "operator" });
  }
  await store.createInstance({
    id,
    campaign_id: "camp_1",
    name: `Instance ${id}`,
    system: bundles.system.ID,
    system_version: bundles.system.VERSION,
    modules: [],
    materials: [...bundles.settings.map((s, i) => ({ kind: "setting" as const, id: s.id, version: s.version, position: i })), { kind: "adventure", id: bundles.adventure.id, version: bundles.adventure.version, position: bundles.settings.length }],
    seed,
  });
}

/** Stores a scenario's commits one by one through the store, as the Coordinator would. */
async function storeScenario(scenario: (typeof SCENARIOS)[number], id = "i_1"): Promise<Commit[]> {
  const session = author(scenario);
  await install(scenario.bundles(), id, scenario.seed);
  const commits = session.log.map(commitOf);
  for (const [i, c] of commits.entries()) {
    const state = i === commits.length - 1 ? session.state : replayState(scenario.bundles(), commits, c.version);
    await store.commit({ instanceId: id, expectedVersion: c.version - 1, state, events: c.events, input: c.input, status: i === 0 ? "active" : undefined });
  }
  return commits;
}

function replayState(bundles: Bundles, commits: Commit[], to: number) {
  const r = replay(bundles, commits, to);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe("commits", () => {
  it("increments the version, numbers events contiguously, and records actor ids", async () => {
    await storeScenario(trial);
    const instance = await store.getInstance("i_1");
    const events = await store.events("i_1");
    expect(instance!.status).toBe("active");
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(new Set(events.map((e) => e.version)).size).toBeGreaterThan(1);
    const declared = events.find((e) => e.event.type === "action_declared")!;
    expect(declared.actor_id).toBe("c_1");
    expect(events.find((e) => e.event.type === "round_started")!.actor_id).toBeNull();
  });

  it("returns events after a version", async () => {
    await storeScenario(trial);
    const after = await store.events("i_1", 3);
    expect(after.every((e) => e.version > 3)).toBe(true);
    expect(after[0]!.version).toBe(4);
  });

  it("rejects a commit at the wrong version and writes nothing", async () => {
    await storeScenario(trial);
    const before = await store.getInstance("i_1");
    const events = (await store.events("i_1")).length;
    await expect(store.commit({ instanceId: "i_1", expectedVersion: before!.version - 1, state: before!.state!, events: [{ type: "waited", actor: "c_1" }], input: { advance: true } })).rejects.toBeInstanceOf(VersionConflict);
    expect((await store.getInstance("i_1"))!.version).toBe(before!.version);
    expect((await store.events("i_1")).length).toBe(events);
    expect((await store.commits("i_1")).length).toBe(before!.version);
  });

  it("is atomic: a failure after the events are inserted rolls back the whole commit", async () => {
    await storeScenario(trial);
    const before = await store.getInstance("i_1");
    const events = (await store.events("i_1")).length;
    await expect(
      store.commit({ instanceId: "i_1", expectedVersion: before!.version, state: before!.state!, events: [{ type: "waited", actor: "c_1" }], input: { advance: true }, inputLog: { id: "missing", outcome: "committed" } }),
    ).rejects.toThrow(/input log missing does not exist/);
    expect((await store.getInstance("i_1"))!.version).toBe(before!.version);
    expect((await store.events("i_1")).length).toBe(events);
  });

  it("lets exactly one of two writers at the same version commit", async () => {
    await storeScenario(trial);
    const before = await store.getInstance("i_1");
    const attempt = () => store.commit({ instanceId: "i_1", expectedVersion: before!.version, state: before!.state!, events: [], input: { advance: true } }).then(
      () => "ok",
      (e: unknown) => (e instanceof VersionConflict ? "conflict" : "error"),
    );
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.sort()).toEqual(["conflict", "ok"]);
  });

  it("records the input log outcome and version in the same commit", async () => {
    await storeScenario(trial);
    const before = await store.getInstance("i_1");
    expect(await store.logInput({ id: "in_1", instance_id: "i_1", user_id: "u_1", idempotency_key: "k1", text: "wait" })).toBe(true);
    expect(await store.logInput({ id: "in_2", instance_id: "i_1", user_id: "u_1", idempotency_key: "k1", text: "wait again" })).toBe(false);
    const v = await store.commit({ instanceId: "i_1", expectedVersion: before!.version, state: before!.state!, events: [], input: { advance: true }, inputLog: { id: "in_1", outcome: "committed" } });
    expect(await store.inputByKey("i_1", "u_1", "k1")).toEqual({ id: "in_1", outcome: "committed", version: v });
  });
});

describe("bundles", () => {
  it("stores immutable bundle data, with only listed changing", async () => {
    const b = trial.bundles().adventure;
    await store.putBundle(b, { origin: "author", publisher_id: "u_1" });
    await expect(store.putBundle(b, { origin: "author" })).rejects.toThrow();
    await store.setListed("adventure", b.id, b.version, false);
    expect(canonical(await store.getBundle("adventure", b.id, b.version))).toBe(canonical(b));
    await expect(db.query("update bundles set data = '{}' where id = $1", [b.id])).rejects.toThrow(/immutable/);
  });
});

describe.each(SCENARIOS)("replaying the stored golden instance $name", (scenario) => {
  it("reproduces the stored state", async () => {
    await storeScenario(scenario);
    const instance = await store.getInstance("i_1");
    expect(instance!.state!.ended).toEqual({ ending: scenario.ending });
    expect(await replayInstance(store, "i_1")).toMatchObject({ matches_stored: true, diverges_at: null });
  });
});

describe("restore", () => {
  it("restores to an earlier version, and replay reproduces state across state_restored", async () => {
    await storeScenario(trial);
    await expect(restoreInstance(store, "i_1", 3, "test")).rejects.toBeInstanceOf(AdminError);
    await store.setStatus("i_1", "paused");
    const before = (await store.getInstance("i_1"))!;
    const restored = await restoreInstance(store, "i_1", 3, "replay divergence at 4");
    expect(restored.version).toBe(before.version + 1);
    const last = (await store.events("i_1", before.version))[0]!.event;
    expect(last).toEqual({ type: "state_restored", from_version: before.version, to_version: 3, reason: "replay divergence at 4" });
    expect(canonical(restored.state)).toBe(canonical((await replayInstance(store, "i_1", 3)).state));
    expect((await replayInstance(store, "i_1")).matches_stored).toBe(true);

    // Play continues from the restored state, and replay still matches.
    const bundles = trial.bundles();
    const r = submit(restored.state!, bundles, "c_1", { tool: "wait", args: {} }, new Rng(BigInt(restored.seed), restored.state!.rng_counter));
    if (!r.ok) throw new Error(r.error.detail);
    await store.commit({ instanceId: "i_1", expectedVersion: restored.version, state: r.state, events: r.events, input: { call: { actor: "c_1", tool: "wait", args: {} } } });
    expect((await replayInstance(store, "i_1")).matches_stored).toBe(true);
  });

  it("undoes a restore by restoring to the version before it", async () => {
    await storeScenario(trial);
    await store.setStatus("i_1", "paused");
    const before = (await store.getInstance("i_1"))!;
    await restoreInstance(store, "i_1", 2, "mistake");
    const undone = await restoreInstance(store, "i_1", before.version, "undo");
    expect(canonical(undone.state)).toBe(canonical(before.state));
    expect((await replayInstance(store, "i_1")).matches_stored).toBe(true);
  });
});

describe("divergence", () => {
  it("reports stored state that the events do not explain", async () => {
    await storeScenario(trial);
    const instance = (await store.getInstance("i_1"))!;
    await db.query("update instances set state = jsonb_set(state, '{flags,alarm}', '3') where id = 'i_1'");
    expect(await replayInstance(store, "i_1")).toMatchObject({ matches_stored: false, diverges_at: instance.version });
  });

  it("reports the first version whose stored events differ", async () => {
    await storeScenario(trial);
    await db.query("update events set payload = payload || '{\"actor\":\"c_9\"}' where instance_id = 'i_1' and version = 4 and type = 'action_declared'");
    expect(await replayInstance(store, "i_1")).toMatchObject({ matches_stored: false, diverges_at: 4 });
  });
});
