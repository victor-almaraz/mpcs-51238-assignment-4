"use client";
// Pane switchers for the play workspace (docs/design/README.md, Play): underlined tabs above a side
// pane, and the compact tab bar at the foot. The panes stay mounted (CSS shows one per size class), so
// each switcher only names its panes by id. WAI-ARIA APG tabs: arrow keys, Home, and End move.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export interface PaneTab<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** The id of the pane this tab shows. */
  controls: string;
  /** New events on the pane while it is not shown. */
  count?: number;
}

function badge(count: number, floating: boolean) {
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" className={cx("tabular inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-semibold text-page", floating && "absolute -top-1.5 left-3")}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function PaneTabs<T extends string>({ tabs, current, onChange, label, variant = "underline", className }: { tabs: PaneTab<T>[]; current: T; onChange: (id: T) => void; label: string; variant?: "underline" | "bar"; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + tabs.length) % tabs.length;
    onChange(tabs[j]!.id);
    refs.current[j]?.focus();
  };
  const bar = variant === "bar";
  return (
    <div role="tablist" aria-label={label} className={cx(bar ? "grid auto-cols-fr grid-flow-col" : "flex gap-1 px-2", className)}>
      {tabs.map((t, i) => {
        const selected = t.id === current;
        const count = !selected && t.count ? t.count : 0;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={t.controls}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              "relative font-medium",
              bar
                ? cx("flex h-14 flex-col items-center justify-center gap-0.5 text-caption", selected ? "text-accent" : "text-muted hover:text-ink")
                : cx("-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-label", selected ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"),
            )}
          >
            {bar && selected && <span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent" />}
            <span className="relative inline-flex">
              {t.icon}
              {bar && badge(count, true)}
            </span>
            <span>
              {t.label}
              {count > 0 && <span className="sr-only">, {count} new</span>}
            </span>
            {!bar && badge(count, false)}
          </button>
        );
      })}
    </div>
  );
}
