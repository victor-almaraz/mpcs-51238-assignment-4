"use client";
// Details behind an info icon (docs/design/README.md, Character creation): the icon button sits beside
// its subject and shows or hides the details under it. The button is named for what it explains and
// reports its state with aria-expanded; the details stay out of the subject's accessible name.
import { Info } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ICON_DENSE, IconButton } from "./icon-button";

export function WithInfo({ label, info, children, className }: { label: string; info: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">{children}</div>
        <IconButton dense tip="end" label={label} icon={<Info {...ICON_DENSE} />} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="mt-1 text-muted aria-expanded:bg-accent-soft aria-expanded:text-accent" />
      </div>
      <div id={id} hidden={!open} className="pb-2 text-caption text-muted">
        {info}
      </div>
    </div>
  );
}
