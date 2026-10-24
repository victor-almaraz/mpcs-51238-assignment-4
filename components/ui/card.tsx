// Cards and card grids (docs/design/README.md, Components).
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

const surface = "rounded-card border border-rule bg-page";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(surface, "p-4", className)}>{children}</div>;
}

/**
 * A card whose title is its link; metadata and badges sit under it. Nothing else inside is interactive.
 * `tile` (an ElementTile) leads the card; `icon` is a plain icon for cards without one.
 */
export function CardLink({ href, title, meta, badge, icon, tile, children }: { href: string; title: ReactNode; meta?: ReactNode; badge?: ReactNode; icon?: ReactNode; tile?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx(surface, "group relative flex gap-4 p-4 transition-colors hover:border-accent-line hover:bg-accent-soft/40")}>
      {tile}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {icon && !tile && <span className="mt-0.5 text-muted">{icon}</span>}
            <h3 className="min-w-0 text-heading font-semibold text-ink">
              <Link href={href} className="after:absolute after:inset-0 after:content-[''] group-hover:text-accent">
                {title}
              </Link>
            </h3>
          </div>
          {badge}
        </div>
        {meta && <div className="text-caption text-muted">{meta}</div>}
        {children}
      </div>
    </div>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
