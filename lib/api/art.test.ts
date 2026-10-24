// Pack art (sprint 22 exit criterion: example packs render with and without art).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../export/sha256";
import { view } from "../engine";
import { sunkenBundles } from "../harness/scenarios";
import { plan } from "../map/plan";
import { compileSetting, withFiles } from "../materials";
import { edit, example, png } from "../materials/testing/fixtures";
import { parserContext } from "../parser/context";
import { startInstance } from "../engine";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { publishBundle } from "./admin";
import { handle } from "./http";
import type { Deps } from "./instances";
import { code, world } from "./testing/fixtures";

const PORTRAIT = png(64, 64);
const ICON = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>');

/** derelict_station 3.1.0 with a portrait for the maintenance drone and an icon for the control panel. */
function artFiles() {
  let files = new Map(example("derelict_station"));
  files = edit(files, "manifest.yaml", (d) => void (d.version = "3.1.0"));
  files = edit(files, "entities/creatures.yaml", (d) => void ((d.maintenance_drone as Record<string, unknown>).art = ["base:drone_portrait"]));
  files = edit(files, "entities/fixtures.yaml", (d) => void ((d.control_panel as Record<string, unknown>).art = ["base:panel_icon"]));
  files.set(
    "assets.yaml",
    `drone_portrait:
  kind: portrait
  source: { file: assets/drone.png }
  alt: A battered maintenance drone.
  license: CC-BY-4.0
  credit: Drawn by A. Artist
panel_icon:
  kind: icon
  source: { file: assets/panel.svg }
  alt: A control panel.
`,
  );
  files.set("assets/drone.png", PORTRAIT);
  files.set("assets/panel.svg", ICON);
  return files;
}

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_op"]));
  await db.query("update users set operator = true where id = 'user_op'");
});
afterEach(async () => {
  await db.close();
});

describe("pack art", () => {
  it("compiles file assets with their hashes and ships the bytes beside the bundle", () => {
    const r = compileSetting(artFiles());
    expect(r.diagnostics).toEqual([]);
    expect(r.bundle!.assets.drone_portrait).toMatchObject({ kind: "portrait", hash: sha256(PORTRAIT), mime: "image/png" });
    expect(Object.keys(r.files!).sort()).toEqual([sha256(PORTRAIT), sha256(ICON)].sort());
    const built = withFiles(r.bundle!, r.files) as { files: Record<string, { mime: string; width?: number }> };
    expect(built.files[sha256(PORTRAIT)]).toMatchObject({ mime: "image/png", width: 64 });
  });

  it("publishes the files, serves them by hash as images, and credits them", async () => {
    const r = compileSetting(artFiles());
    const built = withFiles(r.bundle!, r.files);
    const bad = structuredClone(built) as { files: Record<string, { data: string }> };
    bad.files[sha256(ICON)]!.data = btoa("tampered");
    expect(await code(publishBundle(store, "user_op", { kind: "setting", bundle: bad }))).toBe("invalid_request");
    await publishBundle(store, "user_op", { kind: "setting", bundle: built });
    const res = await handle(new Request(`https://cadmium.test/v1/assets/${sha256(ICON)}`), "user_op", deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(ICON);
    expect((await store.packCredits()).find((c) => c.credit === "Drawn by A. Artist")).toMatchObject({ license: "CC-BY-4.0", bundle_refs: [{ bundle_id: "setting:derelict_station@3.1.0", key: "drone_portrait" }] });
    await store.removeAsset(sha256(ICON));
    expect((await handle(new Request(`https://cadmium.test/v1/assets/${sha256(ICON)}`), "user_op", deps)).status).toBe(404);
  });

  it("renders with art where the pack declares it, and without it otherwise", () => {
    const withArt = compileSetting(artFiles()).bundle!;
    const adventure = sunkenBundles().adventure;
    for (const [settings, art] of [
      [[withArt], true],
      [sunkenBundles().settings, false],
    ] as const) {
      const bundles = { ...sunkenBundles(), settings };
      const r = startInstance({ bundles: { ...bundles, adventure }, characters: [{ id: "c_1", sheet: { name: "Vale", role: "fighter", hp: { value: 10, max: 10 }, ap: 10, abilities: [], inventory: [], status: "active" } as never }], seed: 11n });
      expect(r.ok).toBe(true);
      const s = r.ok ? r.state : null!;
      // Walk into the hangar, where the control panel stands.
      const panel = Object.keys(s.entities).find((id) => s.entities[id]!.ref === "base:control_panel")!;
      s.characters.c_1!.location = s.entities[panel]!.location!;
      s.characters.c_1!.at = [s.entities[panel]!.at![0] - 1, s.entities[panel]!.at![1]];
      const v = view(s, bundles, "c_1");
      const entry = v.visible.find((e) => e.id === panel);
      const p = plan(v, 16);
      const images = p.ops.filter((o) => o.op === "image");
      if (art) {
        expect(entry?.art?.icon).toEqual({ kind: "icon", alt: "A control panel.", hash: sha256(ICON) });
        expect(images).toEqual([expect.objectContaining({ hash: sha256(ICON), alt: "A control panel.", fallback: [expect.objectContaining({ op: "rect" })] })]);
      } else {
        expect(entry?.art).toBeUndefined();
        expect(images).toEqual([]);
      }
      // Models never receive art.
      const context = parserContext(v, { conditions: [], speed: 6, can_act: true, declared: null, recent: [], input: "" });
      expect(JSON.stringify(context)).not.toMatch(/"(hash|art|alt)"/);
    }
  });
});
