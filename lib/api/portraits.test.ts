// Portrait uploads (sprint 23 exit criterion: a portrait is uploaded, exported, deleted, and removable
// after a report).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../export/sha256";
import { unzip } from "../export/zip";
import { png } from "../materials/testing/fixtures";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { exportMyData } from "./account";
import { removeAssetContent } from "./admin";
import { uploadAsset } from "./assets";
import { createCharacter, deleteCharacter, getCharacter, restoreCharacter, updateCharacter } from "./characters";
import type { Entropy } from "./entropy";
import { handle } from "./http";
import { createCampaign } from "./campaigns";
import { addCharacter, createInstance, removeCharacter, type Deps } from "./instances";
import { code, entropy, SIX, SUNKEN, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_a", "user_b", "user_op"]));
  await db.query("update users set operator = true where id = 'user_op'");
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

const IMAGE = png(256, 256);
const rook = () => createCharacter(store, "user_a", { system: "quest", name: "Rook", choices: { role: "spy", abilities: SIX } }, e);
const get = (hash: string, user = "user_a") => handle(new Request(`https://cadmium.test/v1/assets/${hash}`), user, deps);

describe("portraits", () => {
  it("uploads a portrait once by hash and sets it on a character", async () => {
    const asset = await uploadAsset(store, "user_a", { kind: "portrait", alt: "A wary spy in a grey hood.", credit: "Drawn by me" }, IMAGE);
    expect(asset).toMatchObject({ hash: sha256(IMAGE), kind: "portrait", mime: "image/png", width: 256, height: 256, license: "NOASSERTION", credit: "Drawn by me" });
    expect((await uploadAsset(store, "user_b", { kind: "portrait", alt: "Same file" }, IMAGE)).alt).toBe("A wary spy in a grey hood.");
    // The identical file is stored once, and each uploader may use it.
    const bo = await createCharacter(store, "user_b", { system: "quest", name: "Bo", choices: { role: "spy", abilities: SIX } }, e);
    expect((await updateCharacter(store, "user_b", { character_id: bo.id, portrait: asset.hash })).portrait).toBe(asset.hash);
    const c = await rook();
    expect((await updateCharacter(store, "user_a", { character_id: c.id, portrait: asset.hash })).portrait).toBe(asset.hash);
    const res = await get(asset.hash);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(IMAGE);
  });

  it("changes the portrait of a character in a game, and refuses a sheet edit there before changing anything", async () => {
    const asset = await uploadAsset(store, "user_a", { kind: "portrait", alt: "A wary spy." }, IMAGE);
    const c = await rook();
    const k = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
    const lobby = await createInstance(store, "user_a", { campaign_id: k.id, name: "Lobby" }, e);
    await addCharacter(deps, "user_a", { instance_id: lobby.id, character_id: c.id });
    expect(await code(updateCharacter(store, "user_a", { character_id: c.id, name: "Renamed", portrait: asset.hash }))).toBe("conflict");
    expect(await getCharacter(store, "user_a", c.id)).toMatchObject({ name: "Rook", portrait: null });
    expect(await updateCharacter(store, "user_a", { character_id: c.id, portrait: asset.hash })).toMatchObject({ name: "Rook", portrait: asset.hash });
    await removeCharacter(deps, "user_a", { instance_id: lobby.id, character_id: c.id });
    expect(await updateCharacter(store, "user_a", { character_id: c.id, name: "Renamed", portrait: null })).toMatchObject({ name: "Renamed", portrait: null });
  });

  it("rejects other kinds, types, sizes, and other users' uploads", async () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");
    expect(await code(uploadAsset(store, "user_a", { kind: "portrait", alt: "x" }, svg))).toBe("invalid_request");
    expect(await code(uploadAsset(store, "user_a", { kind: "icon", alt: "x" }, IMAGE))).toBe("invalid_request");
    expect(await code(uploadAsset(store, "user_a", { kind: "portrait", alt: "x" }, png(2048, 2048)))).toBe("invalid_request");
    expect(await code(uploadAsset(store, "user_a", { kind: "portrait", alt: "" }, IMAGE))).toBe("invalid_request");
    const theirs = await uploadAsset(store, "user_b", { kind: "portrait", alt: "Bo's" }, png(32, 32));
    const c = await rook();
    expect(await code(updateCharacter(store, "user_a", { character_id: c.id, portrait: theirs.hash }))).toBe("invalid_request");
  });

  it("exports the image and its record", async () => {
    const asset = await uploadAsset(store, "user_a", { kind: "portrait", alt: "A wary spy." }, IMAGE);
    await updateCharacter(store, "user_a", { character_id: (await rook()).id, portrait: asset.hash });
    const files = unzip(await exportMyData(store, "user_a"));
    expect(files.get(`assets/${asset.hash}.png`)).toEqual(IMAGE);
    expect(JSON.parse(new TextDecoder().decode(files.get(`assets/${asset.hash}.json`)!))).toMatchObject({ hash: asset.hash, alt: "A wary spy.", uploader_id: "user_a" });
  });

  it("is removable after a report: it stops being served and the character keeps its name", async () => {
    const asset = await uploadAsset(store, "user_a", { kind: "portrait", alt: "A wary spy." }, IMAGE);
    const c = await rook();
    await updateCharacter(store, "user_a", { character_id: c.id, portrait: asset.hash });
    await removeAssetContent(store, "user_op", { hash: asset.hash, reason: "report of 23 October" });
    expect((await get(asset.hash)).status).toBe(404);
    expect((await getCharacter(store, "user_a", c.id)).name).toBe("Rook");
    expect(await code(updateCharacter(store, "user_a", { character_id: c.id, portrait: asset.hash }))).toBe("invalid_request");
  });

  it("is erased once no record refers to it: after Remove portrait, or with its character", async () => {
    const asset = await uploadAsset(store, "user_a", { kind: "portrait", alt: "A wary spy." }, IMAGE);
    const c = await rook();
    await updateCharacter(store, "user_a", { character_id: c.id, portrait: asset.hash });
    expect((await store.purgeContent(new Date())).assets).toBe(0);
    await updateCharacter(store, "user_a", { character_id: c.id, portrait: null });
    expect((await store.purgeContent(new Date())).assets).toBe(1);
    expect(await store.assetMeta(asset.hash)).toBeUndefined();

    const again = await uploadAsset(store, "user_a", { kind: "portrait", alt: "Again." }, png(128, 128));
    const d = await rook();
    await updateCharacter(store, "user_a", { character_id: d.id, portrait: again.hash });
    await deleteCharacter(store, "user_a", d.id);
    expect((await restoreCharacter(store, "user_a", d.id)).id).toBe(d.id);
    await deleteCharacter(store, "user_a", d.id);
    await db.query("update characters set deleted_at = now() - interval '91 days' where id = $1", [d.id]);
    expect(await store.purgeContent(new Date())).toEqual({ characters: 1, drafts: 0, assets: 1 });
  });
});
