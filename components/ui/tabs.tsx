"use client";
// Tabs for sections of one page (WAI-ARIA APG tabs: arrow keys move between tabs). A row too wide for
// the screen scrolls, and fades at the edge that has more tabs beyond it.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
  const list = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const update = () => setMore({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);
  const fade = more.left && more.right ? "[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]" : more.right ? "[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]" : more.left ? "[mask-image:linear-gradient(to_right,transparent,black_2rem)]" : undefined;
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
      <div ref={list} role="tablist" aria-label={label} className={cx("relative mb-6 flex gap-6 overflow-x-auto border-b border-rule", fade)}>
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
              onClick={(e) => {
                setCurrent(t.id);
                e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
              onKeyDown={(e) => onKey(e, i)}
              className={cx("-mb-px h-10 shrink-0 border-b-2 text-control font-medium", selected ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink")}
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
