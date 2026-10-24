"use client";
// Dialogs and sheets on the native <dialog> element (WAI-ARIA APG modal dialog): showModal moves focus
// in and keeps it there, Escape closes, and focus returns to the opener.
import { X } from "lucide-react";
import { ICON, IconButton } from "./icon-button";
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "./cx";

export function Sheet({ open, onClose, title, side = "right", children }: { open: boolean; onClose: () => void; title: string; side?: "right" | "bottom" | "center"; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const place = {
    right: "ml-auto mr-0 h-dvh max-h-dvh w-[min(24rem,100vw)] rounded-none",
    bottom: "mb-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-card rounded-b-none",
    center: "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card",
  }[side];
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx("border border-rule bg-raised p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-overlay", place)}
    >
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <h2 className="text-heading font-semibold">{title}</h2>
        <IconButton label="Close" icon={<X {...ICON} />} tip="end" onClick={onClose} />
      </div>
      <div className="relative overflow-y-auto p-4">{children}</div>
    </dialog>
  );
}
