// Location maps in play (design/components.md, Maps): a plan of the view's seen cells, rooms, doors,
// links, visible entities, and the party. `plan` turns a view into drawing operations; `draw` paints
// them on a canvas. Colours are theme token names, resolved by the caller.

import type { View } from "../engine";

export type Token = "page" | "ink" | "desk" | "rule" | "muted" | "accent" | "accent-soft" | "danger" | "warning";

export type Op =
  | { op: "rect"; x: number; y: number; w: number; h: number; fill: Token; alpha?: number }
  | { op: "circle"; x: number; y: number; r: number; fill: Token | null; stroke?: Token; width?: number }
  | { op: "text"; x: number; y: number; text: string; fill: Token; size: number; align?: "left" | "center" }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; stroke: Token; width: number };

export interface Hit {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Plan {
  width: number;
  height: number;
  ops: Op[];
  /** Clickable areas, last drawn on top: entities, doors, links, rooms. */
  hits: Hit[];
}

/** Draws a view at `cell` pixels per cell. `hostile` names hostile creatures, for their danger ring. */
export function plan(view: View, cell = 16, hostile: ReadonlySet<string> = new Set()): Plan {
  const { map } = view;
  const rows = map.rows;
  const width = (rows[0]?.length ?? 0) * cell;
  const height = rows.length * cell;
  const ops: Op[] = [{ op: "rect", x: 0, y: 0, w: width, h: height, fill: "desk" }];
  const hits: Hit[] = [];

  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === " ") return;
      const terrain = map.legend[ch] ?? "floor";
      const fill: Token = terrain === "wall" ? "ink" : terrain === "floor" ? "page" : "rule";
      ops.push({ op: "rect", x: x * cell, y: y * cell, w: cell, h: cell, fill });
      // Light: 2 bright, 1 dim, 0 dark or unperceived.
      const light = map.light[y]?.[x] ?? "0";
      if (fill !== "ink" && light !== "2") ops.push({ op: "rect", x: x * cell, y: y * cell, w: cell, h: cell, fill: "desk", alpha: light === "1" ? 0.4 : 0.75 });
    }),
  );

  for (const room of map.rooms) {
    const [x, y] = room.area[0] ?? [0, 0];
    ops.push({ op: "text", x: x * cell + 2, y: y * cell + Math.round(cell * 0.75), text: room.label, fill: "muted", size: Math.max(9, Math.round(cell * 0.6)) });
    for (const [ax, ay, aw, ah] of room.area) hits.push({ id: room.id, label: room.label, kind: "room", x: ax * cell, y: ay * cell, w: aw * cell, h: ah * cell });
  }

  for (const link of map.links) {
    const [x, y] = link.at;
    ops.push({ op: "text", x: x * cell + cell / 2, y: y * cell + Math.round(cell * 0.8), text: "↗", fill: "accent", size: cell, align: "center" });
    hits.push({ id: link.id, label: link.label, kind: "link", x: x * cell, y: y * cell, w: cell, h: cell });
  }

  for (const e of view.visible) {
    if (!e.at) continue;
    const [x, y] = e.at;
    const [w, h] = e.footprint ?? [1, 1];
    const px = x * cell;
    const py = y * cell;
    if (e.kind === "door") {
      // A bar across the cell: a gap with two ticks when open, a solid bar when closed.
      const mid = py + cell / 2;
      if (e.open) {
        ops.push({ op: "line", x1: px, y1: mid - 3, x2: px, y2: mid + 3, stroke: "ink", width: 1.5 });
        ops.push({ op: "line", x1: px + cell, y1: mid - 3, x2: px + cell, y2: mid + 3, stroke: "ink", width: 1.5 });
      } else ops.push({ op: "rect", x: px, y: mid - 2, w: cell, h: 4, fill: "ink" });
    } else if (e.kind === "creature") {
      ops.push({ op: "circle", x: px + (w * cell) / 2, y: py + (h * cell) / 2, r: (Math.min(w, h) * cell) / 2 - 2, fill: "rule", stroke: hostile.has(e.id) ? "danger" : "ink", width: hostile.has(e.id) ? 2 : 1 });
    } else {
      ops.push({ op: "rect", x: px + 3, y: py + 3, w: w * cell - 6, h: h * cell - 6, fill: "rule" });
    }
    if (e.lit) ops.push({ op: "circle", x: px + w * cell - 3, y: py + 3, r: 2, fill: "warning" });
    hits.push({ id: e.id, label: e.label, kind: e.kind, x: px, y: py, w: w * cell, h: h * cell });
  }

  const self = { id: view.character.id, name: String((view.character.sheet as { name?: string }).name ?? view.character.id), at: view.character.at };
  // Party members whose room is on this map; the view gives no location for the others.
  const here = new Set(map.rooms.map((r) => r.id));
  const others = view.party.filter((p) => p.room !== null && here.has(p.room)).map((p) => ({ id: p.id, name: p.name, at: p.at }));
  for (const c of [...others, self]) {
    const [x, y] = c.at;
    const mine = c.id === self.id;
    ops.push({ op: "circle", x: x * cell + cell / 2, y: y * cell + cell / 2, r: cell / 2 - 1, fill: mine ? "accent" : "page", stroke: "accent", width: 1.5 });
    ops.push({ op: "text", x: x * cell + cell / 2, y: y * cell + Math.round(cell * 0.72), text: c.name.charAt(0).toUpperCase(), fill: mine ? "page" : "accent", size: Math.round(cell * 0.6), align: "center" });
    hits.push({ id: c.id, label: c.name, kind: "character", x: x * cell, y: y * cell, w: cell, h: cell });
  }
  return { width, height, ops, hits };
}

/** The topmost clickable thing at a point. */
export function hitAt(p: Plan, x: number, y: number): Hit | undefined {
  for (let i = p.hits.length - 1; i >= 0; i--) {
    const h = p.hits[i]!;
    if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h;
  }
  return undefined;
}

/** Paints a plan; `color` resolves a token to a CSS colour. */
export function draw(ctx: CanvasRenderingContext2D, p: Plan, color: (t: Token) => string, font: string): void {
  ctx.clearRect(0, 0, p.width, p.height);
  for (const o of p.ops) {
    ctx.globalAlpha = o.op === "rect" && o.alpha !== undefined ? o.alpha : 1;
    if (o.op === "rect") {
      ctx.fillStyle = color(o.fill);
      ctx.fillRect(o.x, o.y, o.w, o.h);
    } else if (o.op === "circle") {
      ctx.beginPath();
      ctx.arc(o.x, o.y, Math.max(1, o.r), 0, Math.PI * 2);
      if (o.fill) {
        ctx.fillStyle = color(o.fill);
        ctx.fill();
      }
      if (o.stroke) {
        ctx.strokeStyle = color(o.stroke);
        ctx.lineWidth = o.width ?? 1;
        ctx.stroke();
      }
    } else if (o.op === "line") {
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.strokeStyle = color(o.stroke);
      ctx.lineWidth = o.width;
      ctx.stroke();
    } else {
      ctx.fillStyle = color(o.fill);
      ctx.font = `${o.size}px ${font}`;
      ctx.textAlign = o.align ?? "left";
      ctx.fillText(o.text, o.x, o.y);
    }
  }
  ctx.globalAlpha = 1;
}
