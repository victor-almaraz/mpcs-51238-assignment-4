"use client";
// The play map (app-flow.md, Play interface: Map; docs/design/README.md, Play): seen cells, rooms,
// doors, links, visible entities, and the party on a canvas; clicking picks an entity, door, link, or
// room, and the pick is outlined. Zoom and centring have buttons, and the list view names every target
// (what is in sight and the ways on, with distance and direction), so the map needs no pointer (WCAG
// 2.5.7). The map fits its pane the first time the pane is shown.
import { useEffect, useMemo, useRef, useState } from "react";
import { List, LocateFixed, ZoomIn, ZoomOut } from "lucide-react";
import type { View } from "@/lib/engine";
import { artHashes, draw, hitAt, plan, type Plan, type Token } from "@/lib/map/plan";
import { ICON, ICON_DENSE, IconButton } from "@/components/ui/icon-button";
import { cx } from "@/components/ui/cx";
import { kindIcon } from "./action-bar";

type Entry = View["visible"][number];

/** Loaded art, shared across redraws; a failed image stays absent, so its fallback draws. */
const images = new Map<string, HTMLImageElement>();

const MIN_ZOOM = 8;
const MAX_ZOOM = 64;
const STEP = 4;
/** The padding around the canvas in its scroller, in pixels. */
const INSET = 16;

function cssColor(token: Token): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim() || "#888";
}

/** Scrolls so the character's token sits in the middle of the scroller. */
function centre(scroller: HTMLElement, canvas: HTMLCanvasElement, p: Plan, characterId: string) {
  const me = p.hits.find((h) => h.kind === "character" && h.id === characterId);
  if (!me) return;
  const s = scroller.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  scroller.scrollTo({
    left: c.left - s.left + scroller.scrollLeft + me.x + me.w / 2 - scroller.clientWidth / 2,
    top: c.top - s.top + scroller.scrollTop + me.y + me.h / 2 - scroller.clientHeight / 2,
  });
}

function TargetList({ title, entries, selected, onPick }: { title: string; entries: Entry[]; selected: string | null; onPick: (id: string, label: string) => void }) {
  const id = `map-list-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="px-2 pb-1 text-label font-medium text-muted">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="px-2 text-caption text-muted">Nothing.</p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((e) => {
            const art = e.art?.portrait ?? e.art?.icon;
            const on = selected === e.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(e.id, e.label)}
                  className={cx("flex min-h-10 w-full items-center gap-3 rounded-control px-2 py-1.5 text-left", on ? "bg-accent-soft text-accent" : "text-ink hover:bg-desk")}
                >
                  <span className={on ? "text-accent" : "text-muted"}>{kindIcon(e.kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label font-medium">{e.label}</span>
                    <span className="block text-caption text-muted">
                      {e.kind}
                      {art && ` (${art.alt})`} · <span className="tabular">{e.distance}</span> {e.direction}
                    </span>
                  </span>
                  {e.in_reach && <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-caption font-medium text-success">In reach</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function MapPanel({ view, onPick, portraits = {}, selected = null, headingId }: { view: View; onPick: (id: string, label: string) => void; portraits?: Record<string, { hash: string; alt: string }>; selected?: string | null; headingId?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(16);
  const [list, setList] = useState(false);
  // Centre on the character after the next draw: at first, after a zoom, and after the first fit.
  const centreNext = useRef(true);
  const fitted = useRef(false);
  const p = useMemo(() => plan(view, zoom, new Set(view.visible.filter((e) => e.hostile).map((e) => e.id)), portraits), [view, zoom, portraits]);
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    for (const hash of artHashes(p)) {
      if (images.has(hash)) continue;
      const img = new Image();
      img.onload = () => {
        images.set(hash, img);
        setLoaded((n) => n + 1);
      };
      img.src = `/v1/assets/${hash}`;
    }
  }, [p]);

  const characterId = view.character.id;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = p.width * ratio;
    c.height = p.height * ratio;
    c.style.width = `${p.width}px`;
    c.style.height = `${p.height}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(ctx, p, cssColor, getComputedStyle(document.documentElement).getPropertyValue("--font-ui") || "sans-serif", (h) => images.get(h) ?? null);
    if (centreNext.current && scroller.current && scroller.current.clientWidth > 0) {
      centreNext.current = false;
      centre(scroller.current, c, p, characterId);
    }
  }, [p, loaded, list, characterId]);

  // The first time the pane has a size (it may start hidden on small screens), fit the map to it.
  const cols = view.map.rows[0]?.length ?? 0;
  const rows = view.map.rows.length;
  useEffect(() => {
    const el = scroller.current;
    if (!el || fitted.current || cols === 0 || rows === 0) return;
    const ro = new ResizeObserver(() => {
      if (fitted.current || el.clientWidth === 0 || el.clientHeight === 0) return;
      fitted.current = true;
      const fit = Math.floor(Math.min((el.clientWidth - 2 * INSET) / cols, (el.clientHeight - 2 * INSET) / rows));
      centreNext.current = true;
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, rows, list]);

  const zoomBy = (d: number) => {
    centreNext.current = true;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + d)));
  };
  const place = view.room?.label ?? view.map.location;
  const outlines = selected ? p.hits.filter((h) => h.id === selected) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-rule px-3 py-1.5">
        <h2 id={headingId} className="relative min-w-0 truncate text-heading font-semibold text-ink">
          <span className="sr-only">Map: </span>
          {place}
        </h2>
        <div className="flex items-center gap-1">
          {!list && (
            <>
              <IconButton dense label="Zoom out" icon={<ZoomOut {...ICON} />} disabled={zoom <= MIN_ZOOM} onClick={() => zoomBy(-STEP)} className="disabled:opacity-40" />
              <IconButton dense label="Zoom in" icon={<ZoomIn {...ICON} />} disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(STEP)} className="disabled:opacity-40" />
              <IconButton
                dense
                label="Centre on you"
                icon={<LocateFixed {...ICON} />}
                onClick={() => {
                  if (scroller.current && canvas.current) centre(scroller.current, canvas.current, p, characterId);
                }}
              />
            </>
          )}
          <IconButton
            label="List view"
            tone="outline"
            dense
            tip="end"
            icon={<List {...ICON_DENSE} />}
            aria-pressed={list}
            onClick={() => {
              centreNext.current = true;
              setList((l) => !l);
            }}
            className="ml-1"
          />
        </div>
      </div>
      {list ? (
        <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2">
          <TargetList title="In sight" entries={view.visible} selected={selected} onPick={onPick} />
          <TargetList title="Ways on" entries={view.destinations} selected={selected} onPick={onPick} />
        </div>
      ) : (
        <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto bg-desk">
          <div className="flex min-h-full w-max min-w-full items-center justify-center" style={{ padding: INSET }}>
            <div className="relative shrink-0 shadow-[0_0_0_1px_var(--color-rule)]">
              <canvas
                ref={canvas}
                role="img"
                aria-label={`Map of ${place}. Use List view to pick a target with the keyboard.`}
                className="block cursor-pointer"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const hit = hitAt(p, e.clientX - r.left, e.clientY - r.top);
                  if (hit) onPick(hit.id, hit.label);
                }}
              />
              {outlines.map((h, i) => (
                <span key={i} aria-hidden="true" className="pointer-events-none absolute rounded-[2px] outline-2 outline-offset-1 outline-accent" style={{ left: h.x, top: h.y, width: h.w, height: h.h }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
