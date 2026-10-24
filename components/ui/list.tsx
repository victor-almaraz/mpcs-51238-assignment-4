// Row lists: title, metadata, a badge, and trailing actions (docs/design/README.md, Components).
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cx("divide-y divide-rule overflow-hidden rounded-card border border-rule bg-page", className)}>{children}</ul>;
}

export function ListRow({ title, href, meta, badge, actions, icon }: { title: ReactNode; href?: string; meta?: ReactNode; badge?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 text-muted">{icon}</span>}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {href ? (
              <Link href={href} className="font-medium text-ink hover:text-accent hover:underline">
                {title}
              </Link>
            ) : (
              <span className="font-medium text-ink">{title}</span>
            )}
            {badge}
          </div>
          {meta && <div className="text-caption text-muted">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </li>
  );
}

export function DescriptionList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
      {items.map(([term, value], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{term}</dt>
          <dd className="min-w-0 text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
