import { describe, expect, it } from "vitest";
import { filesToDraft } from "./draft-io";
import { plotGraph, plotWarnings } from "./plot";
import { stationAdventure } from "./testing/fixtures";

const guide = () => filesToDraft(new Map([...stationAdventure()].map(([k, v]) => [k, String(v)]))).draft;

describe("plot graph", () => {
  it("finds every stage and ending of the guide adventure reachable", () => {
    const g = plotGraph(guide());
    expect(g.arcs.every((a) => a.reachable.length === a.stages.length)).toBe(true);
    expect(g.endings.filter((e) => !e.reachable)).toEqual([]);
    expect(g.edges.length).toBeGreaterThan(0);
    expect(plotWarnings(guide())).toEqual([]);
  });

  it("reports an ending that only a trigger in an unreachable stage could reach", () => {
    const d = {
      adventure: { endings: { won: { label: "Won" }, secret: { label: "Secret" }, lost: { label: "Lost" } }, start: { effects: [] } },
      arcs: {
        main: {
          id: "main",
          stages: ["a", "b", "never"],
          initial: "a",
          triggers: [
            { id: "advance", on: { type: "waited" }, when: { stage: ["main", "a"] }, effects: [{ set_stage: { arc: "main", stage: "b" } }] },
            { id: "win", on: { type: "waited" }, when: { all: [{ stage: ["main", "b"] }, { flag: "f" }] }, effects: [{ end_campaign: { ending: "won" } }] },
            { id: "hidden", on: { type: "waited" }, when: { stage: ["main", "never"] }, effects: [{ if: { when: { flag: "x" }, then: [{ end_campaign: { ending: "secret" } }] } }] },
          ],
        },
      },
    };
    const g = plotGraph(d);
    expect(g.endings).toEqual([
      { id: "won", reachable: true, by: ["trigger main.win"] },
      { id: "secret", reachable: false, by: [] },
      { id: "lost", reachable: true, by: [] },
    ]);
    expect(g.edges).toEqual([{ arc: "main", from: "a", to: "b", source: "trigger main.advance" }]);
    expect(plotWarnings(d).map((w) => w.pointer)).toEqual(["/adventure/endings/secret", "/arcs/main/stages/2"]);
  });
});
