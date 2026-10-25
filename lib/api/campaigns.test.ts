// Campaigns, invitations, and instances in the lobby (sprint 12 exit criterion: a second user joins by
// code and by link; two characters join an instance; versions pin; system_mismatch rejects).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sunkenBundles } from "../harness/scenarios";
import type { Store } from "../store";
import { QUEST } from "../systems/quest";
import type { testDb } from "../store/testing/pglite";
import { createCharacter } from "./characters";
import {
  archiveCampaign,
  createCampaign,
  deleteCampaign,
  disableInviteLink,
  getCampaign,
  joinByLink,
  leaveCampaign,
  listCampaigns,
  listDeletedCampaigns,
  removeMember,
  restoreCampaign,
  rotateInviteLink,
  setMaterials,
  unarchiveCampaign,
  updateCampaign,
} from "./campaigns";
import type { Entropy } from "./entropy";
import { addCharacter, createInstance, getInstance, listInstances, removeCharacter, type Deps } from "./instances";
import { acceptInvitation, declineInvitation, invite, listInvitations, previewInvitation, revokeInvitation } from "./invitations";
import { listMaterials } from "./materials";
import { code, entropy, richSetting, SIX, SUNKEN, variant, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let e: Entropy;
let deps: Deps;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_a", "user_b", "user_c"]));
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

const campaign = (over: Record<string, unknown> = {}) => createCampaign(store, "user_a", { title: "The Sunken Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN, ...over }, e);
const character = (owner: string, system = "quest", name = "Rook") => createCharacter(store, owner, { system, name, choices: { role: "fighter", abilities: SIX } }, e);

describe("campaigns", () => {
  it("creates a campaign with its author as the only member", async () => {
    const c = await campaign({ description: "A salvage crew goes below." });
    expect(c).toMatchObject({ title: "The Sunken Archive", author_id: "user_a", system: "quest", archived: false, materials: SUNKEN, members: [{ user_id: "user_a", display_name: "A", role: "author" }], instance_ids: [], invite_link_code: null });
    expect((await listCampaigns(store, "user_a")).items.map((x) => x.id)).toEqual([c.id]);
    expect((await listCampaigns(store, "user_b")).items).toEqual([]);
  });

  it("requires one adventure and the settings it needs", async () => {
    expect(await code(campaign({ materials: [SUNKEN[0]] }))).toBe("invalid_request");
    expect(await code(campaign({ materials: [SUNKEN[1]] }))).toBe("invalid_request");
    await store.putBundle(variant(richSetting(), { id: "other_station" }), { origin: "operator" });
    expect(await code(campaign({ materials: [{ kind: "setting", id: "other_station", version: "3.0.0" }, SUNKEN[1]] }))).toBe("invalid_request");
    expect(await code(campaign({ materials: [{ kind: "setting", id: "nowhere", version: "1.0.0" }, SUNKEN[1]] }))).toBe("invalid_request");
  });

  it("rejects materials for another system, version range, or missing module with system_mismatch", async () => {
    await store.putBundle(variant(richSetting(), { id: "cadmium_station", system: "cadmium" }), { origin: "operator" });
    expect(await code(campaign({ materials: [SUNKEN[0], { kind: "setting", id: "cadmium_station", version: "3.0.0" }, SUNKEN[1]] }))).toBe("system_mismatch");
    expect(await code(campaign({ system_versions: "^2.0" }))).toBe("system_mismatch");
    await store.putBundle(variant(richSetting(), { id: "armored_station", system: "cadmium", modules: ["armor"] }), { origin: "operator" });
    const armored = [SUNKEN[0], { kind: "setting", id: "armored_station", version: "3.0.0" }, SUNKEN[1]];
    expect(await code(campaign({ system: "cadmium", materials: armored }))).toBe("system_mismatch");
    expect(await code(campaign({ system: "cadmium", modules: ["armor"], materials: armored }))).toBe("ok");
  });

  it("lets a Cadmium campaign use Quest materials", async () => {
    expect((await campaign({ system: "cadmium" })).system).toBe("cadmium");
    expect((await listMaterials(store, "user_a", { system: "cadmium" })).map((m) => m.id)).toEqual(["derelict_station", "sunken_archive"]);
    expect(await listMaterials(store, "user_a", { system: "quest", kind: "adventure" })).toMatchObject([{ kind: "adventure", id: "sunken_archive", requires_settings: [{ id: "derelict_station", versions: "^3.0" }], players: [1, 4] }]);
  });

  it("offers unlisted and other authors' materials to no one", async () => {
    await store.putBundle(variant(sunkenBundles().adventure, { id: "private_tale" }), { origin: "author", publisher_id: "user_b" });
    expect(await code(campaign({ materials: [SUNKEN[0], { kind: "adventure", id: "private_tale", version: SUNKEN[1].version }] }))).toBe("invalid_request");
    expect((await listMaterials(store, "user_b", { owner: "me" })).map((m) => m.id)).toEqual(["private_tale"]);
    expect((await listMaterials(store, "user_a", {})).map((m) => m.id)).not.toContain("private_tale");
    await store.setListed("setting", "derelict_station", "3.0.0", false);
    expect(await code(campaign())).toBe("invalid_request");
  });

  it("hides campaigns from non-members and limits editing to the author", async () => {
    const c = await campaign();
    expect(await code(getCampaign(store, "user_b", c.id))).toBe("not_found");
    await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", c.id, e)).invite_link_code);
    const seen = await getCampaign(store, "user_b", c.id);
    expect("invite_link_code" in seen).toBe(false);
    expect(await code(updateCampaign(store, "user_b", { campaign_id: c.id, title: "Mine" }))).toBe("forbidden");
    expect((await updateCampaign(store, "user_a", { campaign_id: c.id, title: "Below" })).title).toBe("Below");
    expect(await code(updateCampaign(store, "user_a", { campaign_id: c.id, modules: ["armor"] }))).toBe("invalid_request");
  });
});

// SPEC_ISSUES.md#campaign-unarchive
describe("archiving and deleting", () => {
  it("unarchives a campaign for its author only, and lists it as archived until then", async () => {
    const c = await campaign();
    await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", c.id, e)).invite_link_code);
    expect(await code(unarchiveCampaign(store, "user_a", c.id))).toBe("conflict");
    await archiveCampaign(store, "user_a", c.id);
    expect((await listCampaigns(store, "user_b", { archived: true })).items.map((x) => x.id)).toEqual([c.id]);
    expect((await listCampaigns(store, "user_b", { archived: false })).items).toEqual([]);
    expect(await code(unarchiveCampaign(store, "user_b", c.id))).toBe("forbidden");
    expect((await unarchiveCampaign(store, "user_a", c.id)).archived).toBe(false);
    expect((await listCampaigns(store, "user_b", { archived: false })).items.map((x) => x.id)).toEqual([c.id]);
  });

  it("lists the author's deleted campaigns with their stage dates until restored, and hides them from members", async () => {
    const c = await campaign();
    await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", c.id, e)).invite_link_code);
    await deleteCampaign(deps, "user_a", { campaign_id: c.id, confirm: c.title });
    const [d] = await listDeletedCampaigns(store, "user_a");
    expect(d).toMatchObject({ id: c.id, title: c.title, system: "quest" });
    expect(Date.parse(d!.restorable_until) - Date.parse(d!.deleted_at)).toBe(30 * 86_400_000);
    expect(Date.parse(d!.erased_by) - Date.parse(d!.deleted_at)).toBe(90 * 86_400_000);
    expect(await listDeletedCampaigns(store, "user_b")).toEqual([]);
    expect(await code(getCampaign(store, "user_b", c.id))).toBe("not_found");
    expect((await listCampaigns(store, "user_b")).items).toEqual([]);
    await restoreCampaign(store, "user_a", c.id);
    expect(await listDeletedCampaigns(store, "user_a")).toEqual([]);
    expect((await getCampaign(store, "user_b", c.id)).id).toBe(c.id);
  });

  it("stops listing a deletion once the 30 days to restore it have passed", async () => {
    const c = await campaign();
    await deleteCampaign(deps, "user_a", { campaign_id: c.id, confirm: c.title });
    await db.query("update campaigns set deleted_at = now() - interval '31 days' where id = $1", [c.id]);
    expect(await listDeletedCampaigns(store, "user_a")).toEqual([]);
    expect(await code(restoreCampaign(store, "user_a", c.id))).toBe("conflict");
  });
});

describe("joining", () => {
  it("admits a second user by invitation code, once", async () => {
    const c = await campaign();
    const { invitation, code: secret, url } = await invite(store, "user_a", { campaign_id: c.id, message: "Join us Tuesdays.", note: "for Rook" }, e);
    expect(url).toBe(`/invite/${secret}`);
    expect(invitation).toMatchObject({ campaign_title: "The Sunken Archive", inviter: { user_id: "user_a", display_name: "A" }, note: "for Rook", status: "pending" });
    expect(await previewInvitation(store, secret.toLowerCase())).toMatchObject({ campaign_title: "The Sunken Archive", inviter_display_name: "A", message: "Join us Tuesdays.", status: "pending" });
    expect((await acceptInvitation(store, "user_b", secret)).members.map((m) => m.user_id)).toEqual(["user_a", "user_b"]);
    expect(await code(acceptInvitation(store, "user_c", secret))).toBe("conflict");
    expect((await listInvitations(store, "user_b", { campaign_id: c.id }))[0]).toMatchObject({ status: "accepted", note: "for Rook" });
    expect(await code(previewInvitation(store, "NO-SUCH-CODE"))).toBe("not_found");
  });

  it("declines, revokes, and expires invitations", async () => {
    const c = await campaign();
    const declined = await invite(store, "user_a", { campaign_id: c.id }, e);
    await declineInvitation(store, "user_b", declined.code);
    expect(await code(acceptInvitation(store, "user_b", declined.code))).toBe("conflict");
    const revoked = await invite(store, "user_a", { campaign_id: c.id }, e);
    await revokeInvitation(store, "user_a", revoked.invitation.id);
    expect(await code(acceptInvitation(store, "user_b", revoked.code))).toBe("conflict");
    const late = await invite(store, "user_a", { campaign_id: c.id }, e);
    await db.query("update invitations set expires_at = now() - interval '1 second' where id = $1", [late.invitation.id]);
    expect((await previewInvitation(store, late.code)).status).toBe("expired");
    expect(await code(acceptInvitation(store, "user_b", late.code))).toBe("conflict");
    expect(await listInvitations(store, "user_a", { campaign_id: c.id, status: "expired" })).toHaveLength(1);
  });

  it("lets only the inviter or the author revoke", async () => {
    const c = await campaign();
    await acceptInvitation(store, "user_b", (await invite(store, "user_a", { campaign_id: c.id }, e)).code);
    await acceptInvitation(store, "user_c", (await invite(store, "user_a", { campaign_id: c.id }, e)).code);
    const byB = await invite(store, "user_b", { campaign_id: c.id }, e);
    expect(await code(revokeInvitation(store, "user_c", byB.invitation.id))).toBe("forbidden");
    expect(await code(revokeInvitation(store, "user_a", byB.invitation.id))).toBe("ok");
  });

  it("admits any number of users by invite link until it is rotated or disabled", async () => {
    const c = await campaign();
    const first = (await rotateInviteLink(store, "user_a", c.id, e)).invite_link_code;
    expect(first).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    await joinByLink(store, "user_b", first);
    const second = (await rotateInviteLink(store, "user_a", c.id, e)).invite_link_code;
    expect(await code(joinByLink(store, "user_c", first))).toBe("not_found");
    expect((await joinByLink(store, "user_c", second)).members).toHaveLength(3);
    await disableInviteLink(store, "user_a", c.id);
    expect(await code(joinByLink(store, "user_c", second))).toBe("not_found");
  });

  it("accepts no members, invitations, or instances once archived", async () => {
    const c = await campaign();
    const pending = await invite(store, "user_a", { campaign_id: c.id }, e);
    await archiveCampaign(store, "user_a", c.id);
    expect(await code(acceptInvitation(store, "user_b", pending.code))).toBe("conflict");
    expect(await code(invite(store, "user_a", { campaign_id: c.id }, e))).toBe("conflict");
    expect(await code(rotateInviteLink(store, "user_a", c.id, e))).toBe("conflict");
    expect(await code(createInstance(store, "user_a", { campaign_id: c.id, name: "Late" }, e))).toBe("conflict");
  });
});

describe("instances", () => {
  async function party() {
    const c = await campaign();
    await joinByLink(store, "user_b", (await rotateInviteLink(store, "user_a", c.id, e)).invite_link_code);
    const instance = await createInstance(store, "user_a", { campaign_id: c.id, name: "Tuesday group" }, e);
    return { c, instance };
  }

  it("pins the system version and the campaign's materials at creation", async () => {
    const { c, instance } = await party();
    expect(instance).toMatchObject({ campaign_id: c.id, name: "Tuesday group", system: "quest", system_version: QUEST.VERSION, status: "lobby", version: 0, materials: SUNKEN, characters: [] });
    await store.putBundle(variant(richSetting(), { version: "3.1.0" }), { origin: "operator" });
    await setMaterials(store, "user_a", { campaign_id: c.id, materials: [{ ...SUNKEN[0], version: "3.1.0" }, SUNKEN[1]] });
    const later = await createInstance(store, "user_a", { campaign_id: c.id, name: "Thursday group" }, e);
    expect(later.materials[0]!.version).toBe("3.1.0");
    expect((await getInstance(deps, "user_b", { instance_id: instance.id })).instance.materials[0]!.version).toBe("3.0.0");
    expect((await listInstances(store, "user_b", c.id)).map((i) => i.name)).toEqual(["Tuesday group", "Thursday group"]);
    expect(await code(createInstance(store, "user_a", { campaign_id: c.id, name: "Tuesday group" }, e))).toBe("conflict");
    expect(await code(createInstance(store, "user_b", { campaign_id: c.id, name: "Mine" }, e))).toBe("forbidden");
  });

  it("takes two players' characters, one instance at a time", async () => {
    const { c, instance } = await party();
    const rook = await character("user_b");
    const vale = await character("user_a", "quest", "Vale");
    await addCharacter(deps, "user_b", { instance_id: instance.id, character_id: rook.id });
    const full = await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: vale.id });
    expect(full.characters).toEqual([
      { id: rook.id, user_id: "user_b", name: "Rook" },
      { id: vale.id, user_id: "user_a", name: "Vale" },
    ]);
    expect((await store.getCharacter(rook.id))).toMatchObject({ status: "in_instance", instance_id: instance.id });
    const other = await createInstance(store, "user_a", { campaign_id: c.id, name: "Other" }, e);
    expect(await code(addCharacter(deps, "user_b", { instance_id: other.id, character_id: rook.id }))).toBe("conflict");
    expect(await code(addCharacter(deps, "user_a", { instance_id: other.id, character_id: rook.id }))).toBe("not_found");
    expect(await code(addCharacter(deps, "user_c", { instance_id: instance.id, character_id: rook.id }))).toBe("not_found");
  });

  it("rejects a character of another system with system_mismatch, and lets Cadmium take Quest characters", async () => {
    const { instance } = await party();
    const cad = await character("user_b", "cadmium");
    expect(await code(addCharacter(deps, "user_b", { instance_id: instance.id, character_id: cad.id }))).toBe("system_mismatch");
    const k = await campaign({ system: "cadmium" });
    const cadInstance = await createInstance(store, "user_a", { campaign_id: k.id, name: "Cadmium group" }, e);
    const quest = await character("user_a", "quest", "Vale");
    expect((await addCharacter(deps, "user_a", { instance_id: cadInstance.id, character_id: quest.id })).characters).toHaveLength(1);
  });

  it("removes characters by owner or author, and when a member leaves", async () => {
    const { c, instance } = await party();
    const rook = await character("user_b");
    await addCharacter(deps, "user_b", { instance_id: instance.id, character_id: rook.id });
    expect((await removeCharacter(deps, "user_a", { instance_id: instance.id, character_id: rook.id })).characters).toEqual([]);
    expect((await store.getCharacter(rook.id))!.status).toBe("available");
    await addCharacter(deps, "user_b", { instance_id: instance.id, character_id: rook.id });
    await leaveCampaign(deps, "user_b", c.id);
    expect((await store.getCharacter(rook.id))).toMatchObject({ status: "available", instance_id: null });
    expect(await code(getCampaign(store, "user_b", c.id))).toBe("not_found");
    expect(await code(leaveCampaign(deps, "user_a", c.id))).toBe("conflict");
  });
});
