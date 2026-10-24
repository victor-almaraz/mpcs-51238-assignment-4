"use client";
// Tabs for sections of one page (WAI-ARIA APG tabs: arrow keys move between tabs).
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

export interface Tab {
  id: string;
  label: ReactNode;
  panel: ReactNode;
}

export function Tabs({ tabs, initial, label }: { tabs: Tab[]; initial?: string; label: string }) {
  const [current, setCurrent] = useState(initial ?? tabs[0]?.id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + tabs.length) % tabs.length;
    setCurrent(tabs[j]!.id);
    refs.current[j]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-6 flex gap-1 relative overflow-x-auto border-b border-rule">
        {tabs.map((t, i) => {
          const selected = t.id === current;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`${base}-${t.id}-tab`}
              aria-selected={selected}
              aria-controls={`${base}-${t.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setCurrent(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cx("-mb-px h-10 shrink-0 border-b-2 px-3 text-control font-medium", selected ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink")}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-${t.id}-panel`} aria-labelledby={`${base}-${t.id}-tab`} hidden={t.id !== current} tabIndex={0}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}
