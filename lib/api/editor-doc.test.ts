// The editor's reference helpers (components/editor/doc.ts): renaming the adventure's namespace,
// and finding where a record is used.
import { describe, expect, it } from "vitest";
import { renameNamespace, usesOf, type Doc } from "../../components/editor/doc";

const doc = {
  adventure: { id: "hall", start: { location: "cellar", room: "stairs", effects: [] }, endings: { won: { label: "Won" } } },
  flags: { lit: { type: "bool", initial: false } },
  arcs: { quest: { id: "quest", stages: ["a", "b"], initial: "a", triggers: [{ id: "t", on: { type: "moved", location: "cellar", to: "stairs" }, when: { all: [{ flag: "lit" }, { stage: ["quest", "a"] }] }, effects: [{ end_campaign: { ending: "won" } }] }] } },
  locations: { cellar: { id: "cellar", kind: "authored", map: { rows: [], rooms: {}, contents: [{ ref: "hall:lamp" }, { npc: "ann" }] } } },
  npcs: { ann: { id: "ann", name: "Ann", template: "station:crew", topics: { lamp: { label: "lamp", when: { flag: "lit" }, brief: "hall: a place" } } } },
  entities: { lamp: { kind: "item", label: "lamp", use: { effects: [{ set_flag: { flag: "lit", value: true } }] } } },
  editor: { layout: {}, snapshots: [{ name: "s", saved_at: "", document: { flags: { x: { flag: "lit" } } } }] },
} as unknown as Doc;

describe("editor references", () => {
  it("renames refs into the adventure's namespace and nothing else", () => {
    const out = renameNamespace(doc, "hall", "manor");
    expect((out.locations.cellar as { map: { contents: { ref?: string }[] } }).map.contents[0]!.ref).toBe("manor:lamp");
    expect(out.npcs.ann!.template).toBe("station:crew");
    expect(out.npcs.ann!.topics!.lamp!.brief).toBe("hall: a place");
  });

  it("counts uses in every section, entities included, outside the record and the snapshots", () => {
    expect(usesOf(doc, { kind: "flag", id: "lit" })).toEqual({ count: 3, places: ["arc quest", "NPC ann", "entity lamp"] });
    expect(usesOf(doc, { kind: "location", id: "cellar" }).places).toEqual(["the start", "arc quest"]);
    expect(usesOf(doc, { kind: "npc", id: "ann" }).places).toEqual(["location cellar"]);
    expect(usesOf(doc, { kind: "entity", id: "lamp" }).places).toEqual(["location cellar"]);
    expect(usesOf(doc, { kind: "arc", id: "quest" })).toEqual({ count: 0, places: [] });
    expect(usesOf(doc, { kind: "ending", id: "won" }).places).toEqual(["arc quest"]);
  });
});
