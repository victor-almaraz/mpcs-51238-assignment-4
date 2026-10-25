// Operations (sprint 20 exit criterion: a report leads to removal and a hold; a simulated shutdown
// blocks sign-in and purges after 90 days, keeping held records).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sunkenBundles } from "../harness/scenarios";
import { openWhenClosed, shutdownPhase } from "../ops/shutdown";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { endGame, hold, inspectInstance, listBundles, operatorLog, publishBundle, removeCharacterContent, replayInstance, setListed, suspend } from "./admin";
import { createCampaign, joinByLink, rotateInviteLink } from "./campaigns";
import { createCharacter, getCharacter } from "./characters";
import type { Entropy } from "./entropy";
import { handle } from "./http";
import { addCharacter, createInstance, startInstance, type Deps } from "./instances";
import { code, entropy, richSetting, SIX, SUNKEN, variant, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_op", "user_a", "user_b"]));
  await db.query("update users set operator = true where id = 'user_op'");
  e = entropy();
});
afterEach(async () => {
  await db.close();
  delete process.env.SHUTDOWN_AT;
});

async function game() {
  const k = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
  await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", k.id, e)).invite_link_code);
  const instance = await createInstance(store, "user_a", { campaign_id: k.id, name: "Tuesday group" }, e);
  const rook = await createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "spy", abilities: SIX } }, e);
  await addCharacter(deps, "user_b", { instance_id: instance.id, character_id: rook.id });
  await startInstance(deps, "user_a", instance.id);
  return { k, instance, rook };
}

describe("materials", () => {
  it("is not found for non-operators", async () => {
    expect(await code(listBundles(store, "user_a"))).toBe("not_found");
  });

  it("publishes settings and adventures with the documented checks", async () => {
    const setting = variant(richSetting(), { version: "3.2.0" });
    expect(await publishBundle(store, "user_op", { kind: "setting", bundle: setting })).toEqual({ kind: "setting", id: "derelict_station", version: "3.2.0" });
    expect(await code(publishBundle(store, "user_op", { kind: "setting", bundle: setting }))).toBe("conflict");
    expect(await code(publishBundle(store, "user_op", { kind: "setting", bundle: { nonsense: true } }))).toBe("invalid_request");
    const future = variant(richSetting(), { id: "future", version: "1.0.0" });
    future.manifest.system.versions = "^9.0";
    expect(await code(publishBundle(store, "user_op", { kind: "setting", bundle: future }))).toBe("system_mismatch");
    const orphan = variant(sunkenBundles().adventure, { id: "orphan", version: "1.0.0" });
    orphan.manifest.requires_settings = [{ id: "nowhere", versions: "^1.0", resolved: "1.0.0" }];
    expect(await code(publishBundle(store, "user_op", { kind: "adventure", bundle: orphan }))).toBe("invalid_request");
    await setListed(store, "user_op", { kind: "setting", id: "derelict_station", version: "3.2.0", listed: false });
    expect((await listBundles(store, "user_op")).find((b) => b.version === "3.2.0")!.listed).toBe(false);
  });
});

describe("replay", () => {
  it("finds nothing diverging in an instance still in the lobby", async () => {
    const k = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
    const lobby = await createInstance(store, "user_a", { campaign_id: k.id, name: "Later" }, e);
    expect(await replayInstance(store, "user_op", { instance_id: lobby.id })).toMatchObject({ matches_stored: true, diverges_at: null });
    const { instance } = await game();
    expect(await replayInstance(store, "user_op", { instance_id: instance.id })).toMatchObject({ matches_stored: true, diverges_at: null });
  });
});

describe("reports", () => {
  it("removes reported content from a running game, holds it, and records each step", async () => {
    const { instance, rook } = await game();
    expect((await inspectInstance(store, "user_op", instance.id, "report of 22 October")).state!.characters[rook.id]).toBeDefined();
    await hold(store, "user_op", { kind: "character", id: rook.id, reason: "report of 22 October" });
    await removeCharacterContent(deps, "user_op", { character_id: rook.id, reason: "report of 22 October" });
    expect(await code(getCharacter(store, "user_b", rook.id))).toBe("not_found");
    expect((await store.getInstance(instance.id))!.state!.characters[rook.id]).toBeUndefined();
    expect((await store.getUser("user_b"))!.held_at).not.toBeNull();
    await suspend(store, "user_op", { user_id: "user_b", suspended: true, reason: "report of 22 October" });
    expect(await code(createCharacter(store, "user_b", { system: "quest", name: "X", choices: {} }, e))).toBe("forbidden");
    await endGame(deps, "user_op", { instance_id: instance.id, reason: "report of 22 October" });
    expect((await store.instanceView(instance.id))!.status).toBe("ended");
    expect((await operatorLog(store, "user_op")).map((l) => l.action).reverse()).toEqual(["inspect_instance", "hold", "remove_character", "suspend", "end_game"]);
  });
});

describe("shutdown", () => {
  it("moves through notice, closed, and purge", () => {
    const at = "2026-12-15T00:00:00Z";
    expect(shutdownPhase(at, new Date("2026-11-30T00:00:00Z")).phase).toBe("none");
    expect(shutdownPhase(at, new Date("2026-12-01T00:00:00Z")).phase).toBe("notice");
    expect(shutdownPhase(at, new Date("2026-12-15T00:00:00Z")).phase).toBe("closed");
    expect(shutdownPhase(at, new Date("2027-03-15T00:00:00Z")).phase).toBe("purge");
    expect(shutdownPhase(undefined, new Date()).phase).toBe("none");
    expect(["/terms", "/privacy", "/attribution", "/closed"].every(openWhenClosed)).toBe(true);
    expect(["/sign-in", "/dashboard", "/v1/me"].some(openWhenClosed)).toBe(false);
  });

  it("stops every operation once closed", async () => {
    process.env.SHUTDOWN_AT = "2020-01-01T00:00:00Z";
    const r = await handle(new Request("https://cadmium.test/v1/me"), "user_a", deps);
    expect(r.status).toBe(503);
  });

  it("purges every record that is not held, keeping held ones", async () => {
    const { k, rook } = await game();
    await hold(store, "user_op", { kind: "character", id: rook.id, reason: "report" });
    const r = await store.shutdownPurge();
    expect(r.users).toBe(2);
    expect(await store.getUser("user_a")).toBeUndefined();
    expect(await store.getCampaign(k.id)).toBeUndefined();
    expect(await store.getUser("user_b")).toBeDefined();
    expect(await store.getCharacter(rook.id)).toBeDefined();
  });
});
