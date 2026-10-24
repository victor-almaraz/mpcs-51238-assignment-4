// Adventure drafts (sprint 16 exit criterion: a three-room map and one-arc adventure built in the
// editor publishes with the CLI's diagnostics and plays).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unzip, zip } from "../export/zip";
import { draftFiles } from "../materials";
import { guideAdventure } from "../materials/testing/fixtures";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCampaign } from "./campaigns";
import { createCharacter } from "./characters";
import { createDraft, deleteDraft, exportDraft, getDraft, importDraft, listDrafts, publishDraft, restoreDraft, saveDraft, validateDraft } from "./drafts";
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
    const files = [...guideAdventure()].map(([name, data]) => ({ name: `sunken_archive/${name}`, data: String(data) }));
    const { draft, diagnostics } = await importDraft(store, "user_a", zip(files), e);
    expect(diagnostics).toEqual([]);
    expect(draft.material_id).toBe("sunken_archive");
    const out = await exportDraft(store, "user_a", draft.id);
    expect(out.name).toBe("sunken_archive.zip");
    const back = unzip(out.data);
    expect([...back.keys()].sort()).toEqual([...draftFiles(draft.document).keys()].map((k) => `sunken_archive/${k}`).sort());
    expect(await code(importDraft(store, "user_a", new Uint8Array([1, 2, 3]), e))).toBe("invalid_request");
  });

  it("deletes a draft and restores it within 30 days", async () => {
    const d = await fresh();
    await deleteDraft(store, "user_a", d.id);
    expect(await code(getDraft(store, "user_a", d.id))).toBe("not_found");
    expect((await restoreDraft(store, "user_a", d.id)).id).toBe(d.id);
  });
});
