// Playing an instance through the Coordinator (sprint 13 exit criterion: two players play one instance;
// idempotency, timeouts, and reconnection with after_version).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryBroadcaster } from "../broadcast";
import { canonical, replay } from "../engine";
import { sunkenBundles } from "../harness/scenarios";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCharacter } from "./characters";
import { createCampaign, deleteCampaign, joinByLink, leaveCampaign, restoreCampaign, rotateInviteLink } from "./campaigns";
import type { Entropy } from "./entropy";
import { actWithOutcome, addCharacter, advanceRound, createInstance, endInstance, getHistory, getInstance, instanceRoster, pauseInstance, removeCharacter, resumeInstance, startInstance, submitAction, type Deps } from "./instances";
import { code, entropy, richSetting, SIX, SUNKEN, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let broadcast: MemoryBroadcaster;
let clock: { now: Date };
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps, broadcast, clock } = await world(["user_a", "user_b", "user_c"]));
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

/** A campaign by A with B as a player, an instance with Vale (A) and Rook (B) in the lobby. */
async function table() {
  const campaign = await createCampaign(store, "user_a", { title: "The Sunken Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
  await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", campaign.id, e)).invite_link_code);
  await joinByLink(store, "user_c", (await rotateInviteLink(store, "user_a", campaign.id, e)).invite_link_code);
  const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Tuesday group" }, e);
  const make = (owner: string, name: string) => createCharacter(store, owner, { system: "quest", name, choices: { role: "fighter", abilities: SIX } }, e);
  const vale = await make("user_a", "Vale");
  const rook = await make("user_b", "Rook");
  await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: vale.id });
  await addCharacter(deps, "user_b", { instance_id: instance.id, character_id: rook.id });
  return { campaign, instance, vale, rook, make };
}

const act = (user: string, instanceId: string, key: string, tool = "wait", args: Record<string, unknown> = {}) => submitAction(deps, user, { instance_id: instanceId, tool, args, idempotency_key: key }, e);
const types = (topic: string) => broadcast.on(topic).map((m) => m.type);

describe("lifecycle", () => {
  it("starts with the party, broadcasting the commit, the round, and the status", async () => {
    const { instance, vale, rook } = await table();
    expect(await code(startInstance(deps, "user_b", instance.id))).toBe("forbidden");
    const started = await startInstance(deps, "user_a", instance.id);
    expect(started).toMatchObject({ status: "active", version: 1 });
    expect(started.started_at).not.toBeNull();
    expect(types(`instance:${instance.id}`)).toEqual(["commit", "round", "instance_status"]);
    const round = broadcast.on(`instance:${instance.id}`)[1]!;
    expect(round).toMatchObject({ version: 1, number: 1, mode: "exploration", resolution: "simultaneous", declared: [], waiting_on: [rook.id, vale.id].sort(), deadline: "2026-10-22T18:02:00.000Z" });
    expect(await code(startInstance(deps, "user_a", instance.id))).toBe("conflict");
    expect(await code(addCharacter(deps, "user_c", { instance_id: instance.id, character_id: (await createCharacter(store, "user_c", { system: "quest", name: "Late", choices: { role: "spy", abilities: SIX } }, e)).id }))).toBe("conflict");
  });

  it("refuses to start outside the adventure's player range", async () => {
    const campaign = await createCampaign(store, "user_a", { title: "Empty", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
    const empty = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Nobody" }, e);
    expect(await code(startInstance(deps, "user_a", empty.id))).toBe("conflict");
  });

  it("pauses, resumes, and ends, writing every sheet back", async () => {
    const { instance, vale, rook } = await table();
    await startInstance(deps, "user_a", instance.id);
    expect((await pauseInstance(deps, "user_a", instance.id)).status).toBe("paused");
    expect(await code(act("user_b", instance.id, "key-paused-1"))).toBe("conflict");
    expect((await resumeInstance(deps, "user_a", instance.id)).status).toBe("active");
    const ended = await endInstance(deps, "user_a", instance.id);
    expect(ended).toMatchObject({ status: "ended", characters: [] });
    for (const id of [vale.id, rook.id]) expect(await store.getCharacter(id)).toMatchObject({ status: "available", instance_id: null });
    expect(types(`instance:${instance.id}`).filter((t) => t === "instance_status")).toEqual(["instance_status", "instance_status", "instance_status", "instance_status"]);
  });

  it("names every character that played after the game ends", async () => {
    const { instance, vale, rook } = await table();
    await startInstance(deps, "user_a", instance.id);
    await endInstance(deps, "user_a", instance.id);
    const roster = await instanceRoster(store, "user_b", instance.id);
    expect(roster.map((c) => [c.id, c.name])).toEqual([
      [vale.id, "Vale"],
      [rook.id, "Rook"],
    ]);
    expect(roster.every((c) => c.left_at !== null)).toBe(true);
  });
});

describe("play", () => {
  it("collects both declarations, then resolves the round", async () => {
    const { instance, vale, rook } = await table();
    await startInstance(deps, "user_a", instance.id);
    const first = await act("user_b", instance.id, "rook-wait-0001");
    expect(first.accepted).toBe(true);
    expect(broadcast.on("user:user_b").map((m) => m.type)).toEqual(["declaration"]);
    expect(broadcast.on(`instance:${instance.id}`).at(-1)).toMatchObject({ type: "round", version: 2, declared: [rook.id], waiting_on: [vale.id] });
    await act("user_a", instance.id, "vale-wait-0001");
    const { instance: now, view } = await getInstance(deps, "user_a", { instance_id: instance.id });
    expect(now.version).toBe(3);
    expect(view).toMatchObject({ character_id: vale.id, round: { number: 2 } });
    const commit = broadcast.on(`instance:${instance.id}`).filter((m) => m.type === "commit").at(-1)!;
    expect((commit.events as { type: string }[]).map((x) => x.type)).toEqual(expect.arrayContaining(["action_declared", "round_ended", "round_started"]));
  });

  it("applies an idempotency key once", async () => {
    const { instance } = await table();
    await startInstance(deps, "user_a", instance.id);
    const once = await act("user_b", instance.id, "same-key-0001");
    const twice = await act("user_b", instance.id, "same-key-0001");
    expect(twice.input_id).toBe(once.input_id);
    expect((await store.instanceView(instance.id))!.version).toBe(2);
    expect(await code(act("user_b", instance.id, "short"))).toBe("invalid_request");
  });

  it("reports a rejected action on the user channel without committing", async () => {
    const { instance } = await table();
    await startInstance(deps, "user_a", instance.id);
    const r = await act("user_b", instance.id, "bad-move-0001", "move", { to_id: "nowhere" });
    expect(r).toEqual({ accepted: true, input_id: r.input_id });
    expect(broadcast.on("user:user_b").at(-1)).toMatchObject({ type: "input_rejected", input_id: r.input_id, version: 1, reason: "unknown_id", detail: "There is nothing like that here." });
    expect((await store.instanceView(instance.id))!.version).toBe(1);
    expect(await code(act("user_c", instance.id, "no-char-0001"))).toBe("forbidden");
  });

  it("returns a rejection's sentence to the play page, which may have no Realtime channel", async () => {
    const { instance } = await table();
    await startInstance(deps, "user_a", instance.id);
    const r = await actWithOutcome(deps, "user_b", { instance_id: instance.id, tool: "move", args: { to_id: "nowhere" }, idempotency_key: "bad-move-0002" }, e);
    expect(r.rejected).toBe("There is nothing like that here.");
    const ok = await actWithOutcome(deps, "user_b", { instance_id: instance.id, tool: "wait", args: {}, idempotency_key: "good-wait-0002" }, e);
    expect(ok.rejected).toBeUndefined();
  });

  it("advances an expired round on the next request, or when the author asks", async () => {
    const { instance } = await table();
    await startInstance(deps, "user_a", instance.id);
    await act("user_b", instance.id, "rook-wait-0002");
    clock.now = new Date("2026-10-22T18:01:59Z");
    expect((await getInstance(deps, "user_b", { instance_id: instance.id })).instance.version).toBe(2);
    clock.now = new Date("2026-10-22T18:02:01Z");
    const late = await getInstance(deps, "user_b", { instance_id: instance.id });
    expect(late.instance.version).toBe(3);
    expect(late.view!.round.number).toBe(2);
    expect(await code(advanceRound(deps, "user_b", instance.id))).toBe("forbidden");
    await advanceRound(deps, "user_a", instance.id);
    expect((await store.instanceView(instance.id))!.version).toBe(4);
  });

  it("serves history after a version, so a client can backfill after reconnecting", async () => {
    const { instance } = await table();
    await startInstance(deps, "user_a", instance.id);
    await act("user_b", instance.id, "rook-wait-0003");
    await act("user_a", instance.id, "vale-wait-0003");
    const all = await getHistory(store, "user_b", { instance_id: instance.id });
    expect(all.items.map((i) => i.version)).toEqual([1, 2, 3]);
    expect(all.next_after_version).toBeNull();
    const page = await getHistory(store, "user_b", { instance_id: instance.id, after_version: 1, limit: 1 });
    expect(page).toMatchObject({ items: [{ version: 2, narration: null }], next_after_version: 2 });
    expect(all.items[2]!.narration).toEqual({ text: "Vale waits. Rook waits.", source: "template" });
    expect(broadcast.on(`instance:${instance.id}`).filter((m) => m.type === "narration").map((m) => m.version)).toEqual([3]);
    // History carries the shared events: the same ones the commit messages carried.
    const commits = broadcast.on(`instance:${instance.id}`).filter((m) => m.type === "commit");
    expect(canonical(all.items.map((i) => i.events))).toBe(canonical(commits.map((m) => m.events)));
    expect(all.items.flatMap((i) => i.events).some((x) => x.type === "flag_set" || x.type === "stage_set")).toBe(false);
    expect(await code(getHistory(store, "user_x", { instance_id: instance.id }))).toBe("unauthenticated");
  });

  it("replays the stored commits to the stored state", async () => {
    const { instance } = await table();
    await startInstance(deps, "user_a", instance.id);
    await act("user_b", instance.id, "rook-wait-0004");
    await act("user_a", instance.id, "vale-wait-0004");
    const stored = (await store.getInstance(instance.id))!;
    const bundles = { ...sunkenBundles(), settings: [richSetting()] };
    const r = replay(bundles, await store.commits(instance.id));
    expect(r.ok && canonical(r.state) === canonical(stored.state)).toBe(true);
  });
});

describe("a full adventure", () => {
  it.each(["sunken_escaped", "sunken_lost"])("plays %s to its ending with direct actions alone", async (name) => {
    const ending = name.split("_")[1];
    // The golden scenario's seed and character id, so its scripted inputs apply unchanged.
    const golden: Entropy = { ...entropy(), seed: () => 11, id: (prefix) => (prefix === "ch" ? "c_1" : `${prefix}_${Math.random().toString(36).slice(2)}`) };
    const campaign = await createCampaign(store, "user_a", { title: "Solo", system: "quest", system_versions: "^1.0", materials: SUNKEN }, golden);
    const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Solo" }, golden);
    const vale = await createCharacter(store, "user_a", { system: "quest", name: "Vale", choices: { role: "fighter", abilities: SIX } }, golden);
    await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: vale.id });
    await startInstance(deps, "user_a", instance.id);
    const lines = readFileSync(join(process.cwd(), "lib/harness/golden", `${name}.input.jsonl`), "utf8").trim().split("\n");
    for (const [n, text] of lines.entries()) {
      const input = JSON.parse(text) as { actor?: string; tool?: string; args?: Record<string, unknown>; advance?: true };
      if (input.advance) await advanceRound(deps, "user_a", instance.id);
      else if (input.tool) await submitAction(deps, "user_a", { instance_id: instance.id, tool: input.tool, args: input.args ?? {}, idempotency_key: `${name}-${String(n).padStart(4, "0")}` }, golden);
    }
    expect(broadcast.on("user:user_a").filter((m) => m.type === "input_rejected")).toEqual([]);
    expect(await store.instanceView(instance.id)).toMatchObject({ status: "ended", ending });
    // Written back: the lost ending leaves Vale at death's door with 0 HP, which is not dead.
    const back = (await store.getCharacter(vale.id))!;
    expect(back.status).toBe("available");
    if (ending === "lost") expect((back.sheet.hp as { value: number }).value).toBe(0);
  });
});

describe("party changes", () => {
  it("lets a character join and leave while paused", async () => {
    const { instance, make } = await table();
    await startInstance(deps, "user_a", instance.id);
    await pauseInstance(deps, "user_a", instance.id);
    const late = await make("user_c", "Late");
    const joined = await addCharacter(deps, "user_c", { instance_id: instance.id, character_id: late.id });
    expect(joined.characters.map((c) => c.name)).toEqual(["Vale", "Rook", "Late"]);
    expect((await store.getInstance(instance.id))!.state!.characters[late.id]).toBeDefined();
    await removeCharacter(deps, "user_c", { instance_id: instance.id, character_id: late.id });
    expect((await store.getInstance(instance.id))!.state!.characters[late.id]).toBeUndefined();
    expect(await store.getCharacter(late.id)).toMatchObject({ status: "available", instance_id: null });
    const r = replay({ ...sunkenBundles(), settings: [richSetting()] }, await store.commits(instance.id));
    expect(r.ok).toBe(true);
  });

  it("serves the instance without a view to a player with two characters who names neither", async () => {
    const { instance, vale, make } = await table();
    await startInstance(deps, "user_a", instance.id);
    await pauseInstance(deps, "user_a", instance.id);
    const second = await make("user_a", "Second");
    await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: second.id });
    const plain = await getInstance(deps, "user_a", { instance_id: instance.id });
    expect(plain.instance.characters).toHaveLength(3);
    expect(plain).not.toHaveProperty("view");
    expect((await getInstance(deps, "user_a", { instance_id: instance.id, character_id: vale.id })).view).toBeDefined();
  });

  it("keeps the adventure's player range when characters join and leave", async () => {
    const { instance, vale, rook, make } = await table();
    // The Sunken Archive takes 1 to 4 characters.
    for (const name of ["Third", "Fourth"]) await addCharacter(deps, "user_c", { instance_id: instance.id, character_id: (await make("user_c", name)).id });
    const fifth = await make("user_c", "Fifth");
    expect(await code(addCharacter(deps, "user_c", { instance_id: instance.id, character_id: fifth.id }))).toBe("conflict");
    await startInstance(deps, "user_a", instance.id);
    await pauseInstance(deps, "user_a", instance.id);
    expect(await code(addCharacter(deps, "user_c", { instance_id: instance.id, character_id: fifth.id }))).toBe("conflict");
    expect(await store.getCharacter(fifth.id)).toMatchObject({ status: "available", instance_id: null });
    const ids = (await store.instanceView(instance.id))!.characters.map((c) => c.id).filter((id) => id !== vale.id && id !== rook.id);
    for (const id of [...ids, rook.id]) await removeCharacter(deps, "user_a", { instance_id: instance.id, character_id: id });
    // The last character stays: a paused game keeps its minimum, so it can resume.
    expect(await code(removeCharacter(deps, "user_a", { instance_id: instance.id, character_id: vale.id }))).toBe("conflict");
    expect((await resumeInstance(deps, "user_a", instance.id)).status).toBe("active");
  });

  it("pauses a running game that a member's removal leaves below the minimum, and will not resume it", async () => {
    const campaign = await createCampaign(store, "user_a", { title: "Rook alone", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
    await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", campaign.id, e)).invite_link_code);
    const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Solo" }, e);
    const rook = await createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "fighter", abilities: SIX } }, e);
    await addCharacter(deps, "user_b", { instance_id: instance.id, character_id: rook.id });
    await startInstance(deps, "user_a", instance.id);
    await leaveCampaign(deps, "user_b", campaign.id);
    expect(await store.instanceView(instance.id)).toMatchObject({ status: "paused", characters: [] });
    expect(await store.getCharacter(rook.id)).toMatchObject({ status: "available", instance_id: null });
    expect(await code(resumeInstance(deps, "user_a", instance.id))).toBe("conflict");
    expect((await store.instanceView(instance.id))!.status).toBe("paused");
  });

  it("takes a leaving member's characters out of a running instance", async () => {
    const { campaign, instance, rook } = await table();
    await startInstance(deps, "user_a", instance.id);
    await leaveCampaign(deps, "user_b", campaign.id);
    expect((await store.instanceView(instance.id))!.characters.map((c) => c.id)).not.toContain(rook.id);
    expect(await store.getCharacter(rook.id)).toMatchObject({ status: "available" });
  });

  it("ends the instances of a deleted campaign, which its author can restore", async () => {
    const { campaign, instance } = await table();
    await startInstance(deps, "user_a", instance.id);
    expect(await code(deleteCampaign(deps, "user_a", { campaign_id: campaign.id, confirm: "wrong" }))).toBe("invalid_request");
    await deleteCampaign(deps, "user_a", { campaign_id: campaign.id, confirm: campaign.title });
    expect((await store.instanceView(instance.id))!.status).toBe("ended");
    expect(await code(restoreCampaign(store, "user_b", campaign.id))).toBe("not_found");
    expect((await restoreCampaign(store, "user_a", campaign.id)).id).toBe(campaign.id);
  });
});
