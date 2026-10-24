"use client";
// Direct controls (app-flow.md, Play interface: Action bar; api.md, submit_action): the pending
// choice, the stored declaration, and the tools valid for what the view shows, so an adventure plays
// without the parser. Picking a thing on the map selects it here. The composer (docs/design/README.md,
// Play) places the choice and the selection's actions above the text input and the quick actions under it.
import { useState, type ReactNode } from "react";
import { Box, DoorOpen, Eye, Footprints, Hourglass, MapPin, MessageCircle, Package, Search, Sparkles, Swords, Tent, User, X } from "lucide-react";
import type { View } from "@/lib/engine";
import { Button } from "@/components/ui/button";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { cx } from "@/components/ui/cx";

export type Act = (tool: string, args: Record<string, unknown>, label: string) => void;

interface Props {
  view: View;
  selected: string | null;
  onSelect: (id: string | null) => void;
  act: Act;
  busy: boolean;
}

/** The icon for a kind of map target. */
export function kindIcon(kind: string): ReactNode {
  if (kind === "creature") return <Swords {...ICON_DENSE} />;
  if (kind === "door") return <DoorOpen {...ICON_DENSE} />;
  if (kind === "item") return <Package {...ICON_DENSE} />;
  if (kind === "container") return <Box {...ICON_DENSE} />;
  if (kind === "room" || kind === "link") return <MapPin {...ICON_DENSE} />;
  if (kind === "character" || kind === "npc") return <User {...ICON_DENSE} />;
  return <Sparkles {...ICON_DENSE} />;
}

function Action({ busy, onClick, children, icon }: { busy: boolean; onClick: () => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <Button size="sm" disabled={busy} onClick={onClick} icon={icon}>
      {children}
    </Button>
  );
}

function Target({ label, kind, onClear, children }: { label: string; kind: string; onClear: () => void; children: ReactNode }) {
  return (
    <div role="group" aria-label={`Actions for ${label}`} className="flex flex-col gap-2 rounded-card border border-accent-line bg-accent-soft/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-label font-medium text-ink">
          <span className="text-accent">{kindIcon(kind)}</span>
          <span className="truncate">{label}</span>
        </p>
        <button type="button" onClick={onClear} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-control px-2 text-caption text-muted hover:bg-desk hover:text-ink">
          <X {...ICON_DENSE} />
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** The pending choice as buttons, or the actions of the selected target, with the NPC talk form. */
export function TargetActions({ view, selected, onSelect, act, busy }: Props) {
  const [topic, setTopic] = useState("");
  const [utterance, setUtterance] = useState("");
  const choice = view.pending_choice;
  if (choice) {
    return (
      <div role="group" aria-labelledby="pending-choice" className="flex flex-col gap-2">
        <p id="pending-choice" className="text-label font-medium text-ink">
          {choice.prompt}
        </p>
        <div className="flex flex-wrap gap-2">
          {choice.options.map((o) => (
            <button key={o.id} type="button" disabled={busy} className="inline-flex h-9 items-center rounded-control border border-accent bg-page px-4 text-control font-medium text-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-55" onClick={() => act("choose", { option_id: o.id }, o.label)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const entity = view.visible.find((e) => e.id === selected);
  const destination = view.destinations.find((d) => d.id === selected);
  const npc = view.actions.npcs.find((n) => n.id === selected);
  const item = view.actions.inventory.find((i) => i.id === selected);
  const ability = view.actions.abilities.find((a) => a.id === selected);
  const clear = () => onSelect(null);

  return (
    <>
      {(entity || destination || npc) && (
        <Target label={entity?.label ?? destination?.label ?? npc?.name ?? ""} kind={entity?.kind ?? destination?.kind ?? "npc"} onClear={clear}>
          {destination && (
            <Action busy={busy} icon={<Footprints {...ICON_DENSE} />} onClick={() => act("move", { to_id: destination.id }, `Move to ${destination.label}`)}>
              Move there
            </Action>
          )}
          {entity && (
            <Action busy={busy} icon={<Eye {...ICON_DENSE} />} onClick={() => act("examine", { target_id: entity.id }, `Examine ${entity.label}`)}>
              Examine
            </Action>
          )}
          {entity?.kind === "creature" && (
            <Action busy={busy} icon={<Swords {...ICON_DENSE} />} onClick={() => act("attack", { target_id: entity.id }, `Attack ${entity.label}`)}>
              Attack
            </Action>
          )}
          {entity && !destination && entity.kind !== "creature" && !entity.in_reach && (
            <Action busy={busy} icon={<Footprints {...ICON_DENSE} />} onClick={() => act("move", { to_id: entity.id }, `Move to ${entity.label}`)}>
              Go to it
            </Action>
          )}
          {entity?.kind === "item" && entity.in_reach && (
            <Action busy={busy} onClick={() => act("take", { entity_id: entity.id }, `Take ${entity.label}`)}>
              Take
            </Action>
          )}
          {entity?.contents?.map((c) => (
            <Action key={c.id} busy={busy} onClick={() => act("take", { entity_id: c.id }, `Take ${c.label}`)}>
              Take {c.label}
            </Action>
          ))}
          {entity?.verbs?.map((verb) => (
            <Action key={verb} busy={busy} onClick={() => act("interact", { target_id: entity.id, verb }, `${verb[0]!.toUpperCase()}${verb.slice(1)} ${entity.label}`)}>
              {verb[0]!.toUpperCase() + verb.slice(1)}
            </Action>
          ))}
          {npc && (
            <form
              className="flex w-full flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act("talk", { npc_id: npc.id, ...(topic ? { topic_id: topic } : {}), utterance: utterance || "Hello." }, `Talk to ${npc.name}`);
                setUtterance("");
              }}
            >
              <select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-8 rounded-control border border-border bg-page px-2 text-label text-ink">
                <option value="">No topic</option>
                {npc.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input aria-label="What you say" value={utterance} maxLength={500} onChange={(e) => setUtterance(e.target.value)} placeholder="What you say" className="h-8 min-w-40 flex-1 rounded-control border border-border bg-page px-2 text-label text-ink placeholder:text-muted" />
              <Button type="submit" size="sm" disabled={busy} icon={<MessageCircle {...ICON_DENSE} />}>
                Talk
              </Button>
            </form>
          )}
        </Target>
      )}

      {(item || ability) && (
        <Target label={item?.label ?? ability?.label ?? ""} kind={item ? "item" : "ability"} onClear={clear}>
          {item && (
            <>
              <Action busy={busy} onClick={() => act("use", { item_id: item.id }, `Use ${item.label}`)}>
                Use
              </Action>
              <Action busy={busy} onClick={() => act("drop", { item_id: item.id }, `Drop ${item.label}`)}>
                Drop
              </Action>
            </>
          )}
          {ability && (
            <Action busy={busy} onClick={() => act("ability", { ability_id: ability.id }, ability.label)}>
              Use on self
            </Action>
          )}
          {ability &&
            view.visible
              .filter((v) => v.kind === "creature")
              .map((v) => (
                <Action key={v.id} busy={busy} onClick={() => act("ability", { ability_id: ability.id, target_id: v.id }, `${ability.label} on ${v.label}`)}>
                  On {v.label}
                </Action>
              ))}
        </Target>
      )}
      {!entity && !destination && !npc && !item && !ability && <p className="text-caption text-muted">Select something on the map or in a list to act on it.</p>}
    </>
  );
}

/** Look, Search, Wait, and Rest, with the stored declaration. Nothing while a choice is pending. */
export function QuickActions({ view, act, busy, declaration, className }: { view: View; act: Act; busy: boolean; declaration: { tool: string; label: string } | null; className?: string }) {
  if (view.pending_choice) return null;
  const quick = "inline-flex h-8 items-center gap-1.5 rounded-control px-2 max-sm:px-1.5 text-label font-medium text-ink hover:bg-desk disabled:cursor-not-allowed disabled:opacity-55";
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {declaration && (
        <p className="text-caption text-muted">
          Declared: <span className="font-medium text-ink">{declaration.label}</span>. Choose another action to change it.
        </p>
      )}
      <div role="group" aria-label="Quick actions" className="-mx-1 flex flex-wrap gap-1">
        <button type="button" disabled={busy} className={quick} onClick={() => act("examine", {}, "Look around")}>
          <Eye {...ICON_DENSE} />
          Look around
        </button>
        {view.mode === "exploration" && (
          <button type="button" disabled={busy} className={quick} onClick={() => act("search", {}, "Search")}>
            <Search {...ICON_DENSE} />
            Search
          </button>
        )}
        <button type="button" disabled={busy} className={quick} onClick={() => act("wait", {}, "Wait")}>
          <Hourglass {...ICON_DENSE} />
          Wait
        </button>
        {view.mode === "exploration" && (
          <button type="button" disabled={busy} className={quick} onClick={() => act("rest", { kind: "short" }, "Short rest")}>
            <Tent {...ICON_DENSE} />
            Short rest
          </button>
        )}
      </div>
    </div>
  );
}
