import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BundleError, loadSettingBundle } from "../bundle/setting";
import { imageSize } from "./art";
import { main } from "./cli";
import { CHECKS, compile, formatDiagnostic } from "./index";
import { satisfies } from "./semver";
import { EXAMPLES, SETTING_FIXTURES, at, edit, example, png } from "./testing/fixtures";

describe("example setting packs", () => {
  it.each(["derelict_station", "sunless_crypt"] as const)("%s compiles without diagnostics and its bundle loads", (name) => {
    const result = compile(example(name));
    expect(result.diagnostics.map(formatDiagnostic)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(loadSettingBundle(JSON.parse(JSON.stringify(result.bundle)))).toBeDefined();
  });

  it("qualifies refs, writes engine defaults, and adds built-in terrain and conditions", () => {
    const b = compile(example("derelict_station")).bundle!;
    expect([b.kind, b.format_version, b.id, b.version, b.namespace]).toEqual(["setting", 2, "derelict_station", "3.0.0", "base"]);
    expect(b.manifest.system).toEqual({ id: "quest", versions: "^1.0", modules: [], resolved: "1.2.0" });
    expect(b.manifest.generation).toEqual({ door: "base:hatch", locks: { "base:bulkhead": "base:keycard", "base:airlock_door": "base:override_code" } });
    expect(b.manifest.starting_items).toEqual({ table: "base:starting_kit", picks: 2 });
    expect(b.manifest.terrain.floor).toEqual({ label: "floor", obstructs: [], cost: 1, tags: [] });
    expect(b.manifest.terrain.coolant).toEqual({ label: "coolant pool", obstructs: [], cost: 2, tags: ["hazard"] });
    expect(Object.keys(b.conditions)).toEqual(["incapacitated", "hidden", "irradiated", "panicked"]);
    expect(b.entities.wrench).toMatchObject({ footprint: [1, 1], uses: null });
    expect(b.entities.hatch).toMatchObject({ footprint: [1, 1], obstructs: ["movement", "sight"], open: false });
    expect(b.entities.airlock_door).toMatchObject({ obstructs: ["movement"] });
    expect(b.entities.locker).toMatchObject({ obstructs: [], cover: false, contents: { table: "base:locker_loot", picks: 2 } });
    expect(b.entities.control_panel).toMatchObject({ verbs: { operate: { requirement: { has_item: "base:keycard" } } } });
    expect(b.entities.crate_stack).toMatchObject({ remains: "base:scrap", obstructs: ["movement", "sight"], cover: true });
    expect(b.tables.drone_parts).toEqual([{ weight: 1, ref: "base:battery" }]);
    expect(b.rooms.reactor_room!.map.legend!.o).toEqual({ terrain: "floor", place: "base:support_pillar" });
    expect(b.rooms.reactor_room!.contents![0]).toEqual({ ref: "base:control_panel", at: [3, 0] });
  });

  it("accepts module fields when the pack declares the module", () => {
    const files = edit(
      edit(example("derelict_station"), "manifest.yaml", (d) => (d.system = { id: "cadmium", versions: "^1.0", modules: ["armor"] })),
      "entities/items.yaml",
      (d) => (at(d, "blast_shield").system_stats = { armor: 4 }),
    );
    const result = compile(files);
    expect(result.diagnostics).toEqual([]);
    expect(result.bundle!.manifest.system).toEqual({ id: "cadmium", versions: "^1.0", modules: ["armor"], resolved: "1.0.0" });
  });

  it("is deterministic", () => {
    expect(JSON.stringify(compile(example("sunless_crypt")))).toBe(JSON.stringify(compile(example("sunless_crypt"))));
  });
});

describe("setting compiler fixtures", () => {
  it.each(SETTING_FIXTURES)("rejects $name with $check", ({ files, expected, check }) => {
    const result = compile(files());
    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.diagnostics.map(formatDiagnostic)).toEqual(expected);
    expect(new Set(result.diagnostics.map((d) => d.check))).toEqual(new Set([check]));
  });

  it("has a fixture for every check", () => {
    expect(new Set(SETTING_FIXTURES.map((f) => f.check))).toEqual(new Set(Object.keys(CHECKS)));
  });
});

describe("materials command line", () => {
  const run = (...argv: string[]) => {
    let stdout = "";
    let stderr = "";
    const code = main(argv, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) });
    return { code, stdout, stderr };
  };
  const pack = join(EXAMPLES, "sunless_crypt");

  it("check: exit 0 and writes nothing for a valid pack", () => {
    expect(run("check", pack)).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(run("check", "--", pack).code).toBe(0);
  });

  it("build: writes only the bundle to stdout", () => {
    const { code, stdout, stderr } = run("build", pack);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout).id).toBe("sunless_crypt");
  });

  it("build -o: writes the bundle atomically to FILE", () => {
    const dir = mkdtempSync(join(tmpdir(), "materials-"));
    try {
      const file = join(dir, "bundle.json");
      expect(run("build", "-o", file, pack)).toEqual({ code: 0, stdout: "", stderr: "" });
      expect(JSON.parse(readFileSync(file, "utf8")).namespace).toBe("crypt");
      expect(readdirSync(dir)).toEqual(["bundle.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exit 1 with FILE: PATH: MESSAGE lines on stderr, or JSON lines with --json, and no bundle", () => {
    const dir = mkdtempSync(join(tmpdir(), "materials-"));
    try {
      for (const [path, content] of edit(example("sunless_crypt"), "entities/creatures.yaml", (d) => (at(d, "skeleton", "system_stats").template = "goon"))) {
        const full = join(dir, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
      const text = run("build", dir);
      expect(text.code).toBe(1);
      expect(text.stdout).toBe("");
      expect(text.stderr).toBe("entities/creatures.yaml: skeleton.system_stats.template: quest creature: 'goon' is not one of ['commoner', 'minion', 'boss']\n");
      const json = run("check", "--json", dir);
      expect(json.code).toBe(1);
      expect(JSON.parse(json.stderr)).toEqual({
        file: "entities/creatures.yaml",
        path: "skeleton.system_stats.template",
        message: "quest creature: 'goon' is not one of ['commoner', 'minion', 'boss']",
        check: "system_stats",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    [["lint", pack]],
    [["check"]],
    [["check", "--fast", pack]],
    [["check", "/no/such/dir"]],
    [["check", pack, pack]],
    [["build", "-o"]],
    [[]],
  ])("exit 2 for usage errors: %j", (argv) => {
    const { code, stdout } = run(...argv);
    expect(code).toBe(2);
    expect(stdout).toBe("");
  });

  it("prints help and version", () => {
    expect(run("--help").stdout).toContain("materials check [--json] [--] DIR");
    expect(run("--version").stdout).toMatch(/^materials \d+\.\d+\.\d+ \(format_version 2\)\n$/);
  });
});

describe("version ranges", () => {
  it.each([
    ["1.2.0", "^1.0", true],
    ["1.0.0", "^1.0", true],
    ["2.0.0", "^1.0", false],
    ["0.9.9", "^1.0", false],
    ["1.2.0", "^1", true],
    ["0.2.5", "^0.2", true],
    ["0.3.0", "^0.2", false],
    ["1.2.9", "~1.2", true],
    ["1.3.0", "~1.2", false],
    ["1.2.3", "1.2.3", true],
    ["1.2.4", "1.2.3", false],
    ["1.4.0", "1", true],
    ["1.2.0", "1.2", true],
    ["1.3.0", "1.2", false],
  ])("%s satisfies %s: %s", (version, range, ok) => {
    expect(satisfies(version, range)).toBe(ok);
  });
});

describe("bundle loader", () => {
  it("fails on unknown fields", () => {
    const bundle = JSON.parse(JSON.stringify(compile(example("sunless_crypt")).bundle));
    expect(() => loadSettingBundle({ ...bundle, extra: 1 })).toThrow(BundleError);
    expect(() => loadSettingBundle({ ...bundle, entities: { ...bundle.entities, mace: { ...bundle.entities.mace, heft: 3 } } })).toThrow(/entities.mace: unknown field 'heft'/);
    expect(() => loadSettingBundle({ ...bundle, manifest: { ...bundle.manifest, system: { ...bundle.manifest.system, pinned: true } } })).toThrow(BundleError);
    expect(() => loadSettingBundle({ ...bundle, format_version: 1 })).toThrow(BundleError);
  });
});

describe("image sizes", () => {
  it("reads PNG and WebP dimensions", () => {
    expect(imageSize("png", png(300, 200))).toEqual({ width: 300, height: 200 });
    const vp8x = new Uint8Array(30);
    vp8x.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
    vp8x.set([..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 8);
    vp8x.set([0xff, 0x03, 0x00, 0x7f, 0x00, 0x00], 24); // 1024 x 128
    expect(imageSize("webp", vp8x)).toEqual({ width: 1024, height: 128 });
    expect(imageSize("png", new Uint8Array(30))).toBeNull();
  });
});
