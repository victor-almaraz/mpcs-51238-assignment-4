// Page structure (docs/design/README.md, Page layouts): the content container, the page header with
// breadcrumb, status, and actions, and titled sections.
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

export function Page({ width = "page", children, className }: { width?: "page" | "form" | "prose"; children: ReactNode; className?: string }) {
  const max = { page: "max-w-page", form: "max-w-form", prose: "max-w-prose" }[width];
  return <div className={cx("mx-auto w-full px-4 py-8 sm:px-6", max, className)}>{children}</div>;
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
            <h1 className="font-display text-[28px] leading-[34px] font-semibold text-ink sm:text-[34px] sm:leading-[40px]">{title}</h1>
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
    <section aria-labelledby={headingId} id={id} className={cx("mb-10", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={headingId} className="font-display text-[21px] leading-[28px] font-semibold text-ink">
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

/** A main column with an aside beside it on expanded screens, under it otherwise. */
export function WithAside({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">{children}</div>
      <aside className="flex min-w-0 flex-col gap-6">{aside}</aside>
    </div>
  );
}
