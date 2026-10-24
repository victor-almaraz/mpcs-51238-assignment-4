import { describe, expect, it } from "vitest";
import { submit, view, type State, type View } from "../engine";
import { character, start, trialBundles } from "../engine/testing/world";
import { Rng } from "../rng";
import { cellMove } from "./click";

const B = trialBundles();

function viewOf(s: State): View {
  return view(s, B, "c_1");
}

/** Submits the click's call and returns the resulting state, failing when the engine rejects it. */
function click(s: State, x: number, y: number): State {
  const m = cellMove(viewOf(s), [x, y]);
  if (!m.ok) throw new Error(m.note);
  const r = submit(s, B, "c_1", m.call, new Rng(7, s.rng_counter));
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.detail}`);
  return r.state;
}

describe("cellMove", () => {
  // The trial deck: c_1 starts in bay at 1,1; the door _e1 at 5,2 leads to the dark hold.
  it("moves to the visible entity or door on a cell, which the engine accepts", () => {
    const s = start([character("c_1", "Vale")], 7, B);
    const v = viewOf(s);
    expect(cellMove(v, [2, 3])).toEqual({ ok: true, call: { tool: "move", args: { to_id: "card" } }, kind: "item", label: expect.any(String) });
    expect(cellMove(v, [5, 2])).toMatchObject({ ok: true, call: { args: { to_id: "_e1" } }, kind: "door" });
    // A closed door is a goal beside it (engine.md, Movement), so the walk ends next to it, in bay.
    const after = click(s, 5, 2);
    expect(after.characters.c_1!.at).toEqual([4, 2]);
  });

  it("moves to the room containing a cell with nothing on it", () => {
    const s0 = start([character("c_1", "Vale")], 7, B);
    const r = submit(s0, B, "c_1", { tool: "move", args: { to_id: "hold" } }, new Rng(7, s0.rng_counter));
    if (!r.ok) throw new Error(r.error.detail);
    const s = r.state;
    expect(viewOf(s).character.room).toBe("hold");
    expect(cellMove(viewOf(s), [2, 2])).toMatchObject({ ok: true, call: { args: { to_id: "bay" } }, kind: "room" });
    const back = click(s, 2, 2);
    expect(viewOf(back).character.room).toBe("bay");
  });

  it("moves to a seen link, and passes over hidden entities to the room", () => {
    const s = start([character("c_1", "Vale")], 7, B);
    s.entities.drone!.location = "vault";
    s.entities.drone!.at = [4, 1];
    s.locations.deck!.rooms.hold!.visited = true;
    s.locations.deck!.seen = s.locations.deck!.seen.map((row) => "1".repeat(row.length));
    // The hidden cache at 8,3 is not in the view, so its cell is the hold's.
    expect(cellMove(viewOf(s), [8, 3])).toMatchObject({ ok: true, call: { args: { to_id: "hold" } } });
    expect(cellMove(viewOf(s), [10, 3])).toMatchObject({ ok: true, call: { args: { to_id: "x_down" } }, kind: "link" });
    expect(click(s, 10, 3).characters.c_1!.location).toBe("vault");
  });

  it("makes no call for walls, unseen cells, cells off the map, and the viewer's own room", () => {
    const v = viewOf(start([character("c_1", "Vale")], 7, B));
    for (const cell of [[0, 0], [5, 1], [8, 2], [-1, 0], [0, 99], [99, 0], [3, 2]] as const) {
      const m = cellMove(v, cell);
      expect(m.ok, `${cell}`).toBe(false);
    }
    expect(cellMove(v, [0, 0])).toEqual({ ok: false, note: "0,0 is a wall." });
    expect(cellMove(v, [8, 2])).toEqual({ ok: false, note: "8,2 has not been seen." });
    expect(cellMove(v, [3, 2])).toMatchObject({ ok: false, note: expect.stringContaining("Already in bay") });
  });

  it("makes no call for a seen cell outside every room", () => {
    const v = viewOf(start([character("c_1", "Vale")], 7, B));
    const roomless: View = { ...v, map: { ...v.map, rooms: v.map.rooms.filter((r) => r.id !== "bay") } };
    expect(cellMove(roomless, [3, 2])).toEqual({ ok: false, note: "3,2 is outside every room." });
  });

  it("covers an entity's footprint and prefers the topmost entity", () => {
    const v = viewOf(start([character("c_1", "Vale")], 7, B));
    const big = { id: "crate", label: "crate", kind: "fixture", at: [2, 1] as [number, number], footprint: [2, 2] as [number, number], distance: 1, direction: "east" };
    const over = { ...big, id: "rat", kind: "creature", footprint: [1, 1] as [number, number] };
    const w: View = { ...v, visible: [big, over] };
    expect(cellMove(w, [3, 2])).toMatchObject({ ok: true, call: { args: { to_id: "crate" } } });
    expect(cellMove(w, [2, 1])).toMatchObject({ ok: true, call: { args: { to_id: "rat" } } });
  });
});
