// Adventure drafts (sprint 16 exit criterion: a three-room map and one-arc adventure built in the
// editor publishes with the CLI's diagnostics and plays).

import { deflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unzip, zip } from "../export/zip";
import { draftFiles } from "../materials";
import { stationAdventure } from "../materials/testing/fixtures";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCampaign } from "./campaigns";
import { createCharacter } from "./characters";
import { copyDraft, createDraft, deleteDraft, exportDraft, getDraft, importDraft, listDrafts, publishDraft, publishSuggestion, restoreDraft, saveDraft, validateDraft } from "./drafts";
import type { Entropy } from "./entropy";
import { addCharacter, createInstance, startInstance, submitAction, type Deps } from "./instances";
import { listMaterials } from "./materials";
import { code, entropy, SIX, world } from "./testing/fixtures";

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

const fresh = (user = "user_a", id = "three_rooms") => createDraft(store, user, { material_id: id, title: "Three Rooms", system: "quest", requires_settings: [{ id: "derelict_station", versions: "^3.0" }] }, e);

/** What the editor produces for a three-room hall with one arc: reaching the east room wins. */
function threeRooms(base: Record<string, unknown>) {
  return {
    ...base,
    adventure: { ...(base.adventure as object), players: [1, 4], start: { location: "hall", room: "west", effects: [] }, endings: { won: { label: "Reached the east room" } } },
    arcs: {
      crossing: {
        id: "crossing",
        title: "The Crossing",
        stages: ["started", "done"],
        initial: "started",
        triggers: [{ id: "arrive", on: { type: "moved", location: "hall", to: "east" }, effects: [{ set_stage: { arc: "crossing", stage: "done" } }, { end_campaign: { ending: "won" } }], once: true }],
      },
    },
    locations: {
      hall: {
        id: "hall",
        kind: "authored",
        map: {
          rows: ["##############", "#...#....#...#", "#............#", "#...#....#...#", "##############"],
          rooms: {
            west: { label: "west room", area: [[1, 1, 3, 3]] },
            middle: { label: "middle room", area: [[4, 2, 1, 1], [5, 1, 4, 3]] },
            east: { label: "east room", area: [[9, 2, 1, 1], [10, 1, 3, 3]] },
          },
        },
      },
    },
  };
}

describe("drafts", () => {
  it("creates a draft with its first diagnostics, one per adventure id and owner", async () => {
    const d = await fresh();
    expect(d).toMatchObject({ material_id: "three_rooms", system: "quest", revision: 1 });
    expect(d.diagnostics.length).toBeGreaterThan(0);
    expect(d.diagnostics[0]).toMatchObject({ severity: "error", pointer: expect.stringMatching(/^\/|^$/) });
    expect(await code(fresh())).toBe("conflict");
    expect((await listDrafts(store, "user_a")).items).toMatchObject([{ id: d.id, problems: d.diagnostics.length }]);
    expect(await code(getDraft(store, "user_b", d.id))).toBe("not_found");
  });

  it("saves by revision, keeping the system fixed", async () => {
    const d = await fresh();
    const saved = await saveDraft(store, "user_a", { draft_id: d.id, document: threeRooms(d.document), revision: 1 });
    expect(saved.revision).toBe(2);
    expect(await code(saveDraft(store, "user_a", { draft_id: d.id, document: d.document, revision: 1 }))).toBe("conflict");
    const other = structuredClone(d.document) as { adventure: { system: { id: string } } };
    other.adventure.system.id = "cadmium";
    expect(await code(saveDraft(store, "user_a", { draft_id: d.id, document: other, revision: 2 }))).toBe("invalid_request");
    expect(await validateDraft(store, "user_a", d.id)).toEqual([]);
  });

  it("publishes a three-room, one-arc adventure that plays to its ending", async () => {
    const d = await fresh();
    await saveDraft(store, "user_a", { draft_id: d.id, document: threeRooms(d.document), revision: 1 });
    const material = await publishDraft(store, "user_a", { draft_id: d.id, version: "1.0.0" });
    expect(material).toMatchObject({ kind: "adventure", id: "three_rooms", version: "1.0.0" });
    expect(await code(publishDraft(store, "user_a", { draft_id: d.id, version: "1.0.0" }))).toBe("conflict");
    expect((await listMaterials(store, "user_a", { owner: "me" })).map((m) => m.id)).toEqual(["three_rooms"]);
    expect((await listMaterials(store, "user_b", {})).map((m) => m.id)).not.toContain("three_rooms");

    const campaign = await createCampaign(store, "user_a", { title: "Crossing", system: "quest", system_versions: "^1.0", materials: [{ kind: "setting", id: "derelict_station", version: "3.0.0" }, { kind: "adventure", id: "three_rooms", version: "1.0.0" }] }, e);
    expect(await code(createCampaign(store, "user_b", { title: "Mine", system: "quest", system_versions: "^1.0", materials: [{ kind: "setting", id: "derelict_station", version: "3.0.0" }, { kind: "adventure", id: "three_rooms", version: "1.0.0" }] }, e))).toBe("invalid_request");
    const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Solo" }, e);
    const vale = await createCharacter(store, "user_a", { system: "quest", name: "Vale", choices: { role: "fighter", abilities: SIX } }, e);
    await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: vale.id });
    await startInstance(deps, "user_a", instance.id);
    for (let n = 0; n < 6 && (await store.instanceView(instance.id))!.status === "active"; n++) {
      await submitAction(deps, "user_a", { instance_id: instance.id, tool: "move", args: { to_id: "east" }, idempotency_key: `cross-move-${n}` }, e);
    }
    expect(await store.instanceView(instance.id)).toMatchObject({ status: "ended", ending: "won" });
  });

  it("reports an unreachable ending before publishing, and publishes with the warning", async () => {
    const d = await fresh();
    const doc = threeRooms(d.document) as { adventure: { endings: Record<string, { label: string }> } };
    doc.adventure.endings.secret = { label: "Never" };
    await saveDraft(store, "user_a", { draft_id: d.id, document: doc, revision: 1 });
    const diagnostics = await validateDraft(store, "user_a", d.id);
    expect(diagnostics).toEqual([{ pointer: "/adventure/endings/secret", severity: "warning", code: "ending", message: expect.stringContaining("cannot be reached") }]);
    expect((await publishDraft(store, "user_a", { draft_id: d.id, version: "1.0.0" })).version).toBe("1.0.0");
  });

  it("refuses to publish while the draft has errors, or under another publisher's id", async () => {
    const d = await fresh();
    expect(await code(publishDraft(store, "user_a", { draft_id: d.id, version: "1.0.0" }))).toBe("invalid_request");
    await saveDraft(store, "user_a", { draft_id: d.id, document: threeRooms(d.document), revision: 1 });
    await publishDraft(store, "user_a", { draft_id: d.id, version: "1.0.0" });
    const theirs = await fresh("user_b");
    await saveDraft(store, "user_b", { draft_id: theirs.id, document: threeRooms(theirs.document), revision: 1 });
    expect(await code(publishDraft(store, "user_b", { draft_id: theirs.id, version: "2.0.0" }))).toBe("conflict");
  });

  it("imports and exports adventure directories as ZIPs", async () => {
    const files = [...stationAdventure()].map(([name, data]) => ({ name: `sunken_archive/${name}`, data }));
    const { draft, diagnostics } = await importDraft(store, "user_a", zip(files), e);
    expect(diagnostics).toEqual([]);
    expect(draft.material_id).toBe("sunken_archive");
    const out = await exportDraft(store, "user_a", draft.id);
    expect(out.name).toBe("sunken_archive.zip");
    const back = unzip(out.data);
    expect([...back.keys()].sort()).toEqual([...draftFiles(draft.document).keys()].map((k) => `sunken_archive/${k}`).sort());
    expect(await code(importDraft(store, "user_a", new Uint8Array([1, 2, 3]), e))).toBe("invalid_request");
  });

  it("refuses an archive that unpacks past the limit, and names exports by a valid id", async () => {
    // One deflated entry of 16 MB of spaces: about 16 KB packed.
    const packed = deflateRawSync(new Uint8Array(16 * 1024 * 1024).fill(32));
    const name = new TextEncoder().encode("adventure.yaml");
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(18, packed.length, true);
    local.setUint16(26, name.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, 8, true);
    entry.setUint32(20, packed.length, true);
    entry.setUint16(28, name.length, true);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    end.setUint32(12, 46 + name.length, true);
    end.setUint32(16, 30 + name.length + packed.length, true);
    const bomb = new Uint8Array(Buffer.concat([new Uint8Array(local.buffer), name, packed, new Uint8Array(entry.buffer), name, new Uint8Array(end.buffer)]));
    await expect(importDraft(store, "user_a", bomb, e)).rejects.toMatchObject({ code: "invalid_request", detail: expect.stringContaining("8 MB") });

    const d = await fresh();
    await saveDraft(store, "user_a", { draft_id: d.id, document: { ...d.document, adventure: { ...(d.document.adventure as object), id: '../x"\r\nSet-Cookie: a=b' } }, revision: 1 });
    expect((await exportDraft(store, "user_a", d.id)).name).toBe(`${d.material_id}.zip`);
  });

  it("deletes a draft and restores it within 30 days", async () => {
    const d = await fresh();
    await deleteDraft(store, "user_a", d.id);
    expect(await code(getDraft(store, "user_a", d.id))).toBe("not_found");
    expect((await restoreDraft(store, "user_a", d.id)).id).toBe(d.id);
  });

  it("asks for a required setting in plain words", async () => {
    const r = createDraft(store, "user_a", { material_id: "bare", title: "Bare", system: "quest", requires_settings: [] }, e);
    await expect(r).rejects.toMatchObject({ code: "invalid_request", detail: expect.not.stringContaining("requires_settings") });
  });

  it("follows the document's adventure id until the first publication, then keeps it fixed", async () => {
    const d = await fresh();
    await fresh("user_a", "taken");
    const renamed = (doc: Record<string, unknown>, id: string) => ({ ...doc, adventure: { ...(doc.adventure as object), id } });
    const doc = threeRooms(d.document);
    expect(await code(saveDraft(store, "user_a", { draft_id: d.id, document: renamed(doc, "taken"), revision: 1 }))).toBe("conflict");
    await expect(saveDraft(store, "user_a", { draft_id: d.id, document: renamed(doc, "taken"), revision: 1 })).rejects.toMatchObject({ detail: expect.stringContaining("choose a different id") });
    expect((await getDraft(store, "user_a", d.id)).material_id).toBe("three_rooms");

    await saveDraft(store, "user_a", { draft_id: d.id, document: renamed(doc, "crossing_hall"), revision: 1 });
    expect((await getDraft(store, "user_a", d.id)).material_id).toBe("crossing_hall");
    expect((await publishDraft(store, "user_a", { draft_id: d.id, version: "1.0.0" })).id).toBe("crossing_hall");
    expect((await saveDraft(store, "user_a", { draft_id: d.id, document: renamed(doc, "crossing_hall"), revision: 2 })).revision).toBe(3);
    expect(await code(saveDraft(store, "user_a", { draft_id: d.id, document: renamed(doc, "elsewhere"), revision: 3 }))).toBe("invalid_request");
  });

  it("reports placements left in the namespace of an old adventure id", async () => {
    const d = await fresh();
    const doc = threeRooms(d.document) as ReturnType<typeof threeRooms> & { entities: Record<string, unknown> };
    doc.entities = { lamp: { kind: "item", label: "lamp" } };
    (doc.locations.hall.map as Record<string, unknown>).contents = [{ ref: "old_name:lamp", at: [2, 2] }];
    await saveDraft(store, "user_a", { draft_id: d.id, document: doc, revision: 1 });
    expect(await validateDraft(store, "user_a", d.id)).toContainEqual(expect.objectContaining({ severity: "error", message: expect.stringContaining("old_name:lamp") }));
  });

  it("keeps a conflicting copy as a new draft under a free id, with its own refs renamed", async () => {
    const d = await fresh();
    const doc = threeRooms(d.document) as ReturnType<typeof threeRooms> & { entities: Record<string, unknown> };
    doc.entities = { lamp: { kind: "item", label: "lamp" } };
    (doc.locations.hall.map as Record<string, unknown>).contents = [{ ref: "three_rooms:lamp", at: [2, 2] }];
    (doc.adventure as unknown as { requires_settings: unknown[] }).requires_settings = [];
    const first = await copyDraft(store, "user_a", { document: doc, title: "Three Rooms (copy)" }, e);
    expect(first).toMatchObject({ material_id: "three_rooms_copy", title: "Three Rooms (copy)" });
    expect(((first.document.locations as typeof doc.locations).hall.map as unknown as { contents: { ref: string }[] }).contents[0]!.ref).toBe("three_rooms_copy:lamp");
    expect((first.document.adventure as { id: string }).id).toBe("three_rooms_copy");
    expect((await copyDraft(store, "user_a", { document: doc }, e)).material_id).toBe("three_rooms_copy_2");
  });

  it("suggests a version past the newest published one of the id, whichever draft published it", async () => {
    const d = await fresh();
    expect(await publishSuggestion(store, "user_a", d.id)).toMatchObject({ latest: null, version: "1.0.0" });
    await saveDraft(store, "user_a", { draft_id: d.id, document: threeRooms(d.document), revision: 1 });
    await publishDraft(store, "user_a", { draft_id: d.id, version: "1.4.0" });
    await deleteDraft(store, "user_a", d.id);
    const again = await fresh();
    await saveDraft(store, "user_a", { draft_id: again.id, document: threeRooms(again.document), revision: 1 });
    const s = await publishSuggestion(store, "user_a", again.id);
    expect(s).toMatchObject({ latest: "1.4.0", increment: "patch", version: "1.4.1" });
    expect((await publishDraft(store, "user_a", { draft_id: again.id, version: s.version })).version).toBe("1.4.1");
  });
});
