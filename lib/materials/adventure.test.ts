import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { loadAdventureBundle } from "../bundle/adventure";
import { main } from "./cli";
import { compile, compileAdventure, compileDraft, formatDiagnostic } from "./index";
import { ADVENTURE_FIXTURES, EXAMPLES, derelictStation, guideAdventure, referenceAdventure, type Files } from "./testing/fixtures";

describe("the adventure authoring guide's sunken_archive", () => {
  const result = compileAdventure(guideAdventure(), [derelictStation()]);

  it("compiles against derelict_station without diagnostics, and its bundle loads", () => {
    expect(result.diagnostics.map(formatDiagnostic)).toEqual([]);
    expect(loadAdventureBundle(JSON.parse(JSON.stringify(result.bundle)))).toBeDefined();
  });

  it("records versions, qualifies refs, and writes defaults", () => {
    const b = result.bundle!;
    expect([b.kind, b.id, b.version, b.namespace]).toEqual(["adventure", "sunken_archive", "0.1.0", "sunken_archive"]);
    expect(b.manifest.system).toEqual({ id: "quest", versions: "^1.0", modules: [], resolved: "1.2.0" });
    expect(b.manifest.requires_settings).toEqual([{ id: "derelict_station", versions: "^3.0", resolved: "3.0.0" }]);
    expect(b.flags.lift_powered).toEqual({ type: "bool", initial: false, scope: "party" });
    expect(b.arcs.map((a) => a.id)).toEqual(["find_the_core"]);
    expect(b.arcs[0]!.triggers.map((t) => [t.id, t.once])).toEqual([
      ["learn_of_core", true],
      ["power_lift", true],
      ["take_core", true],
      ["escape", false],
    ]);
    expect(b.arcs[0]!.triggers[2]!.on).toEqual({ type: "item_taken", ref: "sunken_archive:reactor_core" });
    expect(b.entities.reactor_core).toMatchObject({ kind: "item", uses: null, footprint: [1, 1] });
    expect(b.npcs.archivist!.template).toBe("base:civilian");
    const lower = b.locations.lower_archive!;
    expect(lower.kind === "generated" && lower.population.encounter_table).toBe("base:encounters_machine");
    expect(lower.kind === "generated" && lower.anchors![0]!.place.ref).toBe("sunken_archive:reactor_core");
  });

  it("compiles identically from an editor draft", () => {
    const files = guideAdventure();
    const read = (p: string) => parse(files.get(p) as string) as Record<string, unknown>;
    const byId = (dir: string) =>
      Object.fromEntries([...files.keys()].filter((p) => p.startsWith(dir)).map((p) => [read(p).id as string, read(p)]));
    const draft = {
      adventure: read("adventure.yaml"),
      flags: read("flags.yaml"),
      arcs: byId("plot/"),
      locations: byId("locations/"),
      npcs: byId("npcs/"),
      entities: read("entities/items.yaml"),
    };
    const fromDraft = compileDraft(draft, [derelictStation()]);
    expect(fromDraft.diagnostics).toEqual([]);
    expect(fromDraft.bundle).toEqual(result.bundle);
    const broken = compileDraft({ ...draft, arcs: { other: draft.arcs.find_the_core } }, [derelictStation()]);
    expect(broken.diagnostics.map(formatDiagnostic)).toEqual(["draft: arcs.other.id: id 'find_the_core' differs from its key 'other'"]);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(compileAdventure(guideAdventure(), [derelictStation()]))).toBe(JSON.stringify(result));
  });
});

describe("the adventure-packs.md reference blocks", () => {
  it("are format illustrations: compiled together, they lack the core item and a lift_powered setter", () => {
    expect(compileAdventure(referenceAdventure(), [derelictStation()]).diagnostics.map(formatDiagnostic)).toEqual([
      "locations/dock.yaml: map.contents[0].lock: no effect sets flag 'lift_powered'",
      "locations/lower_archive.yaml: anchors[0].place.ref: unknown ref 'sunken_archive:reactor_core'",
      "plot/find_the_core.yaml: triggers[1].on.ref: unknown ref 'sunken_archive:reactor_core'",
    ]);
  });
});

describe("adventure compiler fixtures", () => {
  it.each(ADVENTURE_FIXTURES)("rejects $name with $check", ({ files, settings, expected, check }) => {
    const result = compile(files(), settings ? settings() : [derelictStation()]);
    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.diagnostics.map(formatDiagnostic)).toEqual(expected);
    expect(new Set(result.diagnostics.map((d) => d.check))).toEqual(new Set([check]));
  });
});

describe("materials command line with adventures", () => {
  const run = (...argv: string[]) => {
    let stdout = "";
    let stderr = "";
    const code = main(argv, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) });
    return { code, stdout, stderr };
  };
  const write = (files: Files): string => {
    const dir = mkdtempSync(join(tmpdir(), "adventure-"));
    for (const [path, content] of files) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    return dir;
  };

  it("compiles an adventure against a setting directory or a setting bundle", () => {
    const dir = write(guideAdventure());
    const bundleFile = join(dir, "..", `${dir.split("/").pop()}-setting.json`);
    try {
      expect(run("check", "--setting", join(EXAMPLES, "derelict_station"), dir)).toEqual({ code: 0, stdout: "", stderr: "" });
      writeFileSync(bundleFile, JSON.stringify(derelictStation()));
      const built = run("build", "--setting", bundleFile, dir);
      expect(built.code).toBe(0);
      expect(JSON.parse(built.stdout).kind).toBe("adventure");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(bundleFile, { force: true });
    }
  });

  it("exit 1 without the required setting, and 2 for a setting path that cannot be read", () => {
    const dir = write(guideAdventure());
    try {
      expect(run("check", dir)).toEqual({
        code: 1,
        stdout: "",
        stderr: "adventure.yaml: requires_settings[0]: requires setting 'derelict_station' ^3.0, which is not supplied\n",
      });
      expect(run("check", "--setting", "/no/such/bundle.json", dir).code).toBe(2);
      expect(run("check", "--setting").code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
