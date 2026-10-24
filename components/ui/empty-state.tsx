// An empty section: an icon, one sentence, and the action that fills it.
import type { ReactNode } from "react";

export function EmptyState({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-rule px-6 py-10 text-center">
      {icon && <span className="text-muted">{icon}</span>}
      <p className="max-w-prose text-muted">{children}</p>
      {action}
    </div>
  );
}
