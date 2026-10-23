// Parser context and tool definitions (tools.md, Parser context; Tool definitions; Argument sources).
// Built from a character's view, which already omits hidden and unseen things; this strips coordinates
// and adds what the parser needs. Ids only, never coordinates, flags, stages, locks, or secrets.

import type { View } from "../engine";

export interface ParserContext {
  mode: string;
  round: { resolution: string; can_act: boolean; declared: { tool: string; args: Record<string, unknown> } | null };
  character: { id: string; name: string; conditions: string[]; summary: View["character"]["summary"]; speed: number; illumination: string };
  pending_choice: { prompt: string; options: { id: string; label: string }[] } | null;
  room: { id: string; label: string; summary_tags: string[]; light: string } | null;
  destinations: { id: string; label: string; kind: string; distance: number; direction: string }[];
  visible: {
    id: string;
    label: string;
    kind: string;
    distance: number;
    direction: string;
    in_reach: boolean;
    verbs?: string[];
    illumination?: string;
    lit?: boolean;
    contents?: { id: string; label: string }[];
  }[];
  inventory: { id: string; label: string }[];
  abilities: { id: string; label: string }[];
  npcs: { id: string; name: string; distance: number; direction: string; topics: { id: string; label: string }[] }[];
  recent: string[];
  input: string;
  /** Set on a retry: the engine's rejection of the previous call (tools.md, Retry). */
  error?: { code: string; detail: string };
}

export interface ContextExtras {
  conditions: string[];
  speed: number;
  can_act: boolean;
  declared: { tool: string; args: Record<string, unknown> } | null;
  /** The last narration texts, newest last. */
  recent: string[];
  input: string;
}

const LIGHT: Record<string, string> = { "2": "bright", "1": "dim", "0": "dark" };

function doorLabel(label: string, open: boolean | undefined): string {
  return `${label} (${open ? "open" : "closed"})`;
}

export function parserContext(v: View, x: ContextExtras): ParserContext {
  const [cx, cy] = v.character.at;
  const illumination = LIGHT[v.map.light[cy]?.[cx] ?? "0"] ?? "dark";
  const doors = new Map(v.visible.filter((e) => e.kind === "door").map((e) => [e.id, e.open]));
  return {
    mode: v.mode,
    round: { resolution: v.round.resolution, can_act: x.can_act, declared: x.declared },
    character: { id: v.character_id, name: String((v.character.sheet as { name?: string }).name ?? v.character_id), conditions: x.conditions, summary: v.character.summary, speed: x.speed, illumination },
    pending_choice: v.pending_choice,
    room: v.room ? { id: v.room.id, label: v.room.label, summary_tags: v.room.tags, light: illumination } : null,
    destinations: v.destinations.map((d) => ({ id: d.id, label: d.kind === "door" ? doorLabel(d.label, doors.get(d.id)) : d.label, kind: d.kind, distance: d.distance, direction: d.direction })),
    visible: v.visible.map((e) => ({
      id: e.id,
      label: e.kind === "door" ? doorLabel(e.label, e.open) : e.label,
      kind: e.kind,
      distance: e.distance,
      direction: e.direction,
      in_reach: e.in_reach ?? false,
      ...(e.verbs ? { verbs: e.verbs } : {}),
      ...(e.illumination ? { illumination: e.illumination } : {}),
      ...(e.lit ? { lit: true } : {}),
      ...(e.contents ? { contents: e.contents } : {}),
    })),
    inventory: v.actions.inventory,
    abilities: v.actions.abilities,
    npcs: v.actions.npcs.map((n) => {
      const seen = v.visible.find((e) => e.id === n.id);
      return { id: n.id, name: n.name, distance: seen?.distance ?? 0, direction: seen?.direction ?? "here", topics: n.topics };
    }),
    // At most the last 3 narration texts, 300 characters each.
    recent: x.recent.slice(-3).map((t) => t.slice(0, 300)),
    input: x.input,
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false; minProperties?: number };
}

const DESCRIPTIONS: Record<string, string> = {
  move: "Move to a room, door, link, or thing, or away from a creature.",
  attack: "Attack a creature. Use for any hostile physical or ranged action against a creature.",
  ability: "Use one of the character's abilities, optionally on a target.",
  use: "Use an item the character carries, optionally on a target.",
  interact: "Operate, open, close, light, or otherwise work a door, fixture, container, or obstacle with the named verb.",
  examine: "Look closely at something, or at the surroundings when no target is given.",
  search: "Search the surroundings for hidden things.",
  take: "Pick up an item, or take something out of a container in reach.",
  drop: "Put down an item the character carries.",
  give: "Give a carried item to another character or put it into a container in reach.",
  talk: "Speak to a non-player character, optionally about one of its topics.",
  rest: "Rest, briefly or at length.",
  wait: "Do nothing this round.",
  choose: "Choose one option of the pending choice.",
  improvise: "Use ONLY when no other tool can express the input. Changes nothing in the game. Produces a short response that redirects the player to valid actions.",
};

const ids = (list: readonly { id: string }[]) => [...new Set(list.map((e) => e.id))];
const enumOf = (values: string[]) => ({ type: "string", enum: values });

/**
 * Definitions for the tools in `tools`, with every id argument an enum of ids valid in the context.
 * A tool whose required enum is empty is omitted.
 */
export function toolDefinitions(c: ParserContext, tools: readonly string[]): ToolDefinition[] {
  const creatures = ids(c.visible.filter((e) => e.kind === "creature"));
  const party = [c.character.id];
  const interactable = c.visible.filter((e) => e.kind === "door" || e.kind === "fixture" || e.kind === "container" || (e.kind === "obstacle" && e.verbs));
  const verbs = [...new Set(interactable.flatMap((e) => e.verbs ?? (e.kind === "door" ? ["open", "close"] : [])))];
  const takeable = [...ids(c.visible.filter((e) => e.kind === "item" || e.kind === "container")), ...c.visible.flatMap((e) => (e.in_reach ? (e.contents ?? []).map((i) => i.id) : []))];
  const inventory = ids(c.inventory);
  const topics = [...new Set(c.npcs.flatMap((n) => n.topics.map((t) => t.id)))];

  const specs: Record<string, { properties: Record<string, unknown>; required: string[]; minProperties?: number } | null> = {
    move: { properties: { to_id: enumOf([...ids(c.destinations), ...ids(c.visible)]), away_from_id: enumOf(creatures) }, required: [], minProperties: 1 },
    attack: creatures.length ? { properties: { target_id: enumOf(creatures), ...(inventory.length ? { item_id: enumOf(inventory) } : {}) }, required: ["target_id"] } : null,
    ability: c.abilities.length ? { properties: { ability_id: enumOf(ids(c.abilities)), target_id: enumOf([...creatures, ...party]) }, required: ["ability_id"] } : null,
    use: inventory.length ? { properties: { item_id: enumOf(inventory), target_id: enumOf([...ids(c.visible), ...party]) }, required: ["item_id"] } : null,
    interact: interactable.length && verbs.length ? { properties: { target_id: enumOf(ids(interactable)), verb: enumOf(verbs) }, required: ["target_id", "verb"] } : null,
    examine: { properties: { target_id: enumOf([...ids(c.visible), ...ids(c.destinations.filter((d) => d.kind === "link")), ...inventory]) }, required: [] },
    search: { properties: {}, required: [] },
    take: takeable.length ? { properties: { entity_id: enumOf([...new Set(takeable)]) }, required: ["entity_id"] } : null,
    drop: inventory.length ? { properties: { item_id: enumOf(inventory) }, required: ["item_id"] } : null,
    give: inventory.length ? { properties: { item_id: enumOf(inventory), target_id: enumOf(ids(c.visible.filter((e) => e.kind === "container" && e.in_reach))) }, required: ["item_id", "target_id"] } : null,
    talk: c.npcs.length ? { properties: { npc_id: enumOf(ids(c.npcs)), ...(topics.length ? { topic_id: enumOf(topics) } : {}), utterance: { type: "string", maxLength: 200 } }, required: ["npc_id", "utterance"] } : null,
    rest: { properties: { kind: enumOf(["short", "long"]) }, required: ["kind"] },
    wait: { properties: {}, required: [] },
    choose: c.pending_choice ? { properties: { option_id: enumOf(ids(c.pending_choice.options)) }, required: ["option_id"] } : null,
    improvise: {
      properties: {
        category: enumOf(["flavor", "impossible", "unsupported", "meta", "unclear", "overreach"]),
        intent: { type: "string", maxLength: 120 },
        suggestions: { type: "array", maxItems: 2, items: { type: "object", properties: { tool: { type: "string" }, args: { type: "object" } }, required: ["tool", "args"], additionalProperties: false } },
      },
      required: ["category", "intent", "suggestions"],
    },
  };

  const out: ToolDefinition[] = [];
  for (const name of tools) {
    const spec = specs[name];
    if (!spec) continue;
    // An empty enum on an optional argument removes that argument.
    const properties = Object.fromEntries(Object.entries(spec.properties).filter(([, p]) => !(p as { enum?: string[] }).enum || (p as { enum: string[] }).enum.length > 0));
    if (spec.required.some((r) => !(r in properties))) continue;
    if (spec.minProperties && Object.keys(properties).length === 0) continue;
    out.push({ name, description: DESCRIPTIONS[name]!, input_schema: { type: "object", properties, required: spec.required, additionalProperties: false, ...(spec.minProperties ? { minProperties: spec.minProperties } : {}) } });
  }
  return out;
}
