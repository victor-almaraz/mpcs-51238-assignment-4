"use client";
// The play workspace's turn tracker (docs/design/README.md, Play): the game's name, the round, its mode
// and resolution, the turn order with each character's mark, Your turn, Reconnecting, the round's
// countdown, and the author's Advance. The bar scrolls sideways on compact screens.
import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Check, Compass, Hourglass, ListOrdered, Play, SkipForward, Swords, Timer, Users, WifiOff } from "lucide-react";
import type { View } from "@/lib/engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { cx } from "@/components/ui/cx";
import { capitalize } from "@/lib/text";

/** The round as the client tracks it, from the view and the `round` messages. */
export interface Round {
  declared: string[];
  waiting_on: string[];
  current?: string;
  deadline: string | null;
}

type Mark = "current" | "declared" | "waiting";

export const MARKS: Record<Mark, { word: string; icon: ReactNode; className: string }> = {
  current: { word: "current turn", icon: <Play {...ICON_DENSE} />, className: "border-pigment-line bg-pigment text-pigment-ink" },
  declared: { word: "declared", icon: <Check {...ICON_DENSE} />, className: "border-rule bg-desk text-muted" },
  waiting: { word: "waiting", icon: <Hourglass {...ICON_DENSE} />, className: "border-border bg-page text-ink" },
};

/** A character's mark in the round: its turn, declared, waiting, or none. */
export function markOf(round: Round, id: string): Mark | null {
  return round.current === id ? "current" : round.declared.includes(id) ? "declared" : round.waiting_on.includes(id) ? "waiting" : null;
}

// The clock, as an external store: the server snapshot is null, so the server and the first client
// render agree, and the countdown fills in after hydration and ticks every second.
function subscribeClock(tick: () => void) {
  const t = setInterval(tick, 1000);
  return () => clearInterval(t);
}
const clockNow = () => Math.floor(Date.now() / 1000);
const clockServer = () => null;

function Countdown({ deadline }: { deadline: string | null }) {
  const now = useSyncExternalStore(subscribeClock, clockNow, clockServer);
  if (!deadline) return null;
  const left = now === null ? null : Math.max(0, Math.round(new Date(deadline).getTime() / 1000 - now));
  return (
    <span title="Time left in the round" className={cx("tabular inline-flex items-center gap-1.5 text-label", left !== null && left <= 30 ? "text-warning" : "text-ink")}>
      <Timer {...ICON_DENSE} />
      <span className="sr-only">Time left: </span>
      {left === null ? "–:––" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
    </span>
  );
}

/**
 * The tracker for `characterId`, played by the viewer: `members` in turn order, of which `mine` are the
 * viewer's characters. `onAdvance`, when given, shows Advance.
 */
export function TurnTracker({ title, instanceId, view, round, characterId, members, mine, yourTurn, reconnecting, onAdvance }: { title: string; instanceId: string; view: View; round: Round; characterId: string; members: { id: string; name: string }[]; mine: Set<string>; yourTurn: boolean; reconnecting: boolean; onAdvance?: () => void }) {
  const resolution = view.round.resolution === "sequential" ? "one at a time" : "everyone acts at once";
  return (
    <section aria-label="Turn tracker" className="relative flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b border-rule bg-page px-3 whitespace-nowrap sm:px-4">
      <h1 className="max-w-56 shrink-0 truncate text-label font-semibold text-ink max-lg:sr-only">{title}</h1>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-rule max-lg:hidden" />
      <span className="tabular shrink-0 text-label font-semibold text-ink">Round {view.round.number}</span>
      <span className="flex shrink-0 items-center gap-2 max-sm:order-3">
        <span title={`${capitalize(view.mode)}; ${resolution}`} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium", view.mode === "combat" ? "bg-danger-soft text-danger" : "bg-desk text-muted")}>
          {view.mode === "combat" ? <Swords {...ICON_DENSE} /> : <Compass {...ICON_DENSE} />}
          {capitalize(view.mode)}
          {view.round.resolution === "sequential" ? <ListOrdered {...ICON_DENSE} /> : <Users {...ICON_DENSE} />}
          <span className="sr-only">, {resolution}</span>
        </span>
      </span>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-rule max-sm:hidden" />
      <ul aria-label="Turn order" className="flex shrink-0 items-center gap-1.5 max-sm:order-2">
        {members.map((m) => {
          const mark = markOf(round, m.id);
          const meta = mark ? MARKS[mark] : null;
          const chip = cx("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption font-medium", meta?.className ?? "border-rule bg-page text-ink");
          const content = (
            <>
              {meta?.icon}
              {m.name}
              {m.id === characterId && <span className="font-normal text-muted max-lg:sr-only">(you)</span>}
              {meta && <span className="sr-only">, {meta.word}</span>}
            </>
          );
          // SPEC_ISSUES.md#play-character-switch: the user's other characters switch the page to them.
          return (
            <li key={m.id} title={mine.has(m.id) && m.id !== characterId ? `Play as ${m.name}` : meta ? `${m.name}: ${meta.word}` : m.name} className="flex">
              {mine.has(m.id) && m.id !== characterId ? (
                <Link href={`/instances/${instanceId}/play?character=${encodeURIComponent(m.id)}`} aria-label={`Play as ${m.name}${meta ? `, ${meta.word}` : ""}`} className={cx(chip, "border-dashed hover:border-accent hover:text-accent")}>
                  {content}
                </Link>
              ) : (
                <span className={chip}>{content}</span>
              )}
            </li>
          );
        })}
      </ul>
      <span className="flex shrink-0 items-center gap-3 max-sm:order-1 sm:ml-auto sm:pl-2">
        {yourTurn && <Badge tone="pigment">Your turn</Badge>}
        {reconnecting && (
          <span className="inline-flex items-center gap-1.5 text-label text-warning">
            <WifiOff {...ICON_DENSE} />
            Reconnecting
          </span>
        )}
        <Countdown deadline={round.deadline} />
      </span>
      {onAdvance && (
        <Button size="sm" icon={<SkipForward {...ICON_DENSE} />} className="shrink-0 max-sm:order-4" onClick={onAdvance}>
          Advance
        </Button>
      )}
      {/* Compact: the bar scrolls sideways; a fade on its right edge shows that more follows. */}
      <span aria-hidden="true" className="pointer-events-none sticky -right-3 order-last -ml-3 w-10 shrink-0 self-stretch bg-linear-to-l from-page to-transparent sm:hidden" />
    </section>
  );
}
