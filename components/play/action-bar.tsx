"use client";
// Direct controls (app-flow.md, Play interface: Action bar; api.md, submit_action): the pending
// choice, the stored declaration, and the tools valid for what the view shows, so an adventure plays
// without the parser. Picking a thing on the map selects it here.
import { useState } from "react";
import type { View } from "@/lib/engine";

export type Act = (tool: string, args: Record<string, unknown>, label: string) => void;

const chip = "rounded-control border border-border px-3 py-1 font-ui text-control hover:bg-accent-soft disabled:opacity-50";
const choiceButton = "rounded-control border border-accent px-3 py-1 font-ui text-control text-accent hover:bg-accent-soft";

export function ActionBar({ view, selected, onSelect, act, busy, declaration }: { view: View; selected: string | null; onSelect: (id: string | null) => void; act: Act; busy: boolean; declaration: { tool: string; label: string } | null }) {
  const [topic, setTopic] = useState("");
  const [utterance, setUtterance] = useState("");
  const choice = view.pending_choice;
  if (choice) {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-ui text-label">{choice.prompt}</p>
        <div className="flex flex-wrap gap-2">
          {choice.options.map((o) => (
            <button key={o.id} type="button" disabled={busy} className={choiceButton} onClick={() => act("choose", { option_id: o.id }, o.label)}>
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

  return (
    <div className="flex flex-col gap-3">
      {declaration && (
        <p className="font-ui text-caption text-muted">
          Declared: {declaration.label}. Choose another action to change it.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={chip} onClick={() => act("wait", {}, "Wait")}>
          Wait
        </button>
        <button type="button" disabled={busy} className={chip} onClick={() => act("examine", {}, "Look around")}>
          Look around
        </button>
        {view.mode === "exploration" && (
          <>
            <button type="button" disabled={busy} className={chip} onClick={() => act("search", {}, "Search")}>
              Search
            </button>
            <button type="button" disabled={busy} className={chip} onClick={() => act("rest", { kind: "short" }, "Short rest")}>
              Short rest
            </button>
          </>
        )}
      </div>

      {(entity || destination || npc) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-2">
          <span className="font-ui text-label">{entity?.label ?? destination?.label ?? npc?.name}</span>
          {destination && (
            <button type="button" disabled={busy} className={chip} onClick={() => act("move", { to_id: destination.id }, `Move to ${destination.label}`)}>
              Move there
            </button>
          )}
          {entity && (
            <button type="button" disabled={busy} className={chip} onClick={() => act("examine", { target_id: entity.id }, `Examine ${entity.label}`)}>
              Examine
            </button>
          )}
          {entity?.kind === "creature" && (
            <button type="button" disabled={busy} className={chip} onClick={() => act("attack", { target_id: entity.id }, `Attack ${entity.label}`)}>
              Attack
            </button>
          )}
          {entity && !destination && entity.kind !== "creature" && !entity.in_reach && (
            <button type="button" disabled={busy} className={chip} onClick={() => act("move", { to_id: entity.id }, `Move to ${entity.label}`)}>
              Go to it
            </button>
          )}
          {entity?.kind === "item" && entity.in_reach && (
            <button type="button" disabled={busy} className={chip} onClick={() => act("take", { entity_id: entity.id }, `Take ${entity.label}`)}>
              Take
            </button>
          )}
          {entity?.contents?.map((c) => (
            <button key={c.id} type="button" disabled={busy} className={chip} onClick={() => act("take", { entity_id: c.id }, `Take ${c.label}`)}>
              Take {c.label}
            </button>
          ))}
          {entity?.verbs?.map((verb) => (
            <button key={verb} type="button" disabled={busy} className={chip} onClick={() => act("interact", { target_id: entity.id, verb }, `${verb[0]!.toUpperCase()}${verb.slice(1)} ${entity.label}`)}>
              {verb[0]!.toUpperCase() + verb.slice(1)}
            </button>
          ))}
          <button type="button" className="font-ui text-caption text-muted" onClick={() => onSelect(null)}>
            Clear
          </button>
        </div>
      )}

      {npc && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act("talk", { npc_id: npc.id, ...(topic ? { topic_id: topic } : {}), utterance: utterance || "Hello." }, `Talk to ${npc.name}`);
            setUtterance("");
          }}
        >
          <select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="rounded-control border border-border bg-page px-2 py-1 font-ui text-control">
            <option value="">No topic</option>
            {npc.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <input aria-label="What you say" value={utterance} maxLength={500} onChange={(e) => setUtterance(e.target.value)} placeholder="What you say" className="min-w-40 flex-1 rounded-control border border-border bg-page px-2 py-1" />
          <button type="submit" disabled={busy} className={chip}>
            Talk
          </button>
        </form>
      )}

      {(item || ability) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-2">
          <span className="font-ui text-label">{item?.label ?? ability?.label}</span>
          {item && (
            <>
              <button type="button" disabled={busy} className={chip} onClick={() => act("use", { item_id: item.id }, `Use ${item.label}`)}>
                Use
              </button>
              <button type="button" disabled={busy} className={chip} onClick={() => act("drop", { item_id: item.id }, `Drop ${item.label}`)}>
                Drop
              </button>
            </>
          )}
          {ability && (
            <button type="button" disabled={busy} className={chip} onClick={() => act("ability", { ability_id: ability.id }, ability.label)}>
              Use on self
            </button>
          )}
          {ability &&
            view.visible
              .filter((v) => v.kind === "creature")
              .map((v) => (
                <button key={v.id} type="button" disabled={busy} className={chip} onClick={() => act("ability", { ability_id: ability.id, target_id: v.id }, `${ability.label} on ${v.label}`)}>
                  On {v.label}
                </button>
              ))}
          <button type="button" className="font-ui text-caption text-muted" onClick={() => onSelect(null)}>
            Clear
          </button>
        </div>
      )}
      {!entity && !destination && !npc && !item && !ability && (
        <p className="font-ui text-caption text-muted">Pick a room, door, or thing on the map or in the lists to act on it.</p>
      )}
    </div>
  );
}
