"use client";
// The map editor (app-flow.md, Adventure editor, Locations): a grid of the location's cells with a
// palette of built-in and setting terrain; Paint, Fill, and Rectangle; Room draws a room's area;
// Place puts a template or NPC on a cell; Link places a link; Select shows and edits what a cell holds.
import { useState } from "react";
import type { AuthoredLocation, Cell, Doc, Placement, Rect, Refs } from "./doc";
import { freshId, ID } from "./doc";

type Tool = "paint" | "fill" | "rect" | "room" | "place" | "link" | "select";

const BUILTIN: Record<string, string> = { floor: ".", wall: "#", void: " " };
const FREE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ROOM_TINTS = ["#e6dcf7", "#dcefe0", "#f7ebd9", "#dbe8f5", "#f5dbe4", "#eef0d6"];

function terrainOf(loc: AuthoredLocation, ch: string): string {
  if (ch === ".") return "floor";
  if (ch === "#") return "wall";
  if (ch === " ") return "void";
  const v = loc.map.legend?.[ch];
  return typeof v === "string" ? v : (v?.terrain ?? "floor");
}

/** The legend character for a terrain, adding one to the legend when needed. */
function charFor(loc: AuthoredLocation, terrain: string): string {
  if (BUILTIN[terrain]) return BUILTIN[terrain]!;
  for (const [ch, v] of Object.entries(loc.map.legend ?? {})) if (v === terrain) return ch;
  const used = new Set([...Object.keys(loc.map.legend ?? {}), ".", "#", " "]);
  const ch = [...FREE_CHARS].find((c) => !used.has(c))!;
  loc.map.legend = { ...(loc.map.legend ?? {}), [ch]: terrain };
  return ch;
}

function setCell(loc: AuthoredLocation, [x, y]: Cell, ch: string): void {
  const row = loc.map.rows[y]!;
  loc.map.rows[y] = row.slice(0, x) + ch + row.slice(x + 1);
}

function rectOf(a: Cell, b: Cell): Rect {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return [x, y, Math.abs(a[0] - b[0]) + 1, Math.abs(a[1] - b[1]) + 1];
}

const inRect = ([x, y]: Cell, [rx, ry, w, h]: Rect) => x >= rx && x < rx + w && y >= ry && y < ry + h;
const same = (a: Cell | undefined, b: Cell) => !!a && a[0] === b[0] && a[1] === b[1];

export function MapEditor({ loc, doc, refs, change }: { loc: AuthoredLocation; doc: Doc; refs: Refs; change: (f: (l: AuthoredLocation, d: Doc) => void) => void }) {
  const [tool, setTool] = useState<Tool>("paint");
  const [terrain, setTerrain] = useState("floor");
  const [room, setRoom] = useState<string>(Object.keys(loc.map.rooms)[0] ?? "");
  const [place, setPlace] = useState<string>("");
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = loc.map.rows;
  const width = rows[0]?.length ?? 0;
  const roomIds = Object.keys(loc.map.rooms);
  const roomAt = (c: Cell) => roomIds.find((id) => loc.map.rooms[id]!.area.some((r) => inRect(c, r)));
  const preview = anchor && hover && (tool === "rect" || tool === "room") ? rectOf(anchor, hover) : null;

  function apply(c: Cell): void {
    setError(null);
    if (tool === "paint") change((l) => setCell(l, c, charFor(l, terrain)));
    else if (tool === "fill")
      change((l) => {
        const from = l.map.rows[c[1]]![c[0]]!;
        const to = charFor(l, terrain);
        if (from === to) return;
        const stack: Cell[] = [c];
        while (stack.length) {
          const [x, y] = stack.pop()!;
          if (y < 0 || y >= l.map.rows.length || x < 0 || x >= width || l.map.rows[y]![x] !== from) continue;
          setCell(l, [x, y], to);
          stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
      });
    else if (tool === "place") {
      if (!place) return setError("Choose a template or NPC to place.");
      change((l) => {
        const entry: Placement = place.startsWith("npc:") ? { npc: place.slice(4), at: c } : { ref: place, at: c };
        l.map.contents = [...(l.map.contents ?? []), entry];
      });
    } else if (tool === "link") {
      change((l) => {
        const id = freshId("x_link", Object.keys(l.map.links ?? {}));
        const target = Object.keys(doc.locations).find((k) => k !== l.id) ?? l.id;
        l.map.links = { ...(l.map.links ?? {}), [id]: { label: "passage", at: c, to: { location: target, link: id } } };
      });
      setSelected(c);
    } else if (tool === "select") setSelected(c);
  }

  function drag(start: Cell, end: Cell): void {
    const r = rectOf(start, end);
    if (tool === "rect")
      change((l) => {
        const ch = charFor(l, terrain);
        for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) setCell(l, [x, y], ch);
      });
    if (tool === "room") {
      if (!room) return setError("Add a room first.");
      change((l) => {
        l.map.rooms[room]!.area.push(r);
      });
    }
  }

  const resize = (w: number, h: number) =>
    change((l) => {
      const rowsNow = l.map.rows.map((row) => (row.length >= w ? row.slice(0, w) : row + "#".repeat(w - row.length)));
      while (rowsNow.length < h) rowsNow.push("#".repeat(w));
      l.map.rows = rowsNow.slice(0, h);
    });

  const at = selected;
  const here = at ? (loc.map.contents ?? []).map((p, i) => ({ p, i })).filter(({ p }) => same(p.at, at)) : [];
  const links = at ? Object.entries(loc.map.links ?? {}).filter(([, k]) => same(k.at, at)) : [];
  const btn = (t: Tool, label: string) => (
    <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)} className={`rounded-control px-2 py-1 font-ui text-caption ${tool === t ? "bg-accent-soft text-accent" : ""}`}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {btn("paint", "Paint")}
        {btn("fill", "Fill")}
        {btn("rect", "Rectangle")}
        {btn("room", "Room")}
        {btn("place", "Place")}
        {btn("link", "Link")}
        {btn("select", "Select")}
        <span className="mx-2 text-muted">|</span>
        <select aria-label="Terrain" value={terrain} onChange={(e) => setTerrain(e.target.value)} className="rounded-control border border-border bg-page px-1 font-ui text-caption">
          {refs.terrain.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select aria-label="Room" value={room} onChange={(e) => setRoom(e.target.value)} className="rounded-control border border-border bg-page px-1 font-ui text-caption">
          <option value="">room</option>
          {roomIds.map((id) => (
            <option key={id} value={id}>
              {loc.map.rooms[id]!.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="font-ui text-caption text-accent"
          onClick={() => {
            const id = freshId("room", roomIds);
            change((l) => {
              l.map.rooms[id] = { label: id.replace(/_/g, " "), area: [] };
            });
            setRoom(id);
            setTool("room");
          }}
        >
          Add room
        </button>
        <select aria-label="Place" value={place} onChange={(e) => setPlace(e.target.value)} className="max-w-48 rounded-control border border-border bg-page px-1 font-ui text-caption">
          <option value="">template or NPC</option>
          {Object.values(doc.npcs).map((n) => (
            <option key={n.id} value={`npc:${n.id}`}>
              NPC: {n.name}
            </option>
          ))}
          {Object.keys(doc.entities).map((id) => (
            <option key={id} value={`${doc.adventure.id}:${id}`}>
              {id}
            </option>
          ))}
          {refs.templates.map((t) => (
            <option key={t.ref} value={t.ref}>
              {t.label} ({t.kind})
            </option>
          ))}
        </select>
        <label className="font-ui text-caption">
          W <input type="number" min={1} max={64} value={width} onChange={(e) => resize(Math.max(1, Math.min(64, Number(e.target.value))), rows.length)} className="w-14 rounded-control border border-border bg-page px-1" />
        </label>
        <label className="font-ui text-caption">
          H <input type="number" min={1} max={64} value={rows.length} onChange={(e) => resize(width, Math.max(1, Math.min(64, Number(e.target.value))))} className="w-14 rounded-control border border-border bg-page px-1" />
        </label>
      </div>
      {error && <p className="font-ui text-caption text-danger">{error}</p>}

      <div className="overflow-auto rounded-control border border-rule" onMouseLeave={() => setHover(null)}>
        <div className="inline-grid select-none" style={{ gridTemplateColumns: `repeat(${width}, 16px)` }}>
          {rows.flatMap((row, y) =>
            [...row].map((ch, x) => {
              const c: Cell = [x, y];
              const t = terrainOf(loc, ch);
              const r = roomAt(c);
              const thing = (loc.map.contents ?? []).find((p) => same(p.at, c));
              const link = Object.values(loc.map.links ?? {}).some((k) => same(k.at, c));
              const bg = t === "wall" ? "var(--color-ink)" : t === "void" ? "var(--color-desk)" : r ? ROOM_TINTS[roomIds.indexOf(r) % ROOM_TINTS.length] : t === "floor" ? "var(--color-page)" : "var(--color-rule)";
              const isFirst = r && loc.map.rooms[r]!.area[0] && loc.map.rooms[r]!.area[0]![0] === x && loc.map.rooms[r]!.area[0]![1] === y;
              return (
                <div
                  key={`${x},${y}`}
                  title={`${x},${y} ${t}${r ? ` · ${loc.map.rooms[r]!.label}` : ""}`}
                  onMouseDown={() => (tool === "rect" || tool === "room" ? setAnchor(c) : apply(c))}
                  onMouseEnter={(e) => {
                    setHover(c);
                    if (e.buttons === 1 && tool === "paint") apply(c);
                  }}
                  onMouseUp={() => {
                    if (anchor) drag(anchor, c);
                    setAnchor(null);
                  }}
                  className="relative h-4 w-4 cursor-crosshair font-mono text-[9px] leading-4"
                  style={{ background: bg, outline: preview && inRect(c, preview) ? "1px solid var(--color-accent)" : same(selected ?? undefined, c) ? "2px solid var(--color-accent)" : "0.5px solid var(--color-rule)" }}
                >
                  {isFirst && <span className="pointer-events-none absolute left-0 top-[-1px] whitespace-nowrap text-[8px] text-muted">{loc.map.rooms[r!]!.label}</span>}
                  {thing && <span className="pointer-events-none absolute inset-0 text-center text-accent">{(thing.npc ?? thing.ref ?? "?").split(":").at(-1)![0]!.toUpperCase()}</span>}
                  {link && <span className="pointer-events-none absolute inset-0 text-center text-accent">↗</span>}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {at && (
        <div className="rounded-control border border-rule p-2 font-ui text-caption">
          <p className="font-ui text-label">
            Cell {at[0]}, {at[1]}
          </p>
          {here.length === 0 && links.length === 0 && <p className="text-muted">Nothing placed here.</p>}
          {here.map(({ p, i }) => (
            <div key={i} className="mt-1 flex flex-wrap items-center gap-2">
              <span>{p.npc ? `NPC ${p.npc}` : p.ref}</span>
              {!p.npc && (
                <input
                  aria-label="Id"
                  placeholder="id (for triggers)"
                  defaultValue={p.id ?? ""}
                  onBlur={(e) =>
                    change((l) => {
                      const v = e.target.value.trim();
                      if (v && !ID.test(v)) return;
                      if (v) l.map.contents![i]!.id = v;
                      else delete l.map.contents![i]!.id;
                    })
                  }
                  className="w-32 rounded-control border border-border bg-page px-1"
                />
              )}
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={p.hidden === true} onChange={(e) => change((l) => void (e.target.checked ? (l.map.contents![i]!.hidden = true) : delete l.map.contents![i]!.hidden))} /> hidden
              </label>
              <button type="button" className="text-danger" onClick={() => change((l) => void l.map.contents!.splice(i, 1))}>
                Remove
              </button>
            </div>
          ))}
          {links.map(([id, k]) => (
            <div key={id} className="mt-1 flex flex-wrap items-center gap-2">
              <span>Link {id}</span>
              <input aria-label="Label" defaultValue={k.label} onBlur={(e) => change((l) => void (l.map.links![id]!.label = e.target.value || "passage"))} className="w-28 rounded-control border border-border bg-page px-1" />
              <select aria-label="Destination" value={k.to.location} onChange={(e) => change((l) => void (l.map.links![id]!.to.location = e.target.value))} className="rounded-control border border-border bg-page px-1">
                {Object.keys(doc.locations).map((lid) => (
                  <option key={lid} value={lid}>
                    {lid}
                  </option>
                ))}
              </select>
              <input aria-label="Destination link" defaultValue={k.to.link} onBlur={(e) => change((l) => void (l.map.links![id]!.to.link = e.target.value))} className="w-28 rounded-control border border-border bg-page px-1" />
              <button
                type="button"
                className="text-accent"
                onClick={() =>
                  change((l, d) => {
                    const dest = d.locations[k.to.location];
                    if (!dest || dest.kind !== "authored") return;
                    const back = dest.map.links?.[k.to.link];
                    if (back) return;
                    dest.map.links = { ...(dest.map.links ?? {}), [k.to.link]: { label: k.label, at: [1, 1], to: { location: l.id, link: id } } };
                  })
                }
              >
                Add return link
              </button>
              <button type="button" className="text-danger" onClick={() => change((l) => void delete l.map.links![id])}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="font-ui text-caption">
        <p className="font-ui text-label">Rooms</p>
        {roomIds.length === 0 && <p className="text-muted">Add a room, then drag over the map with Room to draw its area.</p>}
        {roomIds.map((id) => (
          <div key={id} className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-block h-3 w-3" style={{ background: ROOM_TINTS[roomIds.indexOf(id) % ROOM_TINTS.length] }} />
            <span className="font-mono">{id}</span>
            <input aria-label="Room label" defaultValue={loc.map.rooms[id]!.label} onBlur={(e) => change((l) => void (l.map.rooms[id]!.label = e.target.value || id))} className="w-40 rounded-control border border-border bg-page px-1" />
            <span className="text-muted">{loc.map.rooms[id]!.area.length} area{loc.map.rooms[id]!.area.length === 1 ? "" : "s"}</span>
            <button type="button" className="text-muted" onClick={() => change((l) => void (l.map.rooms[id]!.area = []))}>
              Clear area
            </button>
            <button type="button" className="text-danger" onClick={() => change((l) => void delete l.map.rooms[id])}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
