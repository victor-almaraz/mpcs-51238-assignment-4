// Page structure (docs/design/README.md, Page layouts): the content container, the page header with
// breadcrumb, status, and actions, and titled sections.
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * The content container, centred in the window. A form or prose page is a narrower column, centred
 * in turn (docs/design/README.md, Page widths). The last block's bottom margin is dropped, so every
 * page ends the same distance above the footer.
 */
export function Page({ width = "page", children, className }: { width?: "page" | "form" | "prose"; children: ReactNode; className?: string }) {
  const column = { page: undefined, form: "max-w-form", prose: "max-w-prose" }[width];
  return (
    <div className={cx("mx-auto w-full max-w-page px-4 pt-8 pb-12 sm:px-6 [&>*:last-child]:mb-0", className)}>
      {column ? <div className={cx(column, "mx-auto [&>*:last-child]:mb-0")}>{children}</div> : children}
    </div>
  );
}

export interface Crumb {
  label: string;
  href: string;
}

export function PageHeader({ title, description, crumbs, status, actions }: { title: ReactNode; description?: ReactNode; crumbs?: Crumb[]; status?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 text-caption text-muted">
          <ol className="flex flex-wrap items-center gap-1">
            {crumbs.map((c, i) => (
              <li key={c.href} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true">/</span>}
                <Link href={c.href} className="inline-flex min-h-6 items-center hover:text-accent hover:underline">
                  {c.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-title font-semibold text-ink sm:text-display">{title}</h1>
            {status}
          </div>
          {description && <p className="mt-1 max-w-prose text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, description, actions, children, className, id }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} id={id} data-head={description ? "described" : "plain"} className={cx("mb-10", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={headingId} className="font-display text-section font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="text-caption text-muted">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A main column with an aside beside it on expanded screens, under it otherwise, one section's
 * distance below the main column's last block. Beside a first section, the aside's first card is
 * level with the section's first card (globals.css).
 */
export function WithAside({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div data-with-aside className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
      <div className="min-w-0 [&>*:last-child]:mb-0">{children}</div>
      <aside className="flex min-w-0 flex-col gap-6">{aside}</aside>
    </div>
  );
}
