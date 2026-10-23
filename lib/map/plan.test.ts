import { describe, expect, it } from "vitest";
import { view } from "../engine";
import { character, start, trialBundles } from "../engine/testing/world";
import { hitAt, plan } from "./plan";

describe("play map", () => {
  it("draws seen cells only, with the viewer's token filled and click targets for rooms", () => {
    const bundles = trialBundles();
    const s = start([character("c_1", "Vale"), character("c_2", "Rook")], 7, bundles);
    const v = view(s, bundles, "c_1");
    const p = plan(v, 16);
    const cells = v.map.rows.join("").replace(/ /g, "").length;
    // One fill per seen cell, after the desk background.
    expect(p.ops.filter((o) => o.op === "rect" && o.alpha === undefined).length).toBeGreaterThanOrEqual(cells + 1);
    const tokens = p.ops.filter((o) => o.op === "circle" && o.stroke === "accent");
    expect(tokens.map((t) => (t as { fill: string }).fill).sort()).toEqual(["accent", "page"]);
    const [x, y] = v.character.at;
    expect(hitAt(p, x * 16 + 8, y * 16 + 8)).toMatchObject({ id: "c_1", kind: "character" });
    const room = v.map.rooms[0]!;
    const [rx, ry] = room.area[0]!;
    const hit = hitAt(p, rx * 16 + 1, ry * 16 + 1);
    expect(hit?.kind === "room" || hit?.kind === "character").toBe(true);
    expect(p.width).toBe(v.map.rows[0]!.length * 16);
  });
});
