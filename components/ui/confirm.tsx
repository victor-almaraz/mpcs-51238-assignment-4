"use client";
// A destructive submit behind a confirm dialog (docs/design/README.md, Button: danger is filled only in
// a confirm dialog). The trigger opens a modal on the native <dialog> element (WAI-ARIA APG alert
// dialog): Cancel has focus first, Escape and the backdrop close it, and focus returns to the trigger.
// The dialog sits inside the trigger's form, so its confirm button submits that form with its fields.
import { useId, useRef, type ReactNode } from "react";
import { Button, type Size } from "./button";
import { IconButton, type IconTone } from "./icon-button";
import type { TipAlign } from "./tip";

interface ConfirmProps {
  /** The trigger's words; for an icon trigger, its accessible name and tooltip. */
  label: string;
  icon?: ReactNode;
  /** A text button (the default) or an icon button with a tooltip. */
  as?: "button" | "icon";
  size?: Size;
  tone?: IconTone;
  tip?: TipAlign;
  className?: string;
  /** The dialog's question, such as "End Thursday table?". */
  title: string;
  /** One sentence on what happens and whether it can be undone. */
  description: string;
  /** The confirm button's words, such as "End game". */
  confirm: string;
}

export function ConfirmButton({ label, icon, as = "button", size, tone = "danger", tip, className, title, description, confirm }: ConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const open = () => ref.current?.showModal();
  const close = () => ref.current?.close();
  return (
    <>
      {as === "icon" ? (
        <IconButton label={label} icon={icon} tone={tone} tip={tip} className={className} aria-haspopup="dialog" onClick={open} />
      ) : (
        <Button variant="danger" size={size} icon={icon} className={className} aria-haspopup="dialog" onClick={open}>
          {label}
        </Button>
      )}
      <dialog
        ref={ref}
        role="alertdialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-rule bg-raised p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-overlay"
      >
        <div className="flex flex-col gap-3 p-4">
          <h2 id={`${id}-title`} className="text-heading font-semibold">
            {title}
          </h2>
          <p id={`${id}-description`} className="text-body">
            {description}
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button autoFocus onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="danger-filled" onClick={close}>
              {confirm}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
