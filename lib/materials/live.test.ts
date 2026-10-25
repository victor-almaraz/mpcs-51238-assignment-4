// The editor's in-browser validation agrees with the compiler the server runs on save.

import { describe, expect, it } from "vitest";
import { compileDraft } from "./index";
import { filesToDraft, toDraftDiagnostics } from "./draft-io";
import { draftDiagnostics } from "./live";
import { plotWarnings } from "./plot";
import { derelictStation, stationAdventure } from "./testing/fixtures";

const setting = derelictStation();
const text = (files: ReturnType<typeof stationAdventure>) => new Map([...files].map(([k, v]) => [k, typeof v === "string" ? v : new TextDecoder().decode(v)]));

describe("draftDiagnostics", () => {
  it("finds no errors in the guide adventure as a draft", () => {
    const { draft } = filesToDraft(text(stationAdventure()));
    expect(draftDiagnostics(draft, [setting]).filter((d) => d.severity === "error")).toEqual([]);
  });

  it("reports schema, reference, and system_stats problems with pointers into the draft", () => {
    const { draft } = filesToDraft(text(stationAdventure()));
    (draft.entities as Record<string, unknown>).goon = { kind: "creature", label: "goon", behavior: "aggressive", system_stats: { template: "minion", hp: 0 } };
    const out = draftDiagnostics(draft, [setting]);
    expect(out).toEqual([...toDraftDiagnostics(compileDraft(draft, [setting]).diagnostics), ...plotWarnings(draft)]);
    expect(out.some((d) => d.pointer.startsWith("/entities/goon/system_stats") && d.code === "system_stats")).toBe(true);
  });

  it("reports the draft schema layer without settings", () => {
    const out = draftDiagnostics({ adventure: {} }, []);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((d) => d.severity === "error" && d.code === "schema")).toBe(true);
  });
});
