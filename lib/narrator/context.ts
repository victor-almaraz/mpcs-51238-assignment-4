// Narrator context (tools.md, Narrator context): the commit's shared events, labels and dispositions of
// what they name, facts produced by the commit, the room, positions relative to the actor, and the scene
// the actor sees, which bounds what narration may mention. Nothing else from materials reaches the narrator.

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
  /** What the actor sees and carries after the commit: the only things narration may mention besides the events and facts. */
  scene: Scene | null;
  /** When the commit is a conversation: who is spoken to, what was said, and what the NPC can speak about. */
  talk: Talk | null;
  /** On the start commit, what opens the game: the adventure's title, premise, and opening text, and the party. */
  opening: Opening | null;
}

export interface Scene {
  /** The nearest visible entities, by label, with where they are and whether they are open or hostile. */
  visible: { label: string; distance: number; direction: string; open?: boolean; hostile?: true }[];
  /** The ways on: doors and passages, by label. */
  exits: string[];
  carrying: string[];
  /** Each character in the party, with its health and status in the rules system's terms. */
  party: { name: string; health: string; status: string }[];
}

/** How many visible entities the scene lists, nearest first. */
const SCENE_VISIBLE = 12;

/** The scene from the view of `name`'s character: labels only, no ids or coordinates. */
export function sceneOf(v: View, name: string): Scene {
  const entry = (e: View["visible"][number]) => ({ label: e.label, distance: e.distance, direction: e.direction, ...(e.open !== undefined ? { open: e.open } : {}), ...(e.hostile ? { hostile: true as const } : {}) });
  return {
    visible: [...v.visible].sort((a, b) => a.distance - b.distance).slice(0, SCENE_VISIBLE).map(entry),
    exits: v.destinations.map((d) => d.label),
    carrying: v.actions.inventory.map((i) => i.label),
    party: [{ name, summary: v.character.summary }, ...v.party].map((p) => ({ name: p.name, health: p.summary.health, status: p.summary.status })),
  };
}

export interface Talk {
  npc: string;
  disposition: string | null;
  utterance: string;
  /** The topic's label when the player raised one; its brief is in `facts`. */
  topic: string | null;
  /** The labels of the topics the NPC will discuss with the actor now. */
  topics: string[];
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

/** The conversation of a commit with a `talked` event, from the actor's view after it. */
function talkOf(events: readonly GameEvent[], input: { label: (id: string) => string; disposition: (id: string) => string | undefined; topicLabel?: (npc: string, topic: string) => string | undefined }, v: View | null): Talk | null {
  const t = events.find((e) => e.type === "talked") as { npc?: string; topic?: string; utterance?: string } | undefined;
  if (!t?.npc) return null;
  return {
    npc: input.label(t.npc),
    disposition: input.disposition(t.npc) ?? null,
    utterance: t.utterance ?? "",
    topic: t.topic ? (input.topicLabel?.(t.npc, t.topic) ?? null) : null,
    topics: v?.actions.npcs.find((n) => n.id === t.npc)?.topics.map((x) => x.label) ?? [],
  };
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
  /** A topic's label, for the conversation. */
  topicLabel?: (npc: string, topic: string) => string | undefined;
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
    scene: v ? sceneOf(v, input.actor?.name ?? input.label(v.character.id)) : null,
    talk: talkOf(input.events, input, v),
    opening: input.opening ?? null,
  };
}
