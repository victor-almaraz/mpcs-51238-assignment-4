"use client";
// The map editor (app-flow.md, Adventure editor, Locations): a grid of the location's cells with a
// palette of built-in and setting terrain; Paint, Fill, and Rectangle; Room draws a room's area;
// Place puts a template or NPC on a cell; Link places a link; Select shows and edits what a cell holds.
// Problems with placed things and links mark their cells; the Problems panel selects the cell.
import { Brush, Link2, MapPin, MousePointer2, PaintBucket, Plus, Square, SquareDashed } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { denseInput, denseSelect, Labelled, Panel, RemoveButton } from "./controls";
import type { AuthoredLocation, Cell, Doc, Placement, Rect, Refs } from "./doc";
import { freshId, ID } from "./doc";
import { fieldId, InlineProblems, inside, problemProps, segments, SeverityIcon, useProblems } from "./problems";
import type { Reveal } from "./sections";

type Tool = "paint" | "fill" | "rect" | "room" | "place" | "link" | "select";

const BUILTIN: Record<string, string> = { floor: ".", wall: "#", void: " " };
const FREE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
// Room tints mixed into the page colour, so they read in light and dark mode.
const ROOM_HUES = ["#8a63d2", "#3f9a5a", "#d08a2c", "#3b7fc4", "#c4466f", "#8f9a2e"];
const tint = (i: number) => `color-mix(in srgb, ${ROOM_HUES[i % ROOM_HUES.length]} 26%, var(--color-page))`;

const TOOLS: { id: Tool; label: string; icon: ReactNode; help: string }[] = [
  { id: "paint", label: "Paint", icon: <Brush {...ICON_DENSE} />, help: "Click or drag over cells to paint the terrain." },
  { id: "fill", label: "Fill", icon: <PaintBucket {...ICON_DENSE} />, help: "Click a cell to fill the connected area of the same terrain." },
  { id: "rect", label: "Rectangle", icon: <Square {...ICON_DENSE} />, help: "Drag from one corner to the other to paint a rectangle." },
  { id: "room", label: "Room", icon: <SquareDashed {...ICON_DENSE} />, help: "Drag over the map to add an area to the chosen room." },
  { id: "place", label: "Place", icon: <MapPin {...ICON_DENSE} />, help: "Click a cell to place the chosen template or NPC." },
  { id: "link", label: "Link", icon: <Link2 {...ICON_DENSE} />, help: "Click a cell to put a link to another location there." },
  { id: "select", label: "Select", icon: <MousePointer2 {...ICON_DENSE} />, help: "Click a cell to see and edit what it holds." },
];

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

export function MapEditor({ loc, doc, refs, change, reveal }: { loc: AuthoredLocation; doc: Doc; refs: Refs; change: (f: (l: AuthoredLocation, d: Doc) => void) => void; reveal?: Reveal }) {
  const [tool, setTool] = useState<Tool>("paint");
  const [terrain, setTerrain] = useState("floor");
  const [room, setRoom] = useState<string>(Object.keys(loc.map.rooms)[0] ?? "");
  const [place, setPlace] = useState<string>("");
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { under } = useProblems();
  const base = `/locations/${loc.id}/map`;

  // A problem with a placed thing or a link selects its cell, so the inspector shows its fields.
  const [revealed, setRevealed] = useState<number | null>(null);
  if (reveal && reveal.n !== revealed) {
    setRevealed(reveal.n);
    const [, id, map, kind, key] = segments(reveal.pointer);
    const at = id === loc.id && map === "map" && key !== undefined ? (kind === "contents" ? loc.map.contents?.[Number(key)]?.at : kind === "links" ? loc.map.links?.[key]?.at : undefined) : undefined;
    if (at) {
      setSelected(at);
      setTool("select");
    }
  }

  const rows = loc.map.rows;
  const width = rows[0]?.length ?? 0;
  const roomIds = Object.keys(loc.map.rooms);
  const roomAt = (c: Cell) => roomIds.find((id) => loc.map.rooms[id]!.area.some((r) => inRect(c, r)));
  const preview = anchor && hover && (tool === "rect" || tool === "room") ? rectOf(anchor, hover) : null;

  // Cells whose placed things or links have problems.
  const thingProblems = [...under(`${base}/contents`), ...under(`${base}/links`)];
  const cellOf = (pointer: string): Cell | undefined => {
    const [, , , kind, key] = segments(pointer);
    if (kind === "contents") return loc.map.contents?.[Number(key)]?.at;
    if (kind === "links" && key) return loc.map.links?.[key]?.at;
    return undefined;
  };
  const flagged = thingProblems.map((p) => ({ p, at: cellOf(p.pointer) }));

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

  const addRoom = () => {
    const id = freshId("room", roomIds);
    change((l) => {
      l.map.rooms[id] = { label: id.replace(/_/g, " "), area: [] };
    });
    setRoom(id);
    setTool("room");
  };

  const at = selected;
  const here = at ? (loc.map.contents ?? []).map((p, i) => ({ p, i })).filter(({ p }) => same(p.at, at)) : [];
  const links = at ? Object.entries(loc.map.links ?? {}).filter(([, k]) => same(k.at, at)) : [];
  const help = TOOLS.find((t) => t.id === tool)!.help;
  const elsewhere = flagged.filter(({ at: c }) => !c || !at || !same(c, at));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card border border-rule bg-page p-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div role="group" aria-label="Map tool" className="inline-flex flex-wrap rounded-control border border-border bg-page p-0.5">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tool === t.id}
                onClick={() => setTool(t.id)}
                className={cx("inline-flex h-8 items-center gap-1.5 rounded-[3px] px-2.5 text-label", tool === t.id ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-desk")}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          {(tool === "paint" || tool === "fill" || tool === "rect") && (
            <Labelled label="Terrain">
              <select data-pointer={`${base}/legend`} value={terrain} onChange={(e) => setTerrain(e.target.value)} className={denseSelect}>
                {refs.terrain.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Labelled>
          )}
          {tool === "room" && (
            <div className="flex items-end gap-2">
              <Labelled label="Room">
                <select value={room} onChange={(e) => setRoom(e.target.value)} className={denseSelect}>
                  <option value="">Choose a room</option>
                  {roomIds.map((id) => (
                    <option key={id} value={id}>
                      {loc.map.rooms[id]!.label}
                    </option>
                  ))}
                </select>
              </Labelled>
              <Button variant="quiet" size="sm" icon={<Plus {...ICON_DENSE} />} onClick={addRoom}>
                Add room
              </Button>
            </div>
          )}
          {tool === "place" && (
            <Labelled label="Template or NPC">
              <select value={place} onChange={(e) => setPlace(e.target.value)} className={cx(denseSelect, "max-w-64")}>
                <option value="">Choose</option>
                <optgroup label="NPCs">
                  {Object.values(doc.npcs).map((n) => (
                    <option key={n.id} value={`npc:${n.id}`}>
                      {n.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="This adventure">
                  {Object.keys(doc.entities).map((id) => (
                    <option key={id} value={`${doc.adventure.id}:${id}`}>
                      {id}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Settings">
                  {refs.templates.map((t) => (
                    <option key={t.ref} value={t.ref}>
                      {t.label} ({t.kind})
                    </option>
                  ))}
                </optgroup>
              </select>
            </Labelled>
          )}
          <div data-pointer={`${base}/rows`} className="ml-auto flex items-end gap-2">
            <Labelled label="Width">
              <input type="number" min={1} max={64} value={width} onChange={(e) => resize(Math.max(1, Math.min(64, Number(e.target.value))), rows.length)} className={cx(denseInput, "w-18 tabular")} />
            </Labelled>
            <Labelled label="Height">
              <input type="number" min={1} max={64} value={rows.length} onChange={(e) => resize(width, Math.max(1, Math.min(64, Number(e.target.value))))} className={cx(denseInput, "w-18 tabular")} />
            </Labelled>
          </div>
        </div>
        <p className="text-caption text-muted">{help}</p>
        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}
      </div>

      {elsewhere.length > 0 && (
        <ul aria-label="Problems on this map" className="flex flex-col gap-1">
          {elsewhere.map(({ p, at: c }, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-caption">
              <SeverityIcon problem={p} />
              <span className={p.severity === "error" ? "text-danger" : "text-warning"}>{p.message}</span>
              {c && (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    setSelected(c);
                    setTool("select");
                  }}
                >
                  Show cell {c[0]}, {c[1]}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          tabIndex={0}
          role="group"
          aria-label={`Map of ${loc.id}, ${width} by ${rows.length} cells; drawing uses a pointer`}
          className="max-h-[70dvh] overflow-auto rounded-card border border-rule bg-desk p-2"
          onMouseLeave={() => setHover(null)}
        >
          <div className="inline-grid select-none" style={{ gridTemplateColumns: `repeat(${width}, 16px)` }}>
            {rows.flatMap((row, y) =>
              [...row].map((ch, x) => {
                const c: Cell = [x, y];
                const t = terrainOf(loc, ch);
                const r = roomAt(c);
                const thing = (loc.map.contents ?? []).find((p) => same(p.at, c));
                const link = Object.values(loc.map.links ?? {}).some((k) => same(k.at, c));
                const bad = flagged.some(({ at: f }) => same(f, c));
                const bg = t === "wall" ? "var(--color-ink)" : t === "void" ? "var(--color-desk)" : r ? tint(roomIds.indexOf(r)) : t === "floor" ? "var(--color-page)" : "var(--color-rule)";
                const isFirst = r && loc.map.rooms[r]!.area[0] && loc.map.rooms[r]!.area[0]![0] === x && loc.map.rooms[r]!.area[0]![1] === y;
                return (
                  <div
                    key={`${x},${y}`}
                    title={`${x},${y} ${t}${r ? ` · ${loc.map.rooms[r]!.label}` : ""}${bad ? " · has a problem" : ""}`}
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
                    style={{
                      background: bg,
                      outline: same(selected ?? undefined, c) ? "2px solid var(--color-accent)" : bad ? "2px solid var(--color-danger)" : preview && inRect(c, preview) ? "1px solid var(--color-accent)" : "0.5px solid var(--color-rule)",
                      zIndex: same(selected ?? undefined, c) || bad ? 1 : undefined,
                    }}
                  >
                    {isFirst && <span className="pointer-events-none absolute left-0 top-[-1px] z-[2] whitespace-nowrap text-[8px] text-muted">{loc.map.rooms[r!]!.label}</span>}
                    {thing && <span className="pointer-events-none absolute inset-0 text-center font-semibold text-accent">{(thing.npc ?? thing.ref ?? "?").split(":").at(-1)![0]!.toUpperCase()}</span>}
                    {link && <span className="pointer-events-none absolute inset-0 text-center text-accent">↗</span>}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Panel aria-labelledby={`${fieldId(base)}-cell`} className="flex flex-col gap-3 p-3">
            <h4 id={`${fieldId(base)}-cell`} className="text-label font-semibold">
              {at ? `Cell ${at[0]}, ${at[1]}` : "Cell"}
            </h4>
            {!at && <p className="text-caption text-muted">Choose Select, then click a cell to see what it holds.</p>}
            {at && here.length === 0 && links.length === 0 && <p className="text-caption text-muted">Nothing placed here.</p>}
            {here.map(({ p, i }) => {
              const pointer = `${base}/contents/${i}`;
              const problems = under(pointer);
              const idId = fieldId(`${pointer}/id`);
              return (
                <div key={i} data-pointer={pointer} className="flex flex-col gap-2 border-t border-rule pt-2 first-of-type:border-t-0 first-of-type:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-label">
                      {p.npc ? (
                        <>
                          NPC <span className="font-mono">{p.npc}</span>
                        </>
                      ) : (
                        <span className="font-mono">{p.ref}</span>
                      )}
                    </span>
                    <RemoveButton label={`Remove ${p.npc ?? p.ref ?? "thing"} from this cell`} onClick={() => change((l) => void l.map.contents!.splice(i, 1))} />
                  </div>
                  {!p.npc && (
                    <Labelled label="Id, for triggers">
                      <input
                        {...problemProps(idId, problems)}
                        placeholder="optional"
                        defaultValue={p.id ?? ""}
                        onBlur={(e) =>
                          change((l) => {
                            const v = e.target.value.trim();
                            if (v && !ID.test(v)) return;
                            if (v) l.map.contents![i]!.id = v;
                            else delete l.map.contents![i]!.id;
                          })
                        }
                        className={cx(denseInput, "font-mono")}
                      />
                    </Labelled>
                  )}
                  <label className="flex items-center gap-2 text-label">
                    <input type="checkbox" checked={p.hidden === true} onChange={(e) => change((l) => void (e.target.checked ? (l.map.contents![i]!.hidden = true) : delete l.map.contents![i]!.hidden))} className="size-4 accent-[var(--color-accent)]" />
                    Hidden until found
                  </label>
                  <InlineProblems id={`${idId}-problems`} problems={problems} />
                </div>
              );
            })}
            {links.map(([id, k]) => {
              const pointer = `${base}/links/${id}`;
              const problems = under(pointer);
              const lid = fieldId(pointer);
              return (
                <div key={id} data-pointer={pointer} className="flex flex-col gap-2 border-t border-rule pt-2 first-of-type:border-t-0 first-of-type:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label">
                      Link <span className="font-mono">{id}</span>
                    </span>
                    <RemoveButton label={`Remove link ${id}`} onClick={() => change((l) => void delete l.map.links![id])} />
                  </div>
                  <Labelled label="Label">
                    <input {...problemProps(`${lid}-label`, problems.filter((q) => inside(q.pointer, `${pointer}/label`)))} defaultValue={k.label} onBlur={(e) => change((l) => void (l.map.links![id]!.label = e.target.value || "passage"))} className={denseInput} />
                  </Labelled>
                  <div className="grid grid-cols-2 gap-2">
                    <Labelled label="To location">
                      <select {...problemProps(lid, problems)} value={k.to.location} onChange={(e) => change((l) => void (l.map.links![id]!.to.location = e.target.value))} className={denseSelect}>
                        {Object.keys(doc.locations).map((lid2) => (
                          <option key={lid2} value={lid2}>
                            {lid2}
                          </option>
                        ))}
                      </select>
                    </Labelled>
                    <Labelled label="Its link">
                      <input defaultValue={k.to.link} onBlur={(e) => change((l) => void (l.map.links![id]!.to.link = e.target.value))} className={cx(denseInput, "font-mono")} />
                    </Labelled>
                  </div>
                  <InlineProblems id={`${lid}-problems`} problems={problems} />
                  <div>
                    <Button
                      variant="quiet"
                      size="sm"
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
                    </Button>
                  </div>
                </div>
              );
            })}
          </Panel>

          <Panel pointer={`${base}/rooms`} aria-labelledby={`${fieldId(base)}-rooms`} className="flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 id={`${fieldId(base)}-rooms`} className="text-label font-semibold">
                Rooms <span className="font-normal text-muted tabular">{roomIds.length}</span>
              </h4>
              <Button variant="quiet" size="sm" icon={<Plus {...ICON_DENSE} />} onClick={addRoom}>
                Add room
              </Button>
            </div>
            {roomIds.length === 0 && <p className="text-caption text-muted">Add a room, then drag over the map with Room to draw its area.</p>}
            <ul className="flex flex-col gap-2">
              {roomIds.map((id) => {
                const pointer = `${base}/rooms/${id}`;
                const problems = under(pointer);
                const rid = fieldId(pointer);
                const n = loc.map.rooms[id]!.area.length;
                return (
                  <li key={id} data-pointer={pointer} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="size-4 shrink-0 rounded-[3px] border border-rule" style={{ background: tint(roomIds.indexOf(id)) }} />
                      <input {...problemProps(rid, problems)} aria-label={`${id} label`} defaultValue={loc.map.rooms[id]!.label} onBlur={(e) => change((l) => void (l.map.rooms[id]!.label = e.target.value || id))} className={cx(denseInput, "min-w-0 flex-1")} />
                      <RemoveButton label={`Delete room ${id}`} onClick={() => change((l) => void delete l.map.rooms[id])} />
                    </div>
                    <div className="flex items-center gap-2 pl-6 text-caption text-muted">
                      <span className="font-mono">{id}</span>
                      <span>
                        · {n} area{n === 1 ? "" : "s"}
                      </span>
                      {n > 0 && (
                        <button type="button" className="rounded-control px-1 text-accent hover:underline" onClick={() => change((l) => void (l.map.rooms[id]!.area = []))}>
                          Clear area
                        </button>
                      )}
                    </div>
                    <InlineProblems id={`${rid}-problems`} problems={problems} className="pl-6" />
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
