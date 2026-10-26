// A session's date tile and start time in the viewer's time zone, with what follows the time under it.
// The tile is pigment when the session is live or starts within a day, accent otherwise.
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { DateTile } from "@/components/ui/tile";
import { formatWhen } from "@/components/when";

const DAY = 86_400_000;

export function NextSession({ startsAt, timezone, now, live = false, size = "md", children }: { startsAt: string; timezone: string; now: number; live?: boolean; size?: "md" | "lg"; children?: ReactNode }) {
  const soon = live || Date.parse(startsAt) - now < DAY;
  return (
    <div className={cx("flex min-w-0", size === "lg" ? "items-start gap-4" : "items-center gap-3")}>
      <DateTile date={new Date(startsAt)} timeZone={timezone} size={size} tone={soon ? "pigment" : "accent"} />
      <div className="min-w-0">
        <p className="tabular text-heading font-semibold text-ink">{formatWhen(startsAt, timezone)}</p>
        {children}
      </div>
    </div>
  );
}
