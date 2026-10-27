// An empty section: an icon, one sentence, and the action that fills it.
import type { ReactNode } from "react";
import { cx } from "./cx";

/** An empty region: icon, sentence, action. Placed directly on a page rather than in a Section, pass `className="mb-10"` so it keeps a section's spacing. */
export function EmptyState({ icon, children, action, className }: { icon?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center gap-3 rounded-card border border-dashed border-rule px-6 py-10 text-center", className)}>
      {icon && (
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-card border-[1.5px] border-dashed border-border text-muted">
          {icon}
        </span>
      )}
      <p className="max-w-prose text-muted">{children}</p>
      {action}
    </div>
  );
}
