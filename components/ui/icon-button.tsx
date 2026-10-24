// An icon-only button: always named, with a tooltip of the same words (docs/design/README.md, Icons).
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Tip, type TipAlign, type TipSide } from "./tip";

const base = "relative inline-flex shrink-0 items-center justify-center rounded-control aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent disabled:cursor-not-allowed disabled:text-muted";
const tones = {
  ink: "text-ink hover:bg-desk",
  danger: "text-danger hover:bg-danger-soft",
  // Outlined, to stand with secondary buttons in a toolbar; pressed toggles fill with the accent tint.
  outline: "border border-border text-ink hover:bg-desk aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent",
} as const;
export type IconTone = keyof typeof tones;

interface TipProps {
  label: string;
  icon: ReactNode;
  dense?: boolean;
  tone?: IconTone;
  tip?: TipAlign;
  tipSide?: TipSide;
  className?: string;
}

export function IconButton({ label, icon, dense, tone = "ink", tip, tipSide, className, type = "button", ...rest }: TipProps & Omit<ComponentProps<"button">, "children" | "className">) {
  return (
    <button type={type} aria-label={label} className={cx(base, tones[tone], dense ? "size-8" : "size-9", className)} {...rest}>
      {icon}
      <Tip label={label} align={tip} side={tipSide} />
    </button>
  );
}

export function IconLink({ label, icon, href, dense, tone = "ink", tip, tipSide, className, ...rest }: TipProps & { href: string } & Omit<ComponentProps<"a">, "children" | "className" | "href">) {
  return (
    <Link href={href} aria-label={label} className={cx(base, tones[tone], dense ? "size-8" : "size-9", className)} {...rest}>
      {icon}
      <Tip label={label} align={tip} side={tipSide} />
    </Link>
  );
}

/** Lucide props for interface icons: 20 px (16 dense), 1.75 stroke at every size. */
export const ICON = { size: 20, strokeWidth: 1.75, absoluteStrokeWidth: true, "aria-hidden": true } as const;
export const ICON_DENSE = { ...ICON, size: 16 } as const;
export type IconNode = ReactNode;
