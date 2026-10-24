"use client";
// The play map (app-flow.md, Play interface: Map): seen cells, rooms, doors, links, visible entities,
// and the party on a canvas; clicking picks an entity, door, link, or room. The list of visible
// entities with distance and direction serves keyboard and screen-reader use.
import { useEffect, useMemo, useRef, useState } from "react";
import type { View } from "@/lib/engine";
import { artHashes, draw, hitAt, plan, type Token } from "@/lib/map/plan";

/** Loaded art, shared across redraws; a failed image stays absent, so its fallback draws. */
const images = new Map<string, HTMLImageElement>();

function cssColor(token: Token): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim() || "#888";
}

export function MapPanel({ view, onPick, portraits = {} }: { view: View; onPick: (id: string, label: string) => void; portraits?: Record<string, { hash: string; alt: string }> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(16);
  const [list, setList] = useState(false);
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
  }, [p, loaded]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="font-ui text-label">{view.room?.label ?? view.map.location}</h2>
        <div className="flex gap-2 font-ui text-caption">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(8, z - 4))}>
            −
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(64, z + 4))}>
            +
          </button>
          <button type="button" aria-pressed={list} onClick={() => setList((l) => !l)}>
            {list ? "Map" : "List"}
          </button>
        </div>
      </div>
      {list ? (
        <ul className="mt-2 font-ui text-caption">
          {view.visible.map((e) => (
            <li key={e.id}>
              <button type="button" className="text-left" onClick={() => onPick(e.id, e.label)}>
                {e.label}
                {(e.art?.portrait ?? e.art?.icon) && <span className="text-muted"> ({(e.art.portrait ?? e.art.icon)!.alt})</span>} · {e.distance} {e.direction}
                {e.in_reach ? " · in reach" : ""}
              </button>
            </li>
          ))}
          {view.visible.length === 0 && <li className="text-muted">Nothing in sight.</li>}
        </ul>
      ) : (
        <div className="mt-2 max-h-[60vh] overflow-auto rounded-control border border-rule">
          <canvas
            ref={canvas}
            role="img"
            aria-label={`Map of ${view.room?.label ?? view.map.location}`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const hit = hitAt(p, e.clientX - r.left, e.clientY - r.top);
              if (hit) onPick(hit.id, hit.label);
            }}
          />
        </div>
      )}
    </div>
  );
}
