// Archiving, deleting, and restoring characters and adventure drafts (api.md, Characters and Adventure drafts).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCampaign } from "./campaigns";
import { archiveCharacter, createCharacter, deleteCharacter, getCharacter, listDeletedCharacters, restoreCharacter, unarchiveCharacter } from "./characters";
import { archiveDraft, createDraft, deleteDraft, listDeletedDrafts, publishDraft, restoreDraft, unarchiveDraft } from "./drafts";
import type { Entropy } from "./entropy";
import { addCharacter, createInstance, removeCharacter, type Deps } from "./instances";
import { code, entropy, SIX, SUNKEN, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_a", "user_b"]));
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

const rook = () => createCharacter(store, "user_a", { system: "quest", name: "Rook", choices: { role: "spy", abilities: SIX } }, e);
const draft = () => createDraft(store, "user_a", { material_id: "three_rooms", title: "Three Rooms", system: "quest", requires_settings: [{ id: "derelict_station", versions: "^3.0" }] }, e);

describe("characters", () => {
  it("archives a character out of games, and unarchives it", async () => {
    const c = await rook();
    const k = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
    const game = await createInstance(store, "user_a", { campaign_id: k.id, name: "Tuesday group" }, e);
    expect((await archiveCharacter(store, "user_a", c.id)).archived).toBe(true);
    expect(await code(archiveCharacter(store, "user_a", c.id))).toBe("conflict");
    expect(await code(addCharacter(deps, "user_a", { instance_id: game.id, character_id: c.id }))).toBe("conflict");
    expect((await unarchiveCharacter(store, "user_a", c.id)).archived).toBe(false);
    expect(await code(unarchiveCharacter(store, "user_a", c.id))).toBe("conflict");
    await addCharacter(deps, "user_a", { instance_id: game.id, character_id: c.id });
    expect(await code(archiveCharacter(store, "user_a", c.id))).toBe("conflict");
    await removeCharacter(deps, "user_a", { instance_id: game.id, character_id: c.id });
    expect((await archiveCharacter(store, "user_a", c.id)).archived).toBe(true);
  });

  it("is archived, unarchived, and listed as deleted only by its owner", async () => {
    const c = await rook();
    expect(await code(archiveCharacter(store, "user_b", c.id))).toBe("not_found");
    await deleteCharacter(store, "user_a", c.id);
    expect(await listDeletedCharacters(store, "user_b")).toEqual([]);
    expect(await code(restoreCharacter(store, "user_b", c.id))).toBe("not_found");
  });

  it("lists a deleted character for 30 days with its restore and erasure dates, archived or not", async () => {
    const c = await rook();
    await archiveCharacter(store, "user_a", c.id);
    await deleteCharacter(store, "user_a", c.id);
    const [listed] = await listDeletedCharacters(store, "user_a");
    expect(listed).toMatchObject({ id: c.id, name: "Rook", system: "quest" });
    expect(Date.parse(listed!.restorable_until) - Date.parse(listed!.deleted_at)).toBe(30 * 86_400_000);
    expect(Date.parse(listed!.erased_by) - Date.parse(listed!.deleted_at)).toBe(90 * 86_400_000);
    expect((await restoreCharacter(store, "user_a", c.id)).archived).toBe(true);
    await deleteCharacter(store, "user_a", c.id);
    await db.query("update characters set deleted_at = now() - interval '31 days' where id = $1", [c.id]);
    expect(await listDeletedCharacters(store, "user_a")).toEqual([]);
    expect(await code(restoreCharacter(store, "user_a", c.id))).toBe("conflict");
    expect(await code(getCharacter(store, "user_a", c.id))).toBe("not_found");
  });
});

describe("adventure drafts", () => {
  it("archives a draft from publishing, and unarchives it", async () => {
    const d = await draft();
    expect((await archiveDraft(store, "user_a", d.id)).archived).toBe(true);
    expect(await code(archiveDraft(store, "user_a", d.id))).toBe("conflict");
    expect(await code(publishDraft(store, "user_a", { draft_id: d.id, version: "1.0.0" }))).toBe("conflict");
    expect(await code(unarchiveDraft(store, "user_b", d.id))).toBe("not_found");
    expect((await unarchiveDraft(store, "user_a", d.id)).archived).toBe(false);
    expect(await code(unarchiveDraft(store, "user_a", d.id))).toBe("conflict");
  });

  it("lists a deleted draft for 30 days, only to its owner", async () => {
    const d = await draft();
    await deleteDraft(store, "user_a", d.id);
    expect(await listDeletedDrafts(store, "user_a")).toMatchObject([{ id: d.id, title: "Three Rooms", system: "quest" }]);
    expect(await listDeletedDrafts(store, "user_b")).toEqual([]);
    expect((await restoreDraft(store, "user_a", d.id)).id).toBe(d.id);
    expect(await listDeletedDrafts(store, "user_a")).toEqual([]);
    await deleteDraft(store, "user_a", d.id);
    await db.query("update material_drafts set deleted_at = now() - interval '31 days' where id = $1", [d.id]);
    expect(await listDeletedDrafts(store, "user_a")).toEqual([]);
  });
});
