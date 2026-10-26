// Operations (sprint 20 exit criterion: a report leads to removal and a hold; a simulated shutdown
// blocks sign-in and purges after 90 days, keeping held records).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sunkenBundles } from "../harness/scenarios";
import { openWhenClosed, shutdownPhase } from "../ops/shutdown";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { applyReport, deleteBundle, endGame, hold, inspectInstance, listBundles, operatorLog, publishBundle, removeAssetContent, removeCampaignContent, removeCharacterContent, replayInstance, setListed, settingDependents, suspend } from "./admin";
import { createDraft } from "./drafts";
import { createCampaign, joinByLink, listDeletedCampaigns, restoreCampaign, rotateInviteLink } from "./campaigns";
import { createCharacter, deleteCharacter, getCharacter, listDeletedCharacters, restoreCharacter } from "./characters";
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
  it("deletes a bundle version nothing uses, and keeps one a campaign or game uses", async () => {
    const setting = variant(richSetting(), { version: "3.2.0" });
    await publishBundle(store, "user_op", { kind: "setting", bundle: setting });
    expect(await code(deleteBundle(store, "user_a", { kind: "setting", id: "derelict_station", version: "3.2.0" }))).toBe("not_found");
    await deleteBundle(store, "user_op", { kind: "setting", id: "derelict_station", version: "3.2.0" });
    expect(await store.getBundle("setting", "derelict_station", "3.2.0")).toBeUndefined();
    expect(await code(deleteBundle(store, "user_op", { kind: "setting", id: "derelict_station", version: "3.2.0" }))).toBe("not_found");

    const { k, instance } = await game();
    await expect(deleteBundle(store, "user_op", { kind: "setting", id: "derelict_station", version: "3.0.0" })).rejects.toThrow("used by 1 campaign and 1 game");
    await db.query("delete from campaign_materials where campaign_id = $1", [k.id]);
    await expect(deleteBundle(store, "user_op", { kind: "setting", id: "derelict_station", version: "3.0.0" })).rejects.toThrow("used by 1 game");
    expect(instance.id).toBeTruthy();
    expect((await operatorLog(store, "user_op")).map((l) => l.action)).toContain("delete_bundle");
  });

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

describe("removal", () => {
  it("removes content for good: its owner neither lists nor restores it, even when they deleted it first", async () => {
    const { k, instance, rook } = await game();
    await removeCharacterContent(deps, "user_op", { character_id: rook.id, reason: "report" });
    const spare = await createCharacter(store, "user_b", { system: "quest", name: "Spare", choices: { role: "spy", abilities: SIX } }, e);
    await deleteCharacter(store, "user_b", spare.id);
    await removeCharacterContent(deps, "user_op", { character_id: spare.id, reason: "report" });
    expect(await listDeletedCharacters(store, "user_b")).toEqual([]);
    expect(await code(restoreCharacter(store, "user_b", rook.id))).toBe("not_found");
    expect(await code(restoreCharacter(store, "user_b", spare.id))).toBe("not_found");

    await removeCampaignContent(deps, "user_op", { campaign_id: k.id, reason: "report" });
    expect((await store.instanceView(instance.id))!.status).toBe("ended");
    expect(await listDeletedCampaigns(store, "user_a")).toEqual([]);
    expect(await code(restoreCampaign(store, "user_a", k.id))).toBe("not_found");
    expect(await code(removeCampaignContent(deps, "user_op", { campaign_id: "k_nothing", reason: "report" }))).toBe("not_found");
    expect(await code(removeCharacterContent(deps, "user_op", { character_id: "ch_nothing", reason: "report" }))).toBe("not_found");
    expect((await operatorLog(store, "user_op")).map((l) => l.action).reverse()).toEqual(["remove_character", "remove_character", "remove_campaign"]);
  });
});

describe("report checks", () => {
  it("refuses a blank reason before acting, and writes nothing to the log", async () => {
    const { instance, rook } = await game();
    expect(await code(removeCharacterContent(deps, "user_op", { character_id: rook.id, reason: "   " }))).toBe("invalid_request");
    expect((await getCharacter(store, "user_b", rook.id)).id).toBe(rook.id);
    expect(await code(endGame(deps, "user_op", { instance_id: instance.id, reason: " " }))).toBe("invalid_request");
    expect((await store.instanceView(instance.id))!.status).toBe("active");
    expect(await code(removeAssetContent(store, "user_op", { hash: "nothing", reason: "" }))).toBe("invalid_request");
    expect(await operatorLog(store, "user_op")).toEqual([]);
  });

  it("applies each report action only to its kinds of record, and says what it did", async () => {
    const { instance, rook } = await game();
    await expect(applyReport(deps, "user_op", { action: "hold", kind: "instance", id: instance.id, reason: "report" })).rejects.toMatchObject({ code: "invalid_request", detail: "Hold applies to a user, a character, or a campaign" });
    expect(await code(applyReport(deps, "user_op", { action: "remove", kind: "user", id: "user_b", reason: "report" }))).toBe("invalid_request");
    expect(await code(applyReport(deps, "user_op", { action: "suspend", kind: "character", id: rook.id, reason: "report" }))).toBe("invalid_request");
    expect(await code(applyReport(deps, "user_op", { action: "nonsense", kind: "user", id: "user_b", reason: "report" }))).toBe("invalid_request");
    expect(await applyReport(deps, "user_op", { action: "hold", kind: "character", id: rook.id, reason: "report" })).toBe(`Held character ${rook.id}.`);
    expect(await applyReport(deps, "user_op", { action: "end", kind: "instance", id: instance.id, reason: "report" })).toBe(`Ended game ${instance.id}.`);
    expect((await store.instanceView(instance.id))!.status).toBe("ended");
    expect(await code(applyReport(deps, "user_a", { action: "hold", kind: "user", id: "user_b", reason: "report" }))).toBe("not_found");
  });

  it("counts the drafts and adventures that only a setting version serves", async () => {
    await createDraft(store, "user_a", { material_id: "mine", title: "Mine", system: "quest", requires_settings: [{ id: "derelict_station", versions: "^3.0" }] }, e);
    expect(await settingDependents(store, "user_op", { id: "derelict_station", version: "3.0.0" })).toEqual({ drafts: 1, adventures: 1 });
    await publishBundle(store, "user_op", { kind: "setting", bundle: variant(richSetting(), { version: "3.2.0" }) });
    expect(await settingDependents(store, "user_op", { id: "derelict_station", version: "3.0.0" })).toEqual({ drafts: 0, adventures: 1 });
    expect(await code(settingDependents(store, "user_a", { id: "derelict_station", version: "3.0.0" }))).toBe("not_found");
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
