// The element tile (docs/design/README.md, Identity): the logo's periodic-table tile as a motif. A
// square with a small label in the top-left corner, a one- or two-letter symbol, and an optional
// caption, used for characters, campaigns, games, adventures, and session dates.
import type { ReactNode } from "react";
import { cx } from "./cx";

export type TileTone = "accent" | "pigment" | "neutral";
export type TileSize = "sm" | "md" | "lg";

const tones: Record<TileTone, string> = {
  accent: "border-accent-line bg-accent-soft text-accent",
  pigment: "border-pigment-line bg-pigment text-pigment-ink",
  neutral: "border-rule bg-desk text-ink",
};
const sizes: Record<TileSize, { box: string; symbol: string; small: string }> = {
  sm: { box: "size-10 rounded-[5px]", symbol: "text-[15px] leading-none", small: "text-[8px]" },
  md: { box: "size-14 rounded-card", symbol: "text-[20px] leading-none", small: "text-[9px]" },
  lg: { box: "size-[4.5rem] rounded-card", symbol: "text-[26px] leading-none", small: "text-[10px]" },
};

/**
 * A tile; decorative unless `label` names it. `corner` is the small top-left label (an element's
 * atomic number), `caption` the line under the symbol.
 */
export function ElementTile({ symbol, corner, caption, tone = "accent", size = "md", label, className }: { symbol: ReactNode; corner?: ReactNode; caption?: ReactNode; tone?: TileTone; size?: TileSize; label?: string; className?: string }) {
  const s = sizes[size];
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx("relative inline-flex shrink-0 select-none flex-col items-center justify-center border font-ui", tones[tone], s.box, className)}
    >
      {corner !== undefined && <span className={cx("absolute left-1 top-0.5 font-semibold tabular uppercase leading-tight", s.small)}>{corner}</span>}
      <span className={cx("font-semibold tracking-tight", s.symbol, caption !== undefined && "mt-1.5")}>{symbol}</span>
      {caption !== undefined && <span className={cx("mt-0.5 font-medium uppercase leading-tight", s.small)}>{caption}</span>}
    </span>
  );
}

const SKIP = new Set(["the", "a", "an", "of", "and", "on", "in"]);

/**
 * An element-style symbol for a name: the initial in capitals and a second letter in lower case, as
 * chemical symbols are written. "Wren Halloway" is Wh, "The Sunken Archive" is Sa, "Rook" is Ro.
 */
export function elementSymbol(name: string): string {
  const words = name.split(/[\s_-]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const kept = words.filter((w, i) => !(SKIP.has(w.toLowerCase()) && words.length > 1 && i < words.length - 1));
  const letters = (w: string) => [...w].filter((c) => /[\p{L}\p{N}]/u.test(c));
  const first = letters(kept[0] ?? name)[0] ?? "?";
  const second = kept.length > 1 ? letters(kept[1]!)[0] : letters(kept[0] ?? "")[1];
  return first.toUpperCase() + (second ?? "").toLowerCase();
}

/** A date as a tile: the month in the corner, the day as the symbol, the weekday as the caption. */
export function DateTile({ date, timeZone, tone = "accent", size = "md" }: { date: Date; timeZone: string; tone?: TileTone; size?: TileSize }) {
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone, ...o }).format(date);
  return <ElementTile symbol={part({ day: "numeric" })} corner={part({ month: "short" })} caption={part({ weekday: "short" })} tone={tone} size={size} />;
}
