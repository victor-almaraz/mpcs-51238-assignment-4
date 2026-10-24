// Buttons (docs/design/README.md, Components): primary (one per view), secondary, quiet, danger.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type Variant = "primary" | "secondary" | "quiet" | "danger";
export type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-ui font-medium transition-colors duration-[var(--duration-open)] disabled:cursor-not-allowed disabled:opacity-55";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-page hover:bg-accent-strong",
  secondary: "border border-border bg-page text-ink hover:bg-desk",
  quiet: "text-accent hover:bg-accent-soft",
  danger: "border border-danger bg-page text-danger hover:bg-danger-soft",
};
const sizes: Record<Size, string> = { md: "h-9 px-4 text-control", sm: "h-8 px-3 text-label" };

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string): string {
  return cx(base, variants[variant], sizes[size], className);
}

type Common = { variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children: ReactNode };

export function Button({ variant, size, icon, className, children, type = "button", ...rest }: Common & Omit<ComponentProps<"button">, "children" | "className">) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, icon, className, children, href, ...rest }: Common & { href: string } & Omit<ComponentProps<"a">, "children" | "className" | "href">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
