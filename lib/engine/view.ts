// Views (api.md, "View"): the state of an instance visible to one character. Visibility follows the
// parser-context rules (tools.md, "Parser context"): no hidden or unseen entities, locks, flags, or stages.

import { direction, footprintDistance, type Cell } from "../grid";
import type { Summary } from "../systems";
import { content, type Content } from "./content";
import { Ctx } from "./ctx";
import { applyEffects } from "./effects";
import { inAttackReach, inTouch } from "./movement";
import { holds, roomOf } from "./requirements";
import type { Bundles, LightLevel, State } from "./types";
import { Perception, bodyOf, isLit, placement, roomCells, type Body } from "./world";
import { Rng } from "../rng";
export { Perception };

export interface ViewEntry {
  id: string;
  label: string;
  kind: string;
  at?: Cell;
  footprint?: [number, number];
  distance: number;
  direction: string;
  in_reach?: boolean;
  open?: boolean;
  illumination?: LightLevel;
  lit?: boolean;
  /** Containers with capacity in reach. */
  contents?: { id: string; label: string }[];
  /** Verbs `interact` accepts, for entities in reach. */
  verbs?: string[];
}

export interface View {
  character_id: string;
  mode: string;
  round: { number: number; resolution: string; declared: string[]; waiting_on: string[] };
  character: { id: string; location: string; room: string | null; at: Cell; sheet: unknown; summary: Summary; currencies: unknown[] };
  pending_choice: { prompt: string; options: { id: string; label: string }[] } | null;
  room: { id: string; label: string; tags: string[] } | null;
  map: {
    location: string;
    rows: string[];
    terrain: Record<string, { label: string }>;
    legend: Record<string, string>;
    rooms: { id: string; label: string; area: [number, number, number, number][] }[];
    links: { id: string; label: string; at: Cell }[];
    light: string[];
  };
  destinations: ViewEntry[];
  visible: ViewEntry[];
  party: { id: string; name: string; room: string | null; at: Cell; summary: Summary }[];
  /** What direct controls offer: carried items, abilities, and the NPCs `talk` accepts with their topics. */
  // SPEC_ISSUES.md#view-direct-play: labels and verbs from parser context, so play works without the parser.
  actions: {
    inventory: { id: string; label: string }[];
    abilities: { id: string; label: string }[];
    npcs: { id: string; name: string; topics: { id: string; label: string }[] }[];
  };
}

export function labelOf(c: Content, state: State, id: string): string {
  const ch = state.characters[id];
  if (ch) return (ch.sheet.name as string | undefined) ?? id;
  const e = state.entities[id];
  if (!e) return id;
  if (e.npc !== undefined) return c.npc(e.npc)?.name ?? id;
  return c.template(e.ref).label;
}

function relative(state: State, c: Content, viewer: Body, id: string): { distance: number; direction: string } {
  const p = placement(state, c, id)!;
  const metric = c.bundles.system.SPATIAL.metric;
  return { distance: footprintDistance(viewer.at, viewer.footprint, p.at, p.footprint, metric), direction: direction(p.at[0] - viewer.at[0], p.at[1] - viewer.at[1]) };
}

/** Coins of an amount, from the largest denomination down. */
function coins(amount: number, denominations: Record<string, { label: string; value: number }>) {
  const out: { id: string; label: string; count: number }[] = [];
  let rest = amount;
  for (const [id, d] of Object.entries(denominations).sort(([, a], [, b]) => b.value - a.value)) {
    const count = Math.floor(rest / d.value);
    if (count > 0) out.push({ id, label: d.label, count });
    rest -= count * d.value;
  }
  return out;
}

export function view(state: State, bundles: Bundles, characterId: string): View {
  const c = content(bundles);
  const ch = state.characters[characterId];
  if (!ch) throw new Error(`unknown character ${characterId}`);
  const ctx = new Ctx(state, c, new Rng(0), applyEffects);
  const body = bodyOf(state, c, characterId)!;
  const perception = new Perception(state, c);
  const loc = state.locations[ch.location]!;
  const here = roomOf(state, characterId)?.room ?? null;

  // Map: seen cells only; light for cells a party member in this location perceives.
  const width = loc.rows[0]?.length ?? 0;
  const rows = loc.rows.map((row, y) => [...row].map((chr, x) => (loc.seen[y]?.[x] === "1" ? chr : " ")).join(""));
  const party = Object.keys(state.characters).filter((id) => state.characters[id]!.location === ch.location).map((id) => bodyOf(state, c, id)!);
  const illum = perception.illum(ch.location);
  const light = loc.rows.map((row, y) =>
    [...row]
      .map((_, x) => {
        const cell: Cell = [x, y];
        if (!party.some((b) => perception.perceives(b, cell))) return "0";
        const level = illum[y * width + x]!;
        return level === "bright" ? "2" : level === "dim" ? "1" : "0";
      })
      .join(""),
  );
  const seenRoom = (id: string) => {
    const r = loc.rooms[id]!;
    return r.visited || roomCells(loc, id).some(([x, y]) => loc.seen[y]?.[x] === "1");
  };
  const terrain: Record<string, { label: string }> = {};
  for (const id of new Set(Object.values(loc.legend))) terrain[id] = { label: c.terrain(id)?.label ?? id };

  // Visible entities.
  const visible: ViewEntry[] = [];
  for (const id of Object.keys(state.entities).sort()) {
    const e = state.entities[id]!;
    if (e.location !== ch.location || e.at === undefined || !perception.visible(body, id)) continue;
    const p = placement(state, c, id)!;
    const entry: ViewEntry = { id, label: labelOf(c, state, id), kind: e.kind, at: p.at, footprint: [p.footprint[0], p.footprint[1]], ...relative(state, c, body, id) };
    if (e.kind === "creature") {
      const { range } = c.bundles.system.reach(ctx.combatant(characterId), null);
      entry.in_reach = inAttackReach(ctx, body, id, range);
    } else entry.in_reach = inTouch(ctx, characterId, id);
    if (e.kind === "door") entry.open = e.open === true;
    const level = perception.level(ch.location, p.at);
    if (level !== "bright") entry.illumination = level;
    if (isLit(c, e)) entry.lit = true;
    const capacity = e.kind === "container" ? (c.template(e.ref) as { capacity?: number }).capacity : undefined;
    if (capacity !== undefined && entry.in_reach) entry.contents = (e.contents ?? []).map((i) => ({ id: i, label: labelOf(c, state, i) }));
    if (entry.in_reach && e.kind !== "creature") {
      const t = c.template(e.ref) as { verbs?: Record<string, unknown>; light?: unknown };
      const verbs = Object.keys(t.verbs ?? {});
      if (e.kind === "door") verbs.push(e.open ? "close" : "open");
      if (e.kind !== "item" && t.light) verbs.push(e.lit ? "extinguish" : "light");
      if (verbs.length > 0) entry.verbs = [...new Set(verbs)];
    }
    visible.push(entry);
  }

  // Destinations: known rooms, visible doors, seen links.
  const destinations: ViewEntry[] = [];
  const metric = c.bundles.system.SPATIAL.metric;
  for (const id of Object.keys(loc.rooms)) {
    if (id === here || !seenRoom(id)) continue;
    const cells = roomCells(loc, id);
    let best = { distance: Infinity, cell: cells[0]! };
    for (const cell of cells) {
      const d = footprintDistance(body.at, body.footprint, cell, [1, 1], metric);
      if (d < best.distance) best = { distance: d, cell };
    }
    destinations.push({ id, label: loc.rooms[id]!.label, kind: "room", distance: best.distance, direction: direction(best.cell[0] - body.at[0], best.cell[1] - body.at[1]) });
  }
  for (const entry of visible) if (entry.kind === "door") destinations.push({ id: entry.id, label: entry.label, kind: "door", distance: entry.distance, direction: entry.direction });
  const links: View["map"]["links"] = [];
  for (const [id, link] of Object.entries(loc.links)) {
    if (loc.seen[link.at[1]]?.[link.at[0]] !== "1") continue;
    links.push({ id, label: link.label, at: link.at });
    destinations.push({ id, label: link.label, kind: "link", distance: footprintDistance(body.at, body.footprint, link.at, [1, 1], metric), direction: direction(link.at[0] - body.at[0], link.at[1] - body.at[1]) });
  }

  // Currencies: character-scoped int flags with a currency.
  const currencies: unknown[] = [];
  for (const [flag, def] of Object.entries(c.adventure.flags)) {
    if (def.type !== "int" || def.currency === undefined) continue;
    const [ns, id] = def.currency.split(":");
    const setting = c.bundles.settings.find((s) => s.namespace === ns);
    const currency = setting?.manifest.currency;
    if (!currency || currency.id !== id) continue;
    const amount = (def.scope === "character" ? state.character_flags[characterId]?.[flag] : state.flags[flag]) as number;
    currencies.push({ flag, label: currency.label, amount, coins: coins(amount, currency.denominations) });
  }

  const pending = state.pending_choices[characterId];
  const r = state.round;
  const characters = r.participants.filter((id) => state.characters[id]);
  const waiting =
    r.resolution === "sequential"
      ? r.order && r.turn_index !== null && r.order[r.turn_index] !== undefined && state.characters[r.order[r.turn_index]!]
        ? [r.order[r.turn_index]!]
        : []
      : r.order === null
        ? characters.filter((id) => !r.declarations[id])
        : [];
  return {
    character_id: characterId,
    mode: state.mode,
    round: { number: r.number, resolution: r.resolution, declared: Object.keys(r.declarations).sort(), waiting_on: waiting },
    character: { id: characterId, location: ch.location, room: here, at: ch.at, sheet: ch.sheet, summary: c.bundles.system.summary(ch.sheet), currencies },
    pending_choice: pending ? { prompt: pending.prompt, options: pending.options.map((o) => ({ id: o.id, label: o.label })) } : null,
    room: here !== null ? { id: here, label: loc.rooms[here]!.label, tags: loc.rooms[here]!.tags } : null,
    map: {
      location: ch.location,
      rows,
      terrain,
      legend: loc.legend,
      rooms: Object.keys(loc.rooms)
        .filter(seenRoom)
        .map((id) => ({ id, label: loc.rooms[id]!.label, area: loc.rooms[id]!.area })),
      links,
      light,
    },
    destinations,
    visible,
    party: Object.keys(state.characters)
      .filter((id) => id !== characterId)
      .sort()
      .map((id) => ({ id, name: labelOf(c, state, id), room: roomOf(state, id)?.room ?? null, at: state.characters[id]!.at, summary: c.bundles.system.summary(state.characters[id]!.sheet) })),
    actions: {
      inventory: ch.items.map((id) => ({ id, label: labelOf(c, state, id) })),
      abilities: ((ch.sheet.abilities as string[] | undefined) ?? []).map((ref) => ({ id: ref, label: c.ability(ref)?.label ?? ref })),
      npcs: visible
        .filter((v) => state.entities[v.id]?.npc !== undefined && roomOf(state, v.id)?.room === here)
        .map((v) => {
          const npc = c.npc(state.entities[v.id]!.npc!)!;
          const topics = Object.entries(npc.topics ?? {})
            .filter(([, t]) => holds(ctx, t.when as never, characterId))
            .map(([id, t]) => ({ id, label: t.label }));
          return { id: v.id, name: npc.name, topics };
        }),
    },
  };
}

/** Labels for narration: characters and entities, rooms of any location, abilities, and endings. */
export function labelsFor(states: readonly State[], bundles: Bundles) {
  const c = content(bundles);
  return {
    entity: (id: string) => {
      const s = states.find((x) => x.characters[id] || x.entities[id]);
      return s ? labelOf(c, s, id) : id;
    },
    room: (id: string) => {
      for (const s of states) for (const loc of Object.values(s.locations)) if (loc.rooms[id]) return loc.rooms[id]!.label;
      return id;
    },
    ability: (ref: string) => c.ability(ref)?.label ?? ref,
    ending: (id: string) => c.adventure.manifest.endings[id]?.label ?? id,
  };
}
