// Instance start: locations, placements, characters, flags, stages, start effects, and round 1
// (adventure-packs.md, "adventure.yaml"; data-model.md, "Instance state").

import type { AuthoredLocation, GeneratedLocation } from "../bundle/adventure";
import type { Placement } from "../bundle/setting";
import { footprintCells, type Cell } from "../grid";
import { Rng, type U64 } from "../rng";
import { content, type Content } from "./content";
import { Ctx, Reject, reject } from "./ctx";
import { applyEffects, carry } from "./effects";
import { resolveRoom } from "./requirements";
import { afterAction, startRound } from "./rounds";
import type { Bundles, JoiningCharacter, LocationState, Result, State } from "./types";
import { key, moverTests, roomCells } from "./world";

/** A generated location in the compiled authored format (generation.md, "Output"). */
export interface GeneratedMap {
  rows: string[];
  rooms: Record<string, { label: string; tags: string[]; role?: string; depth?: number; light: "bright" | "dim" | "dark"; area: [number, number, number, number][] }>;
  links: Record<string, { label: string; at: Cell; to: { location: string; link: string } }>;
  contents: (Placement & { ref: string; at: Cell })[];
  /** Room aliases: `entry`, `boss`, anchor ids, and link ids. */
  aliases: Record<string, string>;
}

/** Generates a location; the engine passes the location id and spec, and the instance seed. */
export type Generate = (id: string, spec: GeneratedLocation, bundles: Bundles, seed: U64) => { ok: true; map: GeneratedMap } | { ok: false; error: string };

export interface StartInput {
  bundles: Bundles;
  characters: readonly JoiningCharacter[];
  seed: U64;
  generate?: Generate;
}

const BUILTIN_LEGEND: Readonly<Record<string, string>> = { ".": "floor", "#": "wall", " ": "void" };

function emptyState(): State {
  return {
    rng_counter: 0,
    mode: "exploration",
    clock: { turn: 0 },
    locations: {},
    entities: {},
    characters: {},
    flags: {},
    character_flags: {},
    stages: {},
    fired_triggers: [],
    revealed: [],
    round: { number: 0, mode: "exploration", resolution: "simultaneous", participants: [], declarations: {}, initiative: null, order: null, turn_index: null },
    pending_choices: {},
    combat_area: [],
    combatants: [],
    improvise_streak: {},
    ended: null,
    next_entity: 0,
  };
}

function terrainFor(c: Content, legend: Record<string, string>): LocationState["terrain"] {
  const out: LocationState["terrain"] = {};
  for (const id of new Set(Object.values(legend))) {
    const t = c.terrain(id);
    if (t) out[id] = { obstructs: [...t.obstructs], cost: t.cost };
  }
  return out;
}

function locationFrom(c: Content, rows: string[], legend: Record<string, string>, rooms: GeneratedMap["rooms"], links: GeneratedMap["links"], aliases?: Record<string, string>): LocationState {
  const loc: LocationState = {
    rows: [...rows],
    terrain: terrainFor(c, legend),
    legend,
    rooms: Object.fromEntries(
      Object.entries(rooms).map(([id, r]) => [
        id,
        { label: r.label, tags: [...(r.tags ?? [])], light: r.light ?? "bright", area: r.area.map((a) => [...a] as [number, number, number, number]), visited: false, ...(r.role ? { role: r.role } : {}), ...(r.depth !== undefined ? { depth: r.depth } : {}) },
      ]),
    ),
    links: structuredClone(links),
    seen: rows.map((row) => "0".repeat(row.length)),
  };
  if (aliases) loc.aliases = { ...aliases };
  return loc;
}

/** Placement cells of a room (generation.md, "Population"): free for the footprint, away from doorways if possible. */
function placementCells(ctx: Ctx, location: string, room: string, ref: string): Cell[] {
  const t = ctx.c.template(ref);
  const footprint = t.kind === "item" || t.kind === "door" ? ([1, 1] as const) : t.footprint;
  const probe = { id: "", kind: "creature" as const, side: "entities" as const, location, at: [0, 0] as Cell, footprint };
  const tests = moverTests(ctx.state, ctx.c, probe);
  const occupied = new Set<number>();
  const doors = new Set<number>();
  for (const e of Object.values(ctx.state.entities)) {
    if (e.location !== location || e.at === undefined) continue;
    if (e.kind === "door") doors.add(key(e.at));
    else if (e.kind !== "creature") occupied.add(key(e.at));
  }
  const cells = roomCells(ctx.state.locations[location]!, room).filter((cell) =>
    footprintCells(cell, footprint).every((f) => tests.free(f) && !occupied.has(key(f)) && !doors.has(key(f))),
  );
  const nearDoor = (cell: Cell) => footprintCells(cell, footprint).some(([x, y]) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => doors.has(key([x + dx!, y + dy!]))));
  const away = cells.filter((cell) => !nearDoor(cell));
  return away.length > 0 ? away : cells;
}

/** Places a location's contents in order: fixed cells, then cells chosen by RNG within a room. */
function placeContents(ctx: Ctx, location: string, contents: readonly Placement[]): void {
  for (const p of contents) {
    const extra: Record<string, unknown> = {};
    if (p.lock !== undefined) extra.lock = p.lock;
    if (p.hidden) extra.conditions = [{ id: "hidden", remaining: null }];
    let ref = p.ref;
    let id = p.id;
    if (p.npc !== undefined) {
      const npc = ctx.c.npc(p.npc)!;
      ref = npc.template;
      id = p.npc;
      extra.npc = p.npc;
    }
    if (ref === undefined) continue;
    if (p.at !== undefined) {
      ctx.createEntity(ref, { location, at: p.at }, id, extra as never);
      continue;
    }
    if (p.room === undefined) continue;
    const where = resolveRoom(ctx.state, p.room, location);
    if (!where) continue;
    const count = p.count === undefined ? 1 : typeof p.count === "number" ? p.count : ctx.rng.roll(p.count).total;
    for (let i = 0; i < count; i++) {
      const cells = placementCells(ctx, location, where.room, ref);
      if (cells.length === 0) reject("requirement_unmet", `room '${where.room}' of '${location}' has no placement cell for '${ref}'`);
      ctx.createEntity(ref, { location, at: ctx.rng.pick(cells) }, count === 1 ? id : undefined, structuredClone(extra) as never);
    }
  }
}

/** Builds the initial state of an instance and the events of its start. */
export function startInstance(input: StartInput): Result {
  const { bundles, characters, seed } = input;
  const c = content(bundles);
  const state = emptyState();
  const rng = new Rng(seed, 0);
  const ctx = new Ctx(state, c, rng, applyEffects);
  try {
    // Locations, then their contents, in adventure order.
    const placements: [string, readonly Placement[]][] = [];
    for (const [id, def] of Object.entries(c.adventure.locations)) {
      if (def.kind === "authored") {
        const a = def as AuthoredLocation;
        const legend: Record<string, string> = { ...BUILTIN_LEGEND };
        const legendPlacements: Placement[] = [];
        for (const [ch, entry] of Object.entries(a.map.legend ?? {})) legend[ch] = typeof entry === "string" ? entry : entry.terrain;
        a.map.rows.forEach((row, y) =>
          [...row].forEach((ch, x) => {
            const entry = a.map.legend?.[ch];
            if (entry && typeof entry !== "string") legendPlacements.push({ ref: entry.place, at: [x, y] });
          }),
        );
        state.locations[id] = locationFrom(c, a.map.rows, legend, a.map.rooms as GeneratedMap["rooms"], (a.map.links ?? {}) as GeneratedMap["links"]);
        placements.push([id, [...legendPlacements, ...(a.map.contents ?? [])]]);
      } else {
        if (!input.generate) reject("requirement_unmet", `location '${id}' is generated and no generator was supplied`);
        const g = input.generate(id, def as GeneratedLocation, bundles, seed);
        if (!g.ok) reject("requirement_unmet", `generating '${id}' failed: ${g.error}`);
        state.locations[id] = locationFrom(c, g.map.rows, { ...BUILTIN_LEGEND }, g.map.rooms, g.map.links, g.map.aliases);
        placements.push([id, g.map.contents]);
      }
    }
    for (const [id, list] of placements) placeContents(ctx, id, list);

    // Flags and stages.
    for (const [id, f] of Object.entries(c.adventure.flags)) if (f.scope !== "character") state.flags[id] = f.initial;
    for (const arc of c.adventure.arcs) state.stages[arc.id] = arc.initial;

    // Characters, on the start room's free cells in row-major order, in ascending id.
    const start = c.adventure.manifest.start;
    const room = resolveRoom(state, start.room, start.location);
    if (!room) reject("unknown_id", `start room '${start.room}' does not exist`);
    for (const joining of [...characters].sort((a, b) => (a.id < b.id ? -1 : 1))) joinCharacter(ctx, joining, room.location, room.room);
    state.locations[room.location]!.rooms[room.room]!.visited = true;

    applyEffects(ctx, start.effects as never, { location: start.location });
    startRound(ctx);
    afterAction(ctx);
    state.rng_counter = rng.counter;
    return { ok: true, events: ctx.events, state };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, error: e.error };
    throw e;
  }
}

/** Places a joining character, creates its carried items and starting items, and sets its flags. */
export function joinCharacter(ctx: Ctx, joining: JoiningCharacter, location: string, room: string): void {
  const state = ctx.state;
  const probe = { id: joining.id, kind: "character" as const, side: "characters" as const, location, at: [0, 0] as Cell, footprint: [1, 1] as const };
  const cell = roomCells(state.locations[location]!, room).find(moverTests(state, ctx.c, probe).free);
  if (!cell) reject("requirement_unmet", `room '${room}' has no free cell for '${joining.id}'`);
  for (const ability of (joining.sheet.abilities as string[] | undefined) ?? []) {
    if (!ctx.c.ability(ability)) reject("unknown_id", `ability '${ability}' of '${joining.id}' is not in the instance's materials`);
  }
  const refs = ((joining.sheet.inventory as { ref: string }[] | undefined) ?? []).map((i) => i.ref);
  state.characters[joining.id] = { ...(joining.user_id ? { user_id: joining.user_id } : {}), location, at: cell, sheet: structuredClone(joining.sheet), conditions: [], items: [] };
  for (const ref of refs) {
    if (!ctx.c.hasTemplate(ref)) reject("unknown_id", `item '${ref}' of '${joining.id}' is not in the instance's materials`);
    ctx.createEntity(ref, { carrier: joining.id });
  }
  for (const setting of ctx.c.bundles.settings) {
    const pick = setting.manifest.starting_items;
    if (!pick) continue;
    for (const ref of ctx.drawTable(pick.table, pick.picks)) {
      const item = ctx.createEntity(ref, { location, at: cell });
      carry(ctx, item, joining.id);
    }
  }
  const flags: Record<string, boolean | number | string> = {};
  for (const [id, f] of Object.entries(ctx.c.adventure.flags)) if (f.scope === "character") flags[id] = f.initial;
  state.character_flags[joining.id] = flags;
  state.improvise_streak[joining.id] = 0;
}
