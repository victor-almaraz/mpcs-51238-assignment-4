// An icon-only button: always named, with a tooltip of the same words (docs/design/README.md).
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

const base = "inline-flex shrink-0 items-center justify-center rounded-control text-ink hover:bg-desk aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent";

export function IconButton({ label, icon, dense, className, type = "button", ...rest }: { label: string; icon: ReactNode; dense?: boolean; className?: string } & Omit<ComponentProps<"button">, "children" | "className">) {
  return (
    <button type={type} aria-label={label} title={label} className={cx(base, dense ? "size-8" : "size-9", className)} {...rest}>
      {icon}
    </button>
  );
}

export function IconLink({ label, icon, href, className, ...rest }: { label: string; icon: ReactNode; href: string; className?: string } & Omit<ComponentProps<"a">, "children" | "className" | "href">) {
  return (
    <Link href={href} aria-label={label} title={label} className={cx(base, "size-9", className)} {...rest}>
      {icon}
    </Link>
  );
}

/** Lucide props for interface icons: 20 px (16 dense), 1.75 stroke at every size. */
export const ICON = { size: 20, strokeWidth: 1.75, absoluteStrokeWidth: true, "aria-hidden": true } as const;
export const ICON_DENSE = { ...ICON, size: 16 } as const;
export type IconNode = ReactNode;
