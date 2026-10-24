// A clicked map cell as a `move` call (app-flow.md, Adventure editor: Playtest; SPEC_ISSUES.md#playtest-click-cell). Tools name rooms,
// doors, links, and entities by id, never cells (engine.md, Space; Action resolution), so a click
// resolves to what the cell holds in the viewer's view: a visible entity or door on it, else a link on
// it, else the room containing it. Unseen cells, walls, cells outside every room, and the viewer's own
// room resolve to a note instead.

import type { Cell } from "../grid";
import type { View } from "../engine";

export type CellMove =
  | { ok: true; call: { tool: "move"; args: { to_id: string } }; kind: string; label: string }
  | { ok: false; note: string };

function move(id: string, kind: string, label: string): CellMove {
  return { ok: true, call: { tool: "move", args: { to_id: id } }, kind, label };
}

function inRect([x, y]: Cell, [rx, ry, rw, rh]: readonly [number, number, number, number]): boolean {
  return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
}

/** The `move` a click on `cell` makes for the view's character, or a note saying why it makes none. */
export function cellMove(view: View, cell: Cell): CellMove {
  const { map } = view;
  const [x, y] = cell;
  const row = map.rows[y];
  const ch = row?.[x];
  if (ch === undefined || x < 0) return { ok: false, note: `${x},${y} is off the map.` };
  // The view blanks unseen cells; void terrain is blank as well, and neither can be walked to.
  if (ch === " ") return { ok: false, note: `${x},${y} has not been seen.` };

  // Topmost first, as the play map draws them.
  for (let i = view.visible.length - 1; i >= 0; i--) {
    const e = view.visible[i]!;
    if (!e.at) continue;
    const [w, h] = e.footprint ?? [1, 1];
    if (inRect(cell, [e.at[0], e.at[1], w, h])) return move(e.id, e.kind, e.label);
  }

  if ((map.legend[ch] ?? "floor") === "wall") return { ok: false, note: `${x},${y} is a wall.` };

  const link = map.links.find((l) => l.at[0] === x && l.at[1] === y);
  if (link) return move(link.id, "link", link.label);

  const room = map.rooms.find((r) => r.area.some((a) => inRect(cell, a)));
  if (!room) return { ok: false, note: `${x},${y} is outside every room.` };
  if (room.id === view.character.room) return { ok: false, note: `Already in ${room.label}; move goes to rooms, doors, links, and entities, not cells.` };
  return move(room.id, "room", room.label);
}
