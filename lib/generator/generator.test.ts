import { describe, expect, it } from "vitest";
import type { AdventureBundle, GeneratedLocation } from "../bundle/adventure";
import type { EntityTemplate, SettingBundle } from "../bundle/setting";
import { TerrainGrid, adjacent, footprintCells, parseMap, type Cell, type Metric } from "../grid";
import { compileAdventure } from "../materials";
import { checkGrid, checkPlacements, npcRef, templateOf, terrainTable } from "../materials/maps";
import { Diagnostics } from "../materials/pack";
import { derelictStation, guideAdventure } from "../materials/testing/fixtures";
import type { JsonObject } from "../materials/walk";
import { Rng, draw, fnv1a64 } from "../rng";
import { MAX_ATTEMPTS, attemptSeed, generate, locationSeed, pickWeighted, type GeneratedMap } from "./index";

const setting = derelictStation();
const adventure = compileAdventure(guideAdventure(), [setting]).bundle!;
const lowerArchive = adventure.locations.lower_archive as GeneratedLocation;
const reactor = { label: "reactor room", role: "boss", min_depth: 3 };

type Rect = [number, number, number, number];
const key = ([x, y]: Cell) => y * 64 + x;
const cellOf = (k: number): Cell => [k % 64, Math.floor(k / 64)];
const inRect = ([x, y]: Cell, [rx, ry, w, h]: Rect) => x >= rx && y >= ry && x < rx + w && y < ry + h;

function entityTemplate(ref: string, settings: readonly SettingBundle[], adv: AdventureBundle): EntityTemplate {
  const [ns, k] = ref.split(":") as [string, string];
  const t = ns === adv.namespace ? adv.entities[k] : settings.find((s) => s.namespace === ns)?.entities[k];
  if (!t) throw new Error(`unknown ref ${ref}`);
  return t;
}

/** Facts about a generated map, read only from the output. */
function inspect(map: GeneratedMap, settings: readonly SettingBundle[], adv: AdventureBundle) {
  const terrainTypes = terrainTable(Object.assign({}, ...settings.map((s) => s.manifest.terrain)) as Record<string, JsonObject>);
  const grid = new TerrainGrid(parseMap(map.rows, map.legend), terrainTypes);
  const roomAt = new Map<number, string>();
  for (const [id, room] of Object.entries(map.rooms)) for (const [x, y, w, h] of room.area) for (const c of footprintCells([x, y], [w, h])) roomAt.set(key(c), id);
  const template = (ref: string) => (ref.startsWith("npc:") ? entityTemplate(adv.npcs[ref.slice(4)]!.template, settings, adv) : entityTemplate(ref, settings, adv));
  const doors = map.contents.filter((c) => c.id?.includes("/d"));
  const occupancy = map.contents.map((c) => {
    const t = template(c.ref ?? npcRef(c.npc!));
    return { content: c, door: t.kind === "door", occ: templateOf(t as unknown as JsonObject) };
  });
  const entryCells = [...roomAt].filter(([, r]) => r === "r1").map(([k]) => cellOf(k));
  return { grid, terrainTypes, roomAt, template, doors, occupancy, entryCells };
}

/** Cells reachable from the entry room; doors in `closed` and doors with other locks are impassable. */
function flood(map: GeneratedMap, facts: ReturnType<typeof inspect>, metric: Metric, closed: (door: { at: Cell }) => boolean): Set<number> {
  const blocked = new Set<number>();
  for (const { content, door, occ } of facts.occupancy) {
    if (door ? closed(content) : occ.obstructsMovement) for (const cell of footprintCells(content.at, occ.footprint)) blocked.add(key(cell));
  }
  const isBlocked = (c: Cell) => facts.grid.blocksMovement(c) || blocked.has(key(c));
  const start = facts.entryCells.filter((c) => !isBlocked(c));
  const seen = new Set(start.map(key));
  const queue = [...start];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n: Cell = [c[0] + dx, c[1] + dy];
        if (seen.has(key(n)) || isBlocked(n) || !adjacent(c, n, metric, isBlocked)) continue;
        seen.add(key(n));
        queue.push(n);
      }
    }
  }
  return seen;
}

interface Expect {
  gates: number;
  anchors?: GeneratedLocation["anchors"];
  /** Room templates by label, with the role and minimum depth they require. */
  templates?: { label: string; role: string; min_depth?: number }[];
}

/** Every property the specification states about a generated map. */
function checkGenerated(id: string, map: GeneratedMap, aliases: Record<string, string>, settings: readonly SettingBundle[], adv: AdventureBundle, metric: Metric, want: Expect): void {
  const facts = inspect(map, settings, adv);
  const { grid, roomAt, doors } = facts;

  // Authored map checks (setting-packs.md, "Validation").
  const out = new Diagnostics();
  const ctx = { file: id, path: [], terrain: facts.terrainTypes, template: (ref: string) => templateOf(facts.template(ref) as unknown as JsonObject) };
  const parsed = checkGrid({ rows: map.rows, legend: map.legend } as unknown as JsonObject, ctx, out);
  expect(parsed).toBeDefined();
  checkPlacements(parsed!, map.contents as unknown as JsonObject[], ["contents"], ctx, out);
  expect(out.list).toEqual([]);

  // Outer wall, rooms r1..rN, every passable cell in exactly one room.
  const [w, h] = [grid.width, grid.height];
  for (const c of grid.cells()) if (c[0] === 0 || c[1] === 0 || c[0] === w - 1 || c[1] === h - 1) expect(grid.terrain(c), `border ${key(c)}`).toBe("wall");
  const ids = Object.keys(map.rooms);
  expect(ids).toEqual(ids.map((_, i) => `r${i + 1}`));
  const covered = new Map<number, number>();
  for (const room of Object.values(map.rooms)) for (const [x, y, rw, rh] of room.area) for (const c of footprintCells([x, y], [rw, rh])) covered.set(key(c), (covered.get(key(c)) ?? 0) + 1);
  for (const c of grid.cells()) {
    const passable = grid.terrain(c) !== "void" && !grid.blocksMovement(c);
    if (passable) expect(covered.get(key(c)), `cell ${key(c)}`).toBe(1);
    else expect(covered.get(key(c)) ?? 0).toBeLessThanOrEqual(1);
  }
  expect(map.rooms.r1!.role).toBe("entry");
  expect(map.rooms.r1!.depth).toBe(0);

  // Doors: one per doorway, ids in row-major order, owned by the shallower room (ties to the lower id).
  const doorCells = doors.map((d) => d.at);
  expect(doors.map((d) => d.id)).toEqual(doors.map((_, i) => `${id}/d${i + 1}`));
  expect([...doorCells].sort((p, q) => p[1] - q[1] || p[0] - q[0])).toEqual(doorCells);
  const num = (r: string) => Number(r.slice(1));
  const edges = new Map<string, Set<string>>(ids.map((r) => [r, new Set()]));
  for (const [x, y] of doorCells) {
    const sides = [roomAt.get(key([x - 1, y])), roomAt.get(key([x + 1, y]))].every(Boolean)
      ? [roomAt.get(key([x - 1, y]))!, roomAt.get(key([x + 1, y]))!]
      : [roomAt.get(key([x, y - 1]))!, roomAt.get(key([x, y + 1]))!];
    const [a, b] = sides as [string, string];
    expect(a).not.toBe(b);
    const da = map.rooms[a]!.depth;
    const db = map.rooms[b]!.depth;
    const owner = da < db || (da === db && num(a) < num(b)) ? a : b;
    expect(roomAt.get(key([x, y])), `doorway ${x},${y}`).toBe(owner);
    edges.get(a)!.add(b);
    edges.get(b)!.add(a);
  }
  // Connected, with BFS depths and BFS numbering (neighbours in ascending id order).
  const depth = new Map([["r1", 0]]);
  const order = ["r1"];
  for (let i = 0; i < order.length; i++) {
    const r = order[i]!;
    for (const n of [...edges.get(r)!].sort((p, q) => num(p) - num(q))) {
      if (depth.has(n)) continue;
      depth.set(n, depth.get(r)! + 1);
      order.push(n);
    }
  }
  expect(order).toEqual(ids);
  for (const r of ids) expect(map.rooms[r]!.depth).toBe(depth.get(r));
  const maxDepth = Math.max(...depth.values());
  expect(map.rooms[aliases.boss!]!.depth).toBe(maxDepth);
  for (const r of ids) {
    const role = map.rooms[r]!.role;
    if (r === "r1") continue;
    if (r === aliases.boss) expect(role).toBe("boss");
    else expect(role).toBe(edges.get(r)!.size === 1 ? "dead_end" : null);
  }

  // Generated entity ids in placement order.
  const generated = map.contents.filter((c) => c.id?.includes("/e"));
  expect(generated.map((c) => c.id)).toEqual(generated.map((_, i) => `${id}/e${i + 1}`));

  // Room templates: at most once each, in rooms satisfying their role and depth.
  const templateRooms = new Set<string>();
  for (const t of want.templates ?? []) {
    const holders = ids.filter((x) => map.rooms[x]!.label === t.label);
    expect(holders.length).toBeLessThanOrEqual(1);
    for (const r of holders) {
      templateRooms.add(r);
      if (t.role === "boss") expect(r).toBe(aliases.boss);
      if (t.role === "entry") expect(r).toBe("r1");
      if (t.role === "dead_end") expect(edges.get(r)!.size).toBe(1);
      if (t.min_depth !== undefined) expect(map.rooms[r]!.depth).toBeGreaterThanOrEqual(t.min_depth);
    }
  }

  // Anchors: constraints, own room, prefer_role when a candidate has it.
  const anchorRooms = new Map<string, number>();
  for (const a of want.anchors ?? []) {
    const room = aliases[a.id]!;
    const r = map.rooms[room]!;
    const c = a.constraints ?? {};
    if (c.min_depth !== undefined) expect(r.depth).toBeGreaterThanOrEqual(c.min_depth);
    if (c.max_depth !== undefined) expect(r.depth).toBeLessThanOrEqual(c.max_depth);
    for (const t of c.room_tags ?? []) expect(r.tags).toContain(t);
    if (!a.shared) {
      expect(templateRooms.has(room)).toBe(false);
      expect(anchorRooms.has(room)).toBe(false);
    }
    if (c.prefer_role === "dead_end") {
      const eligible = ids.filter((x) => {
        const d = map.rooms[x]!.depth;
        return (c.min_depth === undefined || d >= c.min_depth) && (c.max_depth === undefined || d <= c.max_depth) && !templateRooms.has(x) && !anchorRooms.has(x);
      });
      if (eligible.some((x) => edges.get(x)!.size === 1)) expect(edges.get(room)!.size).toBe(1);
    }
    anchorRooms.set(room, (anchorRooms.get(room) ?? 0) + 1);
    const entity = map.contents.find((x) => (a.place.npc ? x.npc === a.place.npc : x.ref === a.place.ref && (a.place.id === undefined || x.id === a.place.id)));
    expect(entity).toBeDefined();
    expect(roomAt.get(key(entity!.at))).toBe(room);
  }
  for (const [link, def] of Object.entries(map.links)) expect(roomAt.get(key(def.at))).toBe(aliases[link]);

  // Locks: the requested number; each key reachable without crossing its own or a later (deeper) lock.
  const locked = doors.filter((d) => d.lock !== undefined).sort((p, q) => map.rooms[roomAt.get(key(p.at))!]!.depth - map.rooms[roomAt.get(key(q.at))!]!.depth);
  expect(locked).toHaveLength(want.gates);
  const depths = locked.map((d) => map.rooms[roomAt.get(key(d.at))!]!.depth);
  expect(new Set(depths).size).toBe(depths.length);
  locked.forEach((lock, i) => {
    const later = new Set(locked.slice(i).map((d) => key(d.at)));
    const reached = flood(map, facts, metric, (d) => later.has(key(d.at)));
    const keyRef = (lock.lock as { has_item: string }).has_item;
    const keys = map.contents.filter((c) => c.ref === keyRef && !c.id?.includes("/d"));
    expect(keys.some((k) => reached.has(key(k.at))), `key ${keyRef} for ${lock.id}`).toBe(true);
  });

  // Verification: with every key in hand, anchors, links, and the boss room are reachable.
  const all = flood(map, facts, metric, () => false);
  for (const link of Object.values(map.links)) expect(all.has(key(link.at))).toBe(true);
  const bossCells = [...roomAt].filter(([, r]) => r === aliases.boss).map(([k]) => k);
  expect(bossCells.some((k) => all.has(k))).toBe(true);
}

/** Generates `seeds` consecutive seeds; returns the number verified and the room labels seen. */
function sweep(spec: GeneratedLocation, seeds: number, metric: Metric, want: Expect, settings: readonly SettingBundle[] = [setting], adv = adventure) {
  let ok = 0;
  const labels = new Map<string, number>();
  for (let seed = 0; seed < seeds; seed++) {
    const r = generate(spec, settings, adv, metric, seed);
    if (!r.ok) {
      expect(r.error).toMatch(new RegExp(`^${spec.id}: generation failed after ${MAX_ATTEMPTS} attempts`));
      continue;
    }
    ok++;
    checkGenerated(spec.id, r.location, r.aliases, settings, adv, metric, want);
    for (const room of Object.values(r.location.rooms)) labels.set(room.label, (labels.get(room.label) ?? 0) + 1);
  }
  return { ok, labels };
}

describe("seeds", () => {
  it("derives the location seed and attempt seeds from the instance seed", () => {
    expect(locationSeed(42, "lower_archive")).toBe(draw(42n ^ fnv1a64("lower_archive"), 0));
    expect(locationSeed(2n ** 64n + 42n, "lower_archive")).toBe(locationSeed(42, "lower_archive"));
    const base = locationSeed(7, "x");
    expect(attemptSeed(base, 0)).toBe(base);
    expect(attemptSeed(base, 3)).toBe(draw(base, 3));
  });

  it("draws weighted entries by cumulative weight", () => {
    const table = [{ weight: 3, v: "a" }, { weight: 1, v: "b" }];
    const rng = new Rng(42);
    const faces = new Rng(42);
    for (let i = 0; i < 20; i++) expect(pickWeighted(rng, table).v).toBe(faces.die(4) <= 3 ? "a" : "b");
  });
});

describe("lower_archive", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = generate(lowerArchive, [setting], adventure, "chebyshev", 12345);
    const b = generate(structuredClone(lowerArchive), [derelictStation()], structuredClone(adventure), "chebyshev", 12345n);
    expect(a).toEqual(b);
    const c = generate(lowerArchive, [setting], adventure, "chebyshev", 12346);
    expect(c).not.toEqual(a);
  });

  it("does not depend on the order of object keys", () => {
    const shuffled = structuredClone(setting);
    shuffled.manifest.generation.locks = Object.fromEntries(Object.entries(shuffled.manifest.generation.locks).reverse());
    for (const seed of [1, 2, 3]) expect(generate(lowerArchive, [shuffled], adventure, "chebyshev", seed)).toEqual(generate(lowerArchive, [setting], adventure, "chebyshev", seed));
  });

  it("produces the output format with generated ids and aliases", () => {
    const r = generate(lowerArchive, [setting], adventure, "chebyshev", 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { location, aliases } = r;
    expect(location.rows).toHaveLength(28);
    expect(location.rows.every((row) => row.length === 40)).toBe(true);
    expect(Object.keys(aliases).sort()).toEqual(["boss", "core_anchor", "entry", "r1", "x_up"]);
    expect(aliases.x_up).toBe("r1");
    expect(location.links.x_up).toMatchObject({ label: "service lift", to: { location: "dock", link: "x_lift" } });
    expect(location.contents.find((c) => c.ref === "sunken_archive:reactor_core")?.id).toMatch(/^lower_archive\/e\d+$/);
    const lock = location.contents.find((c) => c.lock);
    expect(lock?.id).toMatch(/^lower_archive\/d\d+$/);
    expect(Object.entries(setting.manifest.generation.locks)).toContainEqual([lock!.ref, (lock!.lock as { has_item: string }).has_item]);
  });

  it("verifies 1,000 consecutive seeds", () => {
    const { ok, labels } = sweep(lowerArchive, 1000, "chebyshev", { gates: 1, anchors: lowerArchive.anchors, templates: [reactor] });
    expect(ok).toBe(1000);
    expect(labels.get("reactor room")).toBeGreaterThan(0);
    expect(labels.has("flooded stacks")).toBe(false);
  }, 120_000);
});

/** A synthetic generated location over derelict_station. */
function location(over: Partial<GeneratedLocation> & { generator?: GeneratedLocation["generator"] }): GeneratedLocation {
  return {
    id: "synthetic",
    kind: "generated",
    population: { encounter_table: "base:encounters_machine", loot_table: "base:locker_loot" },
    ...over,
  };
}

/** derelict_station with an extra room template of role `any`. */
function withAnyTemplate(): SettingBundle {
  const s = derelictStation();
  s.rooms.store = {
    label: "store room",
    tags: ["storage"],
    role: "any",
    light: "dim",
    map: { legend: { "~": "coolant", o: { terrain: "floor", place: "base:crate_stack" } }, rows: ["~o~", "..."] },
    contents: [{ ref: "base:battery", count: "1d2" }],
  };
  return s;
}

describe("synthetic specs", () => {
  const cases: [string, GeneratedLocation, Metric, Expect][] = [
    ["small map, gates 0", location({ generator: { size: [16, 16], rooms: [2, 4] }, gates_per_location: 0 }), "chebyshev", { gates: 0 }],
    ["small map, manhattan, gate 1", location({ generator: { size: [20, 16], rooms: [3, 5] }, gates_per_location: 1 }), "manhattan", { gates: 1 }],
    [
      "min_room 5, gates 2, loops, dead-end link",
      location({
        generator: { size: [48, 40], rooms: [6, 9], min_room: 5, loop_ratio: 0.5 },
        population: { encounter_table: "base:encounters_machine", density: 1, ambient: "dark", lit_rooms: 0.5 },
        links: { x_down: { label: "shaft", role: "dead_end", to: { location: "dock", link: "x_lift" } } },
        gates_per_location: 2,
      }),
      "chebyshev",
      { gates: 2 },
    ],
    [
      "gates 3, anchors with ids, shared, and an NPC",
      location({
        generator: { size: [64, 64], rooms: [12, 16], min_room: 3, loop_ratio: 0.2 },
        population: { encounter_table: "base:encounters_machine", loot_table: "base:locker_loot", room_templates: ["base:reactor_room"] },
        anchors: [
          { id: "core", place: { ref: "sunken_archive:reactor_core", id: "the_core" }, constraints: { min_depth: 3, prefer_role: "dead_end" } },
          { id: "keeper", place: { npc: "archivist" }, constraints: { max_depth: 2 } },
          { id: "cache", place: { ref: "base:battery" }, constraints: { min_depth: 1 }, shared: true },
        ],
        gates_per_location: 3,
      }),
      "chebyshev",
      { gates: 3, templates: [reactor] },
    ],
  ];
  for (const [name, spec, metric, want] of cases) {
    it(name, () => {
      const { ok } = sweep(spec, 200, metric, { ...want, anchors: spec.anchors });
      expect(ok).toBeGreaterThan(150);
    }, 60_000);
  }

  it("places room templates centred, with their terrain, contents, tags, label, and light", () => {
    const s = withAnyTemplate();
    const spec = location({
      generator: { size: [40, 28], rooms: [8, 12] },
      population: { encounter_table: "base:encounters_machine", room_templates: ["base:store", "base:reactor_room"], ambient: "dark" },
      gates_per_location: 0,
    });
    let reactors = 0;
    for (let seed = 0; seed < 100; seed++) {
      const r = generate(spec, [s], adventure, "chebyshev", seed);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      checkGenerated(spec.id, r.location, r.aliases, [s], adventure, "chebyshev", { gates: 0, templates: [{ label: "store room", role: "any" }, reactor] });
      const rooms = Object.values(r.location.rooms).filter((x) => x.label === "store room");
      expect(rooms).toHaveLength(1);
      const room = rooms[0]!;
      expect(room.tags).toEqual(["storage"]);
      expect(room.light).toBe("dim");
      const [ix, iy, iw, ih] = room.area[0]!;
      const ox = ix + Math.floor((iw - 3) / 2);
      const oy = iy + Math.floor((ih - 2) / 2);
      const char = Object.entries(r.location.legend).find(([, t]) => t === "coolant")![0];
      expect(char).toBe("~");
      expect(r.location.rows[oy]!.slice(ox, ox + 3)).toBe("~.~");
      expect(r.location.contents.filter((c) => c.ref === "base:crate_stack").map((c) => c.at)).toEqual([[ox + 1, oy]]);
      const batteries = r.location.contents.filter((c) => c.ref === "base:battery" && inRect(c.at, [ix, iy, iw, ih]));
      expect(batteries.length).toBeGreaterThanOrEqual(1);
      for (const [x, y] of batteries.map((b) => b.at)) expect(r.location.rows[y]![x]).not.toBe("#");
      const held = Object.values(r.location.rooms).find((x) => x.label === "reactor room");
      if (held) {
        reactors++;
        const [rx, ry, rw, rh] = held.area[0]!;
        const px = rx + Math.floor((rw - 8) / 2);
        const py = ry + Math.floor((rh - 4) / 2);
        expect(r.location.contents).toContainEqual(expect.objectContaining({ ref: "base:control_panel", at: [px + 3, py] }));
        expect(r.location.contents.filter((c) => c.ref === "base:support_pillar").map((c) => c.at)).toEqual([[px + 2, py], [px + 5, py], [px + 2, py + 3], [px + 5, py + 3]]);
        expect(r.location.rows[py + 1]!.slice(px, px + 8)).toBe(".~~..~~.");
        expect(r.location.contents.filter((c) => c.ref === "base:maintenance_drone" && inRect(c.at, [rx, ry, rw, rh]))).toHaveLength(2);
      }
    }
    expect(reactors).toBeGreaterThan(0);
  });

  it("lights round(lit_rooms × rooms) rooms in a dark location", () => {
    const spec = location({ generator: { size: [40, 28], rooms: [6, 10] }, population: { encounter_table: "base:encounters_machine", ambient: "dark", lit_rooms: 0.3 }, gates_per_location: 0 });
    for (let seed = 0; seed < 50; seed++) {
      const r = generate(spec, [setting], adventure, "chebyshev", seed);
      if (!r.ok) continue;
      const rooms = Object.values(r.location.rooms);
      expect(rooms.filter((x) => x.light === "bright")).toHaveLength(Math.round(0.3 * rooms.length));
      expect(rooms.filter((x) => x.light === "dark")).toHaveLength(rooms.length - Math.round(0.3 * rooms.length));
    }
  });

  it("returns the documented error when no attempt can succeed", () => {
    const tooMany = location({ generator: { size: [16, 16], rooms: [8, 12], min_room: 6 } });
    expect(generate(tooMany, [setting], adventure, "chebyshev", 1)).toEqual({
      ok: false,
      error: `synthetic: generation failed after ${MAX_ATTEMPTS} attempts; last: 4 regions, fewer than 8`,
    });
    const noGateRoom = location({ generator: { size: [16, 16], rooms: [1, 1], min_room: 12 } });
    const r = generate(noGateRoom, [setting], adventure, "chebyshev", 1);
    expect(r.ok).toBe(false);
    const treasure = location({ links: { x: { label: "x", role: "treasure", to: { location: "dock", link: "x_lift" } } }, gates_per_location: 0 });
    expect(generate(treasure, [setting], adventure, "chebyshev", 1)).toMatchObject({ ok: false });
  });

  it("generates a single room when min_room prevents splitting", () => {
    const spec = location({ generator: { size: [16, 16], rooms: [1, 3], min_room: 12 }, gates_per_location: 0 });
    const r = generate(spec, [setting], adventure, "chebyshev", 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.location.rooms)).toEqual(["r1"]);
    expect(r.aliases.boss).toBe("r1");
    expect(r.location.rooms.r1!.area).toEqual([[1, 1, 14, 14]]);
    checkGenerated(spec.id, r.location, r.aliases, [setting], adventure, "chebyshev", { gates: 0 });
  });
});
