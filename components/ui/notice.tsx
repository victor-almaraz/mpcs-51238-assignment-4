// Inline notices and the form error summary (docs/design/README.md, Feedback and status).
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "border-accent-line bg-accent-soft text-ink", icon: <Info size={18} aria-hidden="true" className="text-accent" /> },
  success: { box: "border-success bg-success-soft text-ink", icon: <CircleCheck size={18} aria-hidden="true" className="text-success" /> },
  warning: { box: "border-warning bg-warning-soft text-ink", icon: <TriangleAlert size={18} aria-hidden="true" className="text-warning" /> },
  danger: { box: "border-danger bg-danger-soft text-ink", icon: <CircleAlert size={18} aria-hidden="true" className="text-danger" /> },
};

export function Notice({ tone = "info", title, children, className, live }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; live?: boolean }) {
  const t = tones[tone];
  const role = live ? (tone === "danger" ? "alert" : "status") : undefined;
  return (
    <div role={role} data-notice className={cx("flex gap-3 rounded-card border px-4 py-3", t.box, className)}>
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <div className="min-w-0 flex-1 text-body">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
