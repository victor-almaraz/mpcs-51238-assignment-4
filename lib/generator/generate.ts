// Dungeon generation (generation.md): seeds, the pipeline from room templates to population,
// verification, retries, and output. Steps 1 to 3 are in layout.ts.

import type { AdventureBundle, GeneratedLocation } from "../bundle/adventure";
import type { EntityTemplate, RoomTemplate, SettingBundle, TableEntry } from "../bundle/setting";
import { BUILTIN_TERRAIN, parseMap, type Cell, type Metric, type TerrainType } from "../grid";
import { Rng, draw, fnv1a64, type U64 } from "../rng";
import { Draft, LINK_OCCUPANCY, occupancy, type Placed } from "./draft";
import { AttemptFailed, adjacencies, assignRoles, connect, partition } from "./layout";
import type { GenerateResult, GeneratedContent, GeneratedMap, GeneratedRoom, RoomRole } from "./types";

/** Attempts before the generator returns an error (generation.md, "8. Verification"). */
export const MAX_ATTEMPTS = 20;

const MASK = (1n << 64n) - 1n;

/** The location seed: `draw(instance_seed XOR fnv1a64(location_id), 0)`. */
export function locationSeed(instanceSeed: U64, locationId: string): bigint {
  return draw(new Rng(instanceSeed).seed ^ fnv1a64(locationId), 0);
}

// SPEC_ISSUES.md#generator-attempt-seeds: attempt 0 uses the location seed; retry `attempt`, from 1,
// uses `draw(location_seed, attempt)`.
/** The seed of attempt number `attempt`. */
export function attemptSeed(location: bigint, attempt: number): bigint {
  return attempt === 0 ? location & MASK : draw(location, attempt);
}

// SPEC_ISSUES.md#weighted-tables: a die with the total weight as faces, taking the first entry
// whose cumulative weight reaches the result, in table order.
/** One draw from a weighted table. */
export function pickWeighted<T extends { weight: number }>(rng: Rng, entries: readonly T[]): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.die(total);
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  return entries[entries.length - 1]!;
}

// SPEC_ISSUES.md#generator-probability: one draw `v`; the event happens when `v < p × 2^64`.
function chance(rng: Rng, p: number): boolean {
  const v = rng.next();
  return p >= 1 ? true : v < BigInt(Math.floor(p * 2 ** 64));
}

function count(rng: Rng, n: number | string | undefined): number {
  if (n === undefined) return 1;
  return typeof n === "number" ? n : Math.max(0, rng.roll(n).total);
}

/** A spec or bundle problem that no retry can fix. */
class SpecError extends Error {}

/** Refs, tables, terrain, and the generation pack, across the campaign's bundles. */
class Catalog {
  readonly terrain: Record<string, TerrainType> = { ...BUILTIN_TERRAIN };
  readonly generation: SettingBundle;
  readonly #settings: readonly SettingBundle[];
  readonly #adventure: AdventureBundle;

  constructor(settings: readonly SettingBundle[], adventure: AdventureBundle) {
    this.#settings = settings;
    this.#adventure = adventure;
    for (const s of settings) for (const [id, t] of Object.entries(s.manifest.terrain ?? {})) this.terrain[id] = { obstructs: t.obstructs ?? [], cost: t.cost ?? 1 };
    const generation = settings.find((s) => s.manifest.generation !== undefined);
    if (!generation) throw new SpecError("no setting pack declares generation");
    this.generation = generation;
  }

  #split(ref: string): [string, string] {
    const i = ref.indexOf(":");
    if (i < 0) throw new SpecError(`'${ref}' is not a qualified ref`);
    return [ref.slice(0, i), ref.slice(i + 1)];
  }

  entity(ref: string): EntityTemplate {
    const [ns, key] = this.#split(ref);
    const t = ns === this.#adventure.namespace ? this.#adventure.entities[key] : this.#settings.find((s) => s.namespace === ns)?.entities[key];
    if (!t) throw new SpecError(`unknown entity '${ref}'`);
    return t;
  }

  npcTemplate(npc: string): EntityTemplate {
    const def = this.#adventure.npcs[npc];
    if (!def) throw new SpecError(`unknown NPC '${npc}'`);
    return this.entity(def.template);
  }

  room(ref: string): RoomTemplate {
    const [ns, key] = this.#split(ref);
    const t = this.#settings.find((s) => s.namespace === ns)?.rooms[key];
    if (!t) throw new SpecError(`unknown room template '${ref}'`);
    return t;
  }

  table(ref: string): TableEntry[] {
    const [ns, key] = this.#split(ref);
    const t = this.#settings.find((s) => s.namespace === ns)?.tables[key];
    if (!t || key === "room_labels") throw new SpecError(`unknown table '${ref}'`);
    return t as TableEntry[];
  }

  /** Every container template whose contents draw from `table`, in ascending ref order. */
  containersFor(table: string): string[] {
    const refs: string[] = [];
    const scan = (ns: string, entities: Record<string, EntityTemplate>) => {
      for (const [key, t] of Object.entries(entities)) {
        if (t.kind === "container" && !Array.isArray(t.contents) && t.contents.table === table) refs.push(`${ns}:${key}`);
      }
    };
    for (const s of this.#settings) scan(s.namespace, s.entities);
    scan(this.#adventure.namespace, this.#adventure.entities);
    return refs.sort();
  }
}

/** The spec with the defaults of generation.md, "Spec". */
function withDefaults(spec: GeneratedLocation) {
  return {
    size: spec.generator?.size ?? [40, 28],
    rooms: spec.generator?.rooms ?? [8, 12],
    minRoom: spec.generator?.min_room ?? 3,
    loopRatio: spec.generator?.loop_ratio ?? 0.1,
    encounterTable: spec.population.encounter_table,
    lootTable: spec.population.loot_table,
    roomTemplates: spec.population.room_templates ?? [],
    density: spec.population.density ?? 0.5,
    ambient: spec.population.ambient ?? "bright",
    litRooms: spec.population.lit_rooms ?? 0,
    anchors: spec.anchors ?? [],
    links: spec.links ?? {},
    gates: spec.gates_per_location ?? 1,
  };
}

type Spec = ReturnType<typeof withDefaults>;

function range(lo: number, hi: number): number[] {
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
}

const roomId = (i: number) => `r${i + 1}`;

// SPEC_ISSUES.md#treasure-role: no room has the role `treasure`, so it is never satisfied.
const hasRole = (roles: ReadonlySet<RoomRole>, role: string): boolean => roles.has(role as RoomRole);

interface Attempt {
  draft: Draft;
  boss: number;
  aliases: Record<string, string>;
  /** Template ref → legend characters, in placement order, for the output legend. */
  templateLegends: Record<string, string | { terrain: string; place: string }>[];
}

/** One attempt of the pipeline with one seed. Throws `AttemptFailed` when the attempt fails. */
function attempt(id: string, spec: Spec, catalog: Catalog, metric: Metric, rng: Rng): Attempt {
  const [width, height] = spec.size;

  // 1. Layout.
  const n = rng.pick(range(spec.rooms[0], spec.rooms[1]));
  const regions = partition(width, height, n, spec.minRoom, rng);
  if (regions.length < spec.rooms[0]) throw new AttemptFailed(`${regions.length} regions, fewer than ${spec.rooms[0]}`);

  // 2. Adjacency and connectivity; 3. Roles and depth.
  const selected = connect(regions.length, adjacencies(regions, width, height), spec.loopRatio, rng);
  const layout = assignRoles(regions, selected, width, height, rng);
  const generation = catalog.generation.manifest.generation;
  const draft = new Draft(id, width, height, layout, catalog.terrain, { ref: generation.door, template: catalog.entity(generation.door) });
  const rooms = draft.rooms;
  const all = rooms.map((_, i) => i);

  const placeRandom = (room: number, entity: { ref?: string; npc?: string; id?: string; hidden?: boolean }): Placed => {
    const template = entity.npc !== undefined ? catalog.npcTemplate(entity.npc) : catalog.entity(entity.ref!);
    const occ = occupancy(template);
    const at = draft.chooseCell(room, occ, metric, rng);
    return draft.place({ ...occ, ...entity, at });
  };

  // 4. Room templates.
  const templateLegends: Attempt["templateLegends"] = [];
  for (const ref of spec.roomTemplates) {
    const t = catalog.room(ref);
    const parsed = parseMap(t.map.rows, t.map.legend ?? {});
    // SPEC_ISSUES.md#room-template-rooms: a room holds at most one room template.
    const fits = all.filter((i) => {
      const r = rooms[i]!;
      const roleOk = t.role === "any" || hasRole(r.roles, t.role);
      const depthOk = (t.min_depth === undefined || r.depth >= t.min_depth) && (t.max_depth === undefined || r.depth <= t.max_depth);
      return r.template === undefined && roleOk && depthOk && r.interior[2] >= parsed.width && r.interior[3] >= parsed.height;
    });
    if (fits.length === 0) continue;
    const room = rng.pick(fits);
    const r = rooms[room]!;
    const ox = r.interior[0] + Math.floor((r.interior[2] - parsed.width) / 2);
    const oy = r.interior[1] + Math.floor((r.interior[3] - parsed.height) / 2);
    parsed.terrain.forEach((terrain, i) => {
      if (terrain !== "void") draft.setTerrain([ox + (i % parsed.width), oy + Math.floor(i / parsed.width)], terrain);
    });
    for (const p of parsed.placements) {
      const occ = occupancy(catalog.entity(p.ref));
      draft.place({ ...occ, ref: p.ref, at: [ox + p.at[0], oy + p.at[1]] });
    }
    for (const c of t.contents ?? []) {
      const extra = c.hidden ? { hidden: true } : {};
      if (c.at) {
        const occ = occupancy(catalog.entity(c.ref!));
        draft.place({ ...occ, ref: c.ref, at: [ox + c.at[0], oy + c.at[1]], ...extra });
      } else {
        for (let k = count(rng, c.count); k > 0; k--) placeRandom(room, { ref: c.ref, ...extra });
      }
    }
    r.template = ref;
    // SPEC_ISSUES.md#room-template-rooms: the room takes the template's label and tags.
    r.label = t.label;
    r.tags = [...(t.tags ?? [])];
    templateLegends.push(t.map.legend ?? {});
  }

  // 5. Anchors and links.
  const aliases: Record<string, string> = { r1: "r1", entry: "r1", boss: roomId(layout.boss) };
  const anchored: { placed: Placed; room: number }[] = [];
  for (const a of spec.anchors) {
    const c = a.constraints ?? {};
    const ok = all.filter((i) => {
      const r = rooms[i]!;
      if (c.min_depth !== undefined && r.depth < c.min_depth) return false;
      if (c.max_depth !== undefined && r.depth > c.max_depth) return false;
      if (!(c.room_tags ?? []).every((t) => r.tags.includes(t))) return false;
      return a.shared === true || (r.anchors === 0 && r.template === undefined);
    });
    const preferred = c.prefer_role === undefined ? [] : ok.filter((i) => hasRole(rooms[i]!.roles, c.prefer_role!));
    const candidates = preferred.length > 0 ? preferred : ok;
    if (candidates.length === 0) throw new AttemptFailed(`no room satisfies anchor '${a.id}'`);
    const room = rng.pick(candidates);
    rooms[room]!.anchors++;
    const place = a.place.npc !== undefined ? { npc: a.place.npc } : { ref: a.place.ref, ...(a.place.id !== undefined ? { id: a.place.id } : {}) };
    anchored.push({ placed: placeRandom(room, place), room });
    aliases[a.id] = roomId(room);
  }
  const linkIds = Object.keys(spec.links).sort();
  const linkCells: Record<string, Cell> = {};
  for (const link of linkIds) {
    const role = spec.links[link]!.role;
    const candidates = all.filter((i) => hasRole(rooms[i]!.roles, role));
    if (candidates.length === 0) throw new AttemptFailed(`no room has role '${role}' for link '${link}'`);
    const room = rng.pick(candidates);
    const cell = draft.chooseCell(room, LINK_OCCUPANCY, metric, rng);
    draft.addLink(link, cell);
    linkCells[link] = cell;
    aliases[link] = roomId(room);
  }

  // 6. Locks.
  if (spec.gates > 0) {
    const deepest = anchored.reduce<{ room: number } | undefined>((best, a) => (!best || rooms[a.room]!.depth > rooms[best.room]!.depth ? a : best), undefined);
    // SPEC_ISSUES.md#lock-path: the path is the BFS tree path of rooms; its doorways join consecutive rooms.
    const path: number[] = [];
    for (let r = deepest?.room ?? layout.boss; r !== -1; r = layout.parent[r]!) path.unshift(r);
    const pathDoors = path.slice(1).map((r, i) => {
      const prev = path[i]!;
      const d = layout.doorways.findIndex((w) => (w.a === prev && w.b === r) || (w.a === r && w.b === prev));
      return d;
    });
    const locks = Object.keys(generation.locks).sort();
    const gates: { door: number; key: string }[] = [];
    let lastPosition = -1;
    for (let g = 0; g < spec.gates; g++) {
      const candidates = pathDoors
        .map((door, position) => ({ door, position }))
        .filter(({ door, position }) => position > lastPosition && layout.doorways[door]!.owner !== 0)
        .sort((p, q) => p.door - q.door);
      // SPEC_ISSUES.md#lock-candidates: with no doorway left on the path, the attempt fails.
      if (candidates.length === 0) throw new AttemptFailed(`no doorway on the path for lock ${g + 1}`);
      const { door, position } = rng.pick(candidates);
      lastPosition = position;
      const lockRef = rng.pick(locks);
      const key = generation.locks[lockRef]!;
      const d = draft.doors[door]!;
      const template = catalog.entity(lockRef);
      Object.assign(d, occupancy(template), { ref: lockRef, lock: { has_item: key }, templateLock: template.kind === "door" ? template.lock : undefined });
      gates.push({ door, key });
    }
    // SPEC_ISSUES.md#lock-key-order: keys are placed after every lock is chosen, so "any later lock" is known.
    gates.forEach(({ key }, g) => {
      const closed = new Set(gates.slice(g).map((x) => x.door));
      const seen = new Set([0]);
      const queue = [0];
      for (let i = 0; i < queue.length; i++) {
        const r = queue[i]!;
        layout.doorways.forEach((w, d) => {
          if (closed.has(d) || (w.a !== r && w.b !== r)) return;
          const other = w.a === r ? w.b : w.a;
          if (!seen.has(other)) {
            seen.add(other);
            queue.push(other);
          }
        });
      }
      placeRandom(rng.pick([...seen].sort((p, q) => p - q)), { ref: key });
    });
  }

  // 7. Population.
  const encounters = catalog.table(spec.encounterTable);
  // SPEC_ISSUES.md#remaining-rooms: rooms holding a room template or an anchor receive no encounter.
  for (const i of all) {
    const r = rooms[i]!;
    if (i === 0 || r.template !== undefined || r.anchors > 0) continue;
    if (!chance(rng, spec.density)) continue;
    const eligible = encounters.filter((e) => !e.depth || (r.depth >= e.depth[0] && r.depth <= e.depth[1]));
    if (eligible.length === 0) continue;
    const e = pickWeighted(rng, eligible);
    for (let k = count(rng, e.count); k > 0; k--) placeRandom(i, { ref: e.ref });
  }
  // SPEC_ISSUES.md#loot-containers: each dead end and boss room receives one container, chosen by RNG
  // among the container templates whose contents draw from the loot table.
  const containers = spec.lootTable === undefined ? [] : catalog.containersFor(spec.lootTable);
  if (containers.length > 0) {
    for (const i of all) {
      const roles = rooms[i]!.roles;
      if (roles.has("dead_end") || roles.has("boss")) placeRandom(i, { ref: rng.pick(containers) });
    }
  }
  // SPEC_ISSUES.md#room-label-fallback: labels come from the pack that supplies `generation`.
  const labels = catalog.generation.tables.room_labels;
  for (const i of all) {
    const r = rooms[i]!;
    if (r.label !== undefined) continue;
    const eligible = labels.filter((l) => (l.tags ?? []).every((t) => r.tags.includes(t)));
    // SPEC_ISSUES.md#room-label-fallback: with no eligible label, the room's label is its id.
    r.label = eligible.length > 0 ? pickWeighted(rng, eligible).label : roomId(i);
  }
  const lit = new Set<number>();
  // SPEC_ISSUES.md#lit-rooms-ambient: with a bright ambient, no rooms are chosen and no draws are made.
  if (spec.ambient !== "bright") {
    const pool = [...all];
    for (let k = Math.round(spec.litRooms * rooms.length); k > 0 && pool.length > 0; k--) {
      const i = rng.pick(pool);
      pool.splice(pool.indexOf(i), 1);
      lit.add(i);
    }
  }
  all.forEach((i) => {
    const r = rooms[i]!;
    const t = r.template !== undefined ? catalog.room(r.template) : undefined;
    r.light = t?.light ?? (lit.has(i) ? "bright" : spec.ambient);
  });

  // 8. Verification.
  const reached = draft.access(metric);
  for (const a of anchored) if (!draft.reaches(reached, a.placed, metric)) throw new AttemptFailed(`anchor in ${roomId(a.room)} is unreachable`);
  for (const link of linkIds) if (!draft.cellReached(reached, linkCells[link]!)) throw new AttemptFailed(`link '${link}' is unreachable`);
  if (!rooms[layout.boss]!.cells.some((c) => draft.cellReached(reached, c))) throw new AttemptFailed("the boss room is unreachable");

  return { draft, boss: layout.boss, aliases, templateLegends };
}

const BUILTIN_CHARS: Record<string, string> = { void: " ", floor: ".", wall: "#" };
const SPARE = [...Array(94).keys()].map((i) => String.fromCharCode(33 + i)).filter((c) => c !== "." && c !== "#");

function output(linksDef: GeneratedLocation["links"], a: Attempt): GeneratedMap {
  const { draft } = a;
  // SPEC_ISSUES.md#generated-legend: terrain other than void, floor, and wall needs legend characters;
  // each takes its character from the first placed template that draws it, else the first free one.
  const charOf = new Map<string, string>();
  const used = new Set<string>();
  const assign = (terrain: string, ch: string) => {
    if (terrain in BUILTIN_CHARS || charOf.has(terrain) || used.has(ch)) return;
    charOf.set(terrain, ch);
    used.add(ch);
  };
  for (const legend of a.templateLegends) {
    for (const ch of Object.keys(legend).sort()) {
      const e = legend[ch]!;
      assign(typeof e === "string" ? e : e.terrain, ch);
    }
  }
  for (const t of [...new Set(draft.terrain)].sort()) for (const ch of SPARE) if (!charOf.has(t)) assign(t, ch);
  const legend: Record<string, string> = {};
  for (const [t, ch] of [...charOf].sort((p, q) => (p[1] < q[1] ? -1 : 1))) if (draft.terrain.includes(t)) legend[ch] = t;

  const rows: string[] = [];
  for (let y = 0; y < draft.height; y++) {
    let row = "";
    for (let x = 0; x < draft.width; x++) {
      const t = draft.terrain[y * draft.width + x]!;
      row += BUILTIN_CHARS[t] ?? charOf.get(t)!;
    }
    rows.push(row);
  }

  const rooms: Record<string, GeneratedRoom> = {};
  draft.rooms.forEach((r, i) => {
    const doorways = r.cells.filter((c) => draft.isDoorway(c)).map(([x, y]) => [x, y, 1, 1] as [number, number, number, number]);
    const role: RoomRole | null = r.roles.has("entry") ? "entry" : r.roles.has("boss") ? "boss" : r.roles.has("dead_end") ? "dead_end" : null;
    rooms[roomId(i)] = { label: r.label!, tags: r.tags, role, depth: r.depth, light: r.light!, area: [[...r.interior], ...doorways] };
  });

  const links: GeneratedMap["links"] = {};
  for (const [k, id] of [...draft.links].sort((p, q) => (p[1] < q[1] ? -1 : 1))) {
    const def = (linksDef ?? {})[id]!;
    links[id] = { label: def.label, at: [k % draft.width, Math.floor(k / draft.width)], to: { ...def.to } };
  }

  const entry = (p: Placed): GeneratedContent => {
    const c: GeneratedContent = p.npc !== undefined ? { npc: p.npc, at: [p.at[0], p.at[1]] } : { ref: p.ref!, at: [p.at[0], p.at[1]], id: p.id! };
    if (p.lock !== undefined) c.lock = p.lock;
    if (p.hidden) c.hidden = true;
    return c;
  };
  return { rows, legend, rooms, links, contents: [...draft.entities.map(entry), ...draft.doors.map(entry)] };
}

/**
 * Generates a location from its spec (generation.md, "Interface"). `seed` is the instance seed;
 * `metric` is the rules system's `SPATIAL.metric`. Deterministic for identical input.
 */
export function generate(
  spec: GeneratedLocation,
  settingBundles: readonly SettingBundle[],
  adventureBundle: AdventureBundle,
  metric: Metric,
  seed: U64,
): GenerateResult {
  let catalog: Catalog;
  try {
    catalog = new Catalog(settingBundles, adventureBundle);
  } catch (e) {
    if (e instanceof SpecError) return { ok: false, error: `${spec.id}: ${e.message}` };
    throw e;
  }
  const s = withDefaults(spec);
  const base = locationSeed(seed, spec.id);
  let reason = "";
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    try {
      const a = attempt(spec.id, s, catalog, metric, new Rng(attemptSeed(base, n)));
      return { ok: true, location: output(spec.links, a), aliases: a.aliases, attempt: n };
    } catch (e) {
      if (e instanceof SpecError) return { ok: false, error: `${spec.id}: ${e.message}` };
      if (!(e instanceof AttemptFailed)) throw e;
      reason = e.message;
    }
  }
  return { ok: false, error: `${spec.id}: generation failed after ${MAX_ATTEMPTS} attempts; last: ${reason}` };
}
