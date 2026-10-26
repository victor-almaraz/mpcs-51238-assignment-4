import { describe, expect, it } from "vitest";
import { draftFiles, draftPointer, filesToDraft } from "./draft-io";
import { stationAdventure } from "./testing/fixtures";

describe("draft and directory", () => {
  it("reads an adventure directory into a draft that maps back onto the same files", () => {
    const files = stationAdventure();
    const { draft, problems } = filesToDraft(files);
    expect(problems).toEqual([]);
    expect((draft.adventure as { id: string }).id).toBe("sunken_archive");
    // SPEC_ISSUES.md#draft-entity-files: entity files merge into one.
    const expected = [...files.keys()].map((k) => (k.startsWith("entities/") ? "entities/entities.yaml" : k));
    expect([...draftFiles(draft).keys()].sort()).toEqual([...new Set(expected)].sort());
  });

  it("points diagnostics into the draft", () => {
    expect(draftPointer({ file: "locations/dock.yaml", path: "map.rows[2]" })).toBe("/locations/dock/map/rows/2");
    expect(draftPointer({ file: "adventure.yaml", path: "endings" })).toBe("/adventure/endings");
    expect(draftPointer({ file: "flags.yaml", path: '["odd/key"].initial' })).toBe("/flags/odd~1key/initial");
    expect(draftPointer({ file: "draft", path: "." })).toBe("");
  });
});
