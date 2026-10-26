"use client";
// The history filter (docs/design/README.md, Game lobby, schedule, history): everything, narration
// only, or player actions only. Entries carry data-narration and data-actor; the filter hides the rest.
import { useState, type ReactNode } from "react";
import { Choice } from "@/components/ui/field";

const OPTIONS = [
  { id: "all", label: "Everything" },
  { id: "narration", label: "Narration" },
  { id: "actions", label: "Player actions" },
] as const;

export function HistoryFilter({ children }: { children: ReactNode }) {
  const [show, setShow] = useState<(typeof OPTIONS)[number]["id"]>("all");
  return (
    <div data-show={show} className="data-[show=actions]:[&_[data-actor=false]]:hidden data-[show=narration]:[&_[data-narration=false]]:hidden">
      {/* The options wrap among themselves, so a wrapped option lines up with the first, not with "Show". */}
      <fieldset className="mb-6 flex items-start gap-x-4 rounded-card border border-rule bg-page px-4 py-1">
        <legend className="sr-only">Show</legend>
        <span aria-hidden="true" className="flex min-h-10 shrink-0 items-center text-label font-medium text-muted">
          Show
        </span>
        <div className="flex min-w-0 flex-wrap gap-x-4">
          {OPTIONS.map((o) => (
            <Choice key={o.id} type="radio" name="history-filter" value={o.id} checked={show === o.id} onChange={() => setShow(o.id)} label={o.label} />
          ))}
        </div>
      </fieldset>
      {children}
    </div>
  );
}
