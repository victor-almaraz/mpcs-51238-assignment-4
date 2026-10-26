"use client";
// The play workspace's character and party panes (docs/design/README.md, Play): the viewer's character
// with health, resources, inventory, and abilities, any of which can be picked for the action bar; and
// the rest of the party with health, room, and turn mark.
import type { ReactNode } from "react";
import type { View } from "@/lib/engine";
import { StatusBadge } from "@/components/ui/badge";
import { ElementTile, elementSymbol } from "@/components/ui/tile";
import { cx } from "@/components/ui/cx";
import { ArtIcon } from "@/components/art";
import { MARKS, markOf, type Round } from "./turn-tracker";

/** A character as an element tile: its symbol, in the accent for the viewer's own character. */
function Avatar({ name, mine }: { name: string; mine?: boolean }) {
  return <ElementTile symbol={elementSymbol(name)} tone={mine ? "accent" : "neutral"} size="sm" />;
}

/** A health string such as "7/10 HP" as a fraction, for its bar. */
function healthFraction(health: string): number | null {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(health);
  if (!m || Number(m[2]) <= 0) return null;
  return Math.max(0, Math.min(1, Number(m[1]) / Number(m[2])));
}

function HealthBar({ health }: { health: string }) {
  const f = healthFraction(health);
  if (f === null) return null;
  return (
    <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-desk">
      <span className={cx("block h-full rounded-full", f <= 0.25 ? "bg-danger" : f <= 0.5 ? "bg-warning" : "bg-success")} style={{ width: `${f * 100}%` }} />
    </span>
  );
}

/** The viewer's character, `name`; an item or ability picked here becomes the action bar's `selected`. */
export function CharacterPane({ name, view, selected, onPick }: { name: string; view: View; selected: string | null; onPick: (id: string) => void }) {
  const s = view.character.summary;
  const pickRow = (id: string, label: ReactNode, art: Parameters<typeof ArtIcon>[0]["art"]) => {
    const on = selected === id;
    return (
      <li key={id}>
        <button type="button" aria-pressed={on} onClick={() => onPick(id)} className={cx("flex min-h-10 w-full items-center gap-3 rounded-control px-2 py-1.5 text-left text-label", on ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-desk")}>
          <ArtIcon art={art} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
      </li>
    );
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} mine />
        <div className="min-w-0 flex-1">
          <h2 id="character-title" className="truncate text-heading font-semibold text-ink">
            {name}
          </h2>
        </div>
        {s.status !== "active" && <StatusBadge status={s.status} />}
      </div>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
        <div className="flex flex-col gap-1.5 rounded-card border border-rule p-3">
          <dt className="text-caption text-muted">Health</dt>
          <dd className="tabular text-heading font-semibold text-ink">{s.health}</dd>
          <HealthBar health={s.health} />
        </div>
        {Object.entries(s.resources ?? {}).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-card border border-rule p-3">
            <dt className="text-caption text-muted">{k}</dt>
            <dd className="tabular text-heading font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="inventory-title">
        <h3 id="inventory-title" className="mb-1 text-label font-medium text-muted">
          Inventory
        </h3>
        {view.actions.inventory.length === 0 ? <p className="text-caption text-muted">Empty</p> : <ul className="-mx-2 flex flex-col">{view.actions.inventory.map((i) => pickRow(i.id, i.label, i.art))}</ul>}
      </section>
      <section aria-labelledby="abilities-title">
        <h3 id="abilities-title" className="mb-1 text-label font-medium text-muted">
          Abilities
        </h3>
        {view.actions.abilities.length === 0 ? <p className="text-caption text-muted">None</p> : <ul className="-mx-2 flex flex-col">{view.actions.abilities.map((a) => pickRow(a.id, a.label, a.art))}</ul>}
      </section>
    </div>
  );
}

/** The rest of the party in the viewer's location, with each member's mark in `round`. */
export function PartyPane({ view, round }: { view: View; round: Round }) {
  const roomLabel = (id: string | null) => (id ? view.map.rooms.find((r) => r.id === id)?.label : undefined);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <h2 id="party-title" className="sr-only">
        Party
      </h2>
      {view.party.length === 0 ? (
        <p className="text-muted">You are alone.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.party.map((p) => {
            const mark = markOf(round, p.id);
            const where = roomLabel(p.room);
            return (
              <li key={p.id} className="flex flex-col gap-2 rounded-card border border-rule p-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label font-semibold text-ink">{p.name}</p>
                    <p className="text-caption text-muted">
                      <span className="tabular">{p.summary.health}</span>
                      {where && ` · ${where}`}
                    </p>
                  </div>
                  {mark && (
                    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium", MARKS[mark].className)}>
                      {MARKS[mark].icon}
                      {MARKS[mark].word}
                    </span>
                  )}
                </div>
                <HealthBar health={p.summary.health} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
