// Narrator context (tools.md, Narrator context): the commit's shared events, labels and dispositions of
// what they name, facts produced by the commit, the room, and positions relative to the actor. Nothing
// else from materials reaches the narrator.

import type { GameEvent, View } from "../engine";

export interface NarratorContext {
  style: { style: string; person: "second" | "third"; max_sentences: number };
  actor: { id: string; name: string } | null;
  events: GameEvent[];
  labels: Record<string, string>;
  dispositions: Record<string, string>;
  facts: string[];
  improvise: { category: string; intent: string; suggestions: { tool: string; args: Record<string, unknown>; label: string }[]; streak: number } | null;
  room: { label: string; summary_tags: string[]; light: string } | null;
  positions: Record<string, { distance: number; direction: string }>;
  /** On the start commit, what opens the game: the adventure's title, premise, and opening text, and the party. */
  opening: Opening | null;
}

export interface Opening {
  title: string;
  premise: string | null;
  text: string | null;
  party: string[];
}

const NAMES = ["actor", "target", "entity", "item", "door", "npc", "to", "participant"];

/** Ids of characters, entities, and items an event names. */
export function namedIds(events: readonly GameEvent[]): string[] {
  const out = new Set<string>();
  for (const e of events) {
    const p = e as unknown as Record<string, unknown>;
    for (const f of NAMES) if (typeof p[f] === "string" && !(e.type === "moved" && f === "to")) out.add(p[f] as string);
    if (Array.isArray(p.revealed)) for (const id of p.revealed) if (typeof id === "string") out.add(id);
  }
  return [...out];
}

export function narratorContext(input: {
  style: NarratorContext["style"];
  actor: { id: string; name: string } | null;
  events: GameEvent[];
  facts: string[];
  label: (id: string) => string;
  disposition: (id: string) => string | undefined;
  /** The actor's view after the commit, for the room and positions. */
  view: View | null;
  improvise: NarratorContext["improvise"];
  opening?: Opening | null;
}): NarratorContext {
  const named = namedIds(input.events);
  const labels: Record<string, string> = {};
  const dispositions: Record<string, string> = {};
  const positions: Record<string, { distance: number; direction: string }> = {};
  for (const id of named) {
    labels[id] = input.label(id);
    const d = input.disposition(id);
    if (d) dispositions[id] = d;
    const seen = input.view?.visible.find((e) => e.id === id);
    if (seen) positions[id] = { distance: seen.distance, direction: seen.direction };
  }
  const v = input.view;
  const [x, y] = v?.character.at ?? [0, 0];
  const light = ({ "2": "bright", "1": "dim", "0": "dark" } as Record<string, string>)[v?.map.light[y]?.[x] ?? "0"] ?? "dark";
  return {
    style: input.style,
    actor: input.actor,
    // Coordinates never reach a model; `positions` says where things are.
    events: input.events.map((e) => {
      const { at: _at, ...rest } = e as unknown as Record<string, unknown>;
      void _at;
      return rest as unknown as GameEvent;
    }),
    labels,
    dispositions,
    facts: input.facts,
    improvise: input.improvise,
    room: v?.room ? { label: v.room.label, summary_tags: v.room.tags, light } : null,
    positions,
    opening: input.opening ?? null,
  };
}
