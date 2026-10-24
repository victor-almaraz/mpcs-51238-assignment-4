// A standalone page: one centred card holding the page's h1, for public pages that ask one thing
// (an invitation, an invite link, sign-in) or state one thing (closed, offline) (docs/design/README.md,
// Screens: Operator console, legal and public pages).
import type { ReactNode } from "react";
import { cx } from "./cx";

export function Standalone({ icon, eyebrow, title, description, children, footer, wide }: { icon?: ReactNode; eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="flex justify-center px-4 py-10 sm:px-6 sm:py-16">
      <div className={cx("flex w-full flex-col gap-5 rounded-card border border-rule bg-page p-6 sm:p-8", wide ? "max-w-form" : "max-w-[28rem]")}>
        {icon && <span className="flex size-12 items-center justify-center rounded-card bg-accent-soft text-accent">{icon}</span>}
        <div>
          {eyebrow && <p className="mb-1 text-caption font-medium text-muted">{eyebrow}</p>}
          <h1 className="text-[24px] leading-[30px] font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-2 text-muted">{description}</p>}
        </div>
        {children}
        {footer && <div className="border-t border-rule pt-4 text-caption text-muted">{footer}</div>}
      </div>
    </div>
  );
}
