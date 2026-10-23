// The Content Compiler for adventure packs (adventure-packs.md, "Compilation"): an adventure
// directory or editor draft, compiled against the bundles of its required setting packs.

import type { AdventureBundle } from "../bundle/adventure";
import { FORMAT_VERSION, type SettingBundle } from "../bundle/setting";
import type { TerrainType } from "../grid";
import { checkAssets } from "./art";
import {
  BUILTIN_CONDITIONS,
  applyEntityDefaults,
  artSites,
  checkArtKinds,
  checkEntity,
  contentVisitor,
  emptyCatalog,
  qualify,
  qualifySites,
  resolveSites,
  type ContentContext,
  type RefSite,
} from "./content";
import { formatPath, sortDiagnostics, type Segment } from "./diagnostics";
import { checkGrid, checkPlacements, npcRef, templateOf, type Template } from "./maps";
import { Diagnostics, readPack, type PackFiles } from "./pack";
import { bindSystem } from "./rules";
import { satisfies } from "./semver";
import type { CompileResult } from "./setting";
import { isObject, walkEffects, walkRequirement, type Json, type JsonObject, type Visitor } from "./walk";

/** Event types whose payload names an actor (engine.md, "Events"); `door_*` and `light_changed` may. */
const ACTOR_EVENTS = new Set([
  "moved", "item_taken", "item_dropped", "item_given", "item_used", "ability_used", "interacted", "examined", "searched",
  "talked", "waited", "improvised", "choice_offered", "choice_made", "action_declared", "action_voided", "attacked",
  "door_opened", "door_closed", "light_changed",
]);

const RESERVED_ID = /^(entry|boss|r[0-9]+)$/;
const GENERATOR_DEFAULT_ROOMS: [number, number] = [8, 12];
// SPEC_ISSUES.md#treasure-role: generation.md assigns no room the role `treasure`.
/** Roles the generator assigns (generation.md, "Roles and depth"). */
const GENERATED_ROLES = new Set(["entry", "boss", "dead_end"]);

interface LocationInfo {
  id: string;
  file: string;
  kind: "authored" | "generated";
  /** Room ids; for generated locations, the aliases `r1`, `entry`, `boss`, anchor ids, and link ids. */
  rooms: Set<string>;
  links: Set<string>;
}

interface EntityId {
  file: string;
  path: Segment[];
  /** The template ref, or `npc:<id>` for NPCs. */
  ref: string;
}

/** Where an unqualified room reference resolves (adventure-packs.md, "Room references"). */
type RoomScope =
  | { kind: "location"; location: string }
  | { kind: "actor"; location?: string }
  | { kind: "no_actor"; event: string };

const clone = <T>(v: T): T => structuredClone(v);

/** Compiles an adventure pack against the bundles of the setting packs it requires. */
export function compileAdventure(files: PackFiles, settings: readonly SettingBundle[]): CompileResult<AdventureBundle> {
  const out = new Diagnostics();
  const pack = readPack("adventure", files, out);
  if (!out.ok) return { ok: false, diagnostics: sortDiagnostics(out.list) };

  const manifestFile = pack.single.get("adventure.yaml")!.file;
  const manifest = clone(pack.single.get("adventure.yaml")!.data);
  const flagsFile = pack.single.get("flags.yaml")?.file ?? "flags.yaml";
  const flags = clone(pack.single.get("flags.yaml")?.data ?? {}) as Record<string, JsonObject>;
  const assets = clone(pack.single.get("assets.yaml")?.data ?? {});
  const assetsFile = pack.single.get("assets.yaml")?.file ?? "assets.yaml";
  const records = (dir: string) => new Map([...(pack.merged.get(dir) ?? [])].sort(([, a], [, b]) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)).map(([k, e]) => [k, { file: e.file, value: clone(e.value) }]));
  const arcs = records("plot/*.yaml");
  const locations = records("locations/*.yaml");
  const npcs = records("npcs/*.yaml");
  const entities = records("entities/*.yaml");
  const ns = manifest.id as string;

  // 3, 15. System and settings.
  const bound = bindSystem(manifest.system as JsonObject, manifestFile, ["system"], out);
  const used = checkSettings(manifest, manifestFile, settings, out);
  // Without its settings, every ref into them would fail too; report the cause alone.
  if (!out.ok) return { ok: false, diagnostics: sortDiagnostics(out.list) };

  // Catalog: adventure entities and assets, and everything the required settings define.
  const catalog = emptyCatalog([ns, ...used.map((s) => s.namespace)]);
  for (const s of used) {
    for (const [k, e] of Object.entries(s.entities)) catalog.entities.set(`${s.namespace}:${k}`, { value: e as unknown as JsonObject });
    for (const [k, t] of Object.entries(s.tables)) catalog.tables.set(`${s.namespace}:${k}`, { value: {}, entries: t as unknown as JsonObject[] });
    for (const [k, r] of Object.entries(s.rooms)) catalog.rooms.set(`${s.namespace}:${k}`, { value: r as unknown as JsonObject });
    for (const [k, a] of Object.entries(s.abilities)) catalog.abilities.set(`${s.namespace}:${k}`, { value: a as unknown as JsonObject });
    for (const [k, a] of Object.entries(s.assets)) catalog.assets.set(`${s.namespace}:${k}`, { value: a as unknown as JsonObject });
    if (s.manifest.currency) catalog.currencies.add(`${s.namespace}:${s.manifest.currency.id}`);
  }
  for (const [k, e] of entities) catalog.entities.set(`${ns}:${k}`, e);
  for (const [k, a] of Object.entries(assets)) if (isObject(a)) catalog.assets.set(`${ns}:${k}`, { value: a });

  const declared = {
    damageTypes: new Set(used.flatMap((s) => s.manifest.damage_types)),
    conditions: new Set([...used.flatMap((s) => Object.keys(s.conditions)), ...BUILTIN_CONDITIONS]),
  };
  const terrain: Record<string, TerrainType> = {};
  for (const s of [...used].reverse()) for (const [id, t] of Object.entries(s.manifest.terrain)) terrain[id] = { obstructs: t.obstructs, cost: t.cost };
  if (used.length === 0) Object.assign(terrain, { void: { obstructs: ["movement", "sight"], cost: 1 }, floor: { obstructs: [], cost: 1 }, wall: { obstructs: ["movement", "sight"], cost: 1 } });

  const sites: RefSite[] = [];
  const kindOf = (ref: string): string | undefined => catalog.entities.get(qualify(ref, ns))?.value.kind as string | undefined;

  // Indices of everything plot can name.
  const locs = new Map<string, LocationInfo>();
  const ids = new Map<string, EntityId>();
  const npcPlacements = new Map<string, { file: string; path: Segment[] }>();
  const claimId = (id: string, file: string, path: Segment[], ref: string) => {
    const prior = ids.get(id);
    if (prior) out.add(file, path, `entity id '${id}' is already used at ${prior.file}: ${formatPath(prior.path)}`, "plot");
    else ids.set(id, { file, path, ref });
  };
  const placeNpc = (npc: string, file: string, path: Segment[]) => {
    if (!npcs.has(npc)) {
      out.add(file, path, `unknown NPC '${npc}'`, "plot");
      return;
    }
    const prior = npcPlacements.get(npc);
    if (prior) out.add(file, path, `NPC '${npc}' is already placed at ${prior.file}: ${formatPath(prior.path)}`, "npc");
    else npcPlacements.set(npc, { file, path });
  };
  for (const [id, { file }] of npcs) ids.set(id, { file, path: ["id"], ref: npcRef(id) });

  for (const [id, { file, value }] of locations) {
    if (value.kind === "authored") {
      const map = value.map as JsonObject;
      locs.set(id, { id, file, kind: "authored", rooms: new Set(Object.keys(map.rooms as JsonObject)), links: new Set(Object.keys((map.links ?? {}) as JsonObject)) });
      ((map.contents ?? []) as JsonObject[]).forEach((c, i) => {
        if (typeof c.id === "string") claimId(c.id, file, ["map", "contents", i, "id"], c.ref as string);
        if (typeof c.npc === "string") placeNpc(c.npc, file, ["map", "contents", i, "npc"]);
      });
    } else {
      const anchors = (value.anchors ?? []) as JsonObject[];
      const links = Object.keys((value.links ?? {}) as JsonObject);
      locs.set(id, { id, file, kind: "generated", rooms: new Set(["r1", "entry", "boss", ...anchors.map((a) => a.id as string), ...links]), links: new Set(links) });
      anchors.forEach((a, i) => {
        const place = a.place as JsonObject;
        if (typeof place.id === "string") claimId(place.id, file, ["anchors", i, "place", "id"], place.ref as string);
        if (typeof place.npc === "string") placeNpc(place.npc, file, ["anchors", i, "place", "npc"]);
      });
    }
  }
  const arcStages = new Map([...arcs].map(([id, { value }]) => [id, new Set(value.stages as string[])]));
  const endings = new Set(Object.keys(manifest.endings as JsonObject));
  const flagSetters = new Set<string>();
  const endingsUsed = new Set<string>();
  const deferredIds: { id: string; file: string; path: Segment[]; door?: boolean }[] = [];
  const spawnIds = new Map<string, string>();

  const resolveRoom = (ref: string, scope: RoomScope, file: string, path: Segment[]) => {
    if (ref.includes(".")) {
      const [loc, room] = ref.split(".") as [string, string];
      const info = locs.get(loc);
      if (!info) out.add(file, path, `unknown location '${loc}' in room reference '${ref}'`, "room");
      else if (!info.rooms.has(room)) out.add(file, path, `location '${loc}' has no room '${room}'`, "room");
      return;
    }
    if (scope.kind === "no_actor") {
      out.add(file, path, `'${scope.event}' events have no actor; qualify the room as location.${ref}`, "room");
      return;
    }
    const where = scope.location;
    if (where !== undefined) {
      const info = locs.get(where);
      if (info && !info.rooms.has(ref)) out.add(file, path, `location '${where}' has no room '${ref}'`, "room");
      return;
    }
    if (![...locs.values()].some((l) => l.rooms.has(ref))) out.add(file, path, `no location has a room '${ref}'`, "room");
  };

  const target = (value: Json | undefined, file: string, path: Segment[]) => {
    if (typeof value === "string" && !["actor", "target", "room"].includes(value)) deferredIds.push({ id: value, file, path });
  };

  const flagOf = (flag: string, file: string, path: Segment[]): JsonObject | undefined => {
    const f = flags[flag];
    if (!f) out.add(file, path, `undeclared flag '${flag}'`, "flag");
    return f;
  };

  const stage = (arc: string, stageId: string, file: string, path: Segment[]) => {
    const stages = arcStages.get(arc);
    if (!stages) out.add(file, path, `unknown arc '${arc}'`, "plot");
    else if (!stages.has(stageId)) out.add(file, path, `arc '${arc}' has no stage '${stageId}'`, "plot");
  };

  const literal = (f: JsonObject, value: Json, flag: string, file: string, path: Segment[], adding: boolean) => {
    if (f.type === "bool" && (adding || typeof value !== "boolean")) out.add(file, path, adding ? `flag '${flag}' is bool; add_flag needs an int flag` : `flag '${flag}' is bool; ${JSON.stringify(value)} is not a boolean`, "flag");
    if (f.type === "enum" && (adding || !(f.values as string[]).includes(value as string))) {
      out.add(file, path, adding ? `flag '${flag}' is enum; add_flag needs an int flag` : `flag '${flag}' has no value ${JSON.stringify(value)}; values: ${(f.values as string[]).join(", ")}`, "flag");
    }
    if (f.type === "int") {
      if (typeof value !== "number" || !Number.isInteger(value)) out.add(file, path, `flag '${flag}' is int; ${JSON.stringify(value)} is not an integer`, "flag");
      else if (!adding && (value < (f.min as number) || value > (f.max as number))) out.add(file, path, `${value} is outside the range [${String(f.min)}, ${String(f.max)}] of flag '${flag}'`, "flag");
    }
  };

  const base = { out, sites, bound, namespace: ns, catalog };
  const plotVisitor = (file: string, scope: RoomScope): Visitor =>
    contentVisitor(base, file, declared, {
      requirement(form, args, path, node) {
        if (form === "flag") {
          const f = flagOf(node.flag as string, file, [...path, "flag"]);
          if (f && "eq" in node) {
            const v = node.eq;
            const ok = f.type === "bool" ? typeof v === "boolean" : f.type === "int" ? Number.isInteger(v) : (f.values as string[]).includes(v as string);
            if (!ok) out.add(file, [...path, "eq"], `flag '${String(node.flag)}' is ${String(f.type)}; it never equals ${JSON.stringify(v)}`, "flag");
          }
          if (f && ("gte" in node || "lte" in node) && f.type !== "int") out.add(file, path, `flag '${String(node.flag)}' is ${String(f.type)}; gte and lte need an int flag`, "flag");
        }
        if (form === "stage" && Array.isArray(args)) stage(args[0] as string, args[1] as string, file, [...path, "stage"]);
        if (form === "location" && typeof args === "string" && !locs.has(args)) out.add(file, [...path, "location"], `unknown location '${args}'`, "plot");
        if (form === "room" && typeof args === "string") resolveRoom(args, scope, file, [...path, "room"]);
        if (form === "near") target(node.near, file, [...path, "near"]);
        if (form === "defeated") target(args, file, [...path, "defeated"]);
      },
      effect(name, args, path) {
        if ("target" in args && name !== "set_flag" && name !== "add_flag") target(args.target, file, [...path, "target"]);
        if (name === "spawn" || name === "move_entity" || name === "set_room_light") resolveRoom(args.room as string, scope, file, [...path, "room"]);
        if (name === "spawn" && typeof args.id === "string") {
          if (ids.has(args.id) || spawnIds.has(args.id)) out.add(file, [...path, "id"], `entity id '${args.id}' is already used`, "plot");
          spawnIds.set(args.id, args.ref as string);
        }
        if (name === "open_door" || name === "close_door") deferredIds.push({ id: args.door as string, file, path: [...path, "door"], door: true });
        if (name === "set_flag" || name === "add_flag") {
          flagSetters.add(args.flag as string);
          const f = flagOf(args.flag as string, file, [...path, "flag"]);
          if (f) {
            literal(f, args.value!, args.flag as string, file, [...path, "value"], name === "add_flag");
            if ("target" in args && (f.scope ?? "party") === "party") {
              out.add(file, [...path, "target"], `flag '${String(args.flag)}' is party-scoped; target applies only to character-scoped flags`, "flag");
            }
          }
        }
        if (name === "set_stage") stage(args.arc as string, args.stage as string, file, [...path]);
        if (name === "end_campaign") {
          endingsUsed.add(args.ending as string);
          if (!endings.has(args.ending as string)) out.add(file, [...path, "ending"], `unknown ending '${String(args.ending)}'`, "plot");
        }
        if (name === "reveal" && typeof args.secret === "string") {
          const [npc, secret] = args.secret.split(".") as [string, string];
          const n = npcs.get(npc);
          if (!n) out.add(file, [...path, "secret"], `unknown NPC '${npc}' in secret '${args.secret}'`, "plot");
          else if (!isObject(n.value.secrets) || !(secret in n.value.secrets)) out.add(file, [...path, "secret"], `NPC '${npc}' has no secret '${secret}'`, "plot");
        }
      },
    });

  const ctx: ContentContext = { ...base, visitor: (file) => plotVisitor(file, { kind: "actor" }) };

  // adventure.yaml
  const players = manifest.players as [number, number];
  if (players[0] > players[1]) out.add(manifestFile, ["players"], `minimum ${players[0]} is greater than maximum ${players[1]}`, "start");
  const start = manifest.start as JsonObject;
  const startLoc = locs.get(start.location as string);
  if (!startLoc) out.add(manifestFile, ["start", "location"], `unknown location '${String(start.location)}'`, "plot");
  else resolveRoom(start.room as string, { kind: "location", location: startLoc.id }, manifestFile, ["start", "room"]);
  walkEffects(start.effects, ["start", "effects"], plotVisitor(manifestFile, startLoc ? { kind: "location", location: startLoc.id } : { kind: "actor" }));

  // flags.yaml
  for (const [id, f] of Object.entries(flags)) {
    if (f.type === "int" && ((f.min as number) > (f.max as number) || (f.initial as number) < (f.min as number) || (f.initial as number) > (f.max as number))) {
      out.add(flagsFile, [id], `initial ${String(f.initial)} is outside the range [${String(f.min)}, ${String(f.max)}]`, "flag");
    }
    if (f.type === "enum" && !(f.values as string[]).includes(f.initial as string)) out.add(flagsFile, [id, "initial"], `'${String(f.initial)}' is not one of the flag's values`, "flag");
    if (typeof f.currency === "string") sites.push({ file: flagsFile, path: [id, "currency"], ref: f.currency, kind: "currency", check: "flag", set: (q) => (f.currency = q) });
  }

  // plot/*.yaml
  const triggerIds = new Map<string, string>();
  for (const { file, value } of arcs.values()) {
    if (!(value.stages as string[]).includes(value.initial as string)) out.add(file, ["initial"], `'${String(value.initial)}' is not one of the arc's stages`, "plot");
    (value.triggers as JsonObject[]).forEach((t, i) => {
      const at: Segment[] = ["triggers", i];
      const prior = triggerIds.get(t.id as string);
      if (prior) out.add(file, [...at, "id"], `trigger id '${String(t.id)}' is already used in ${prior}`, "plot");
      else triggerIds.set(t.id as string, file);
      const on = t.on as JsonObject;
      const type = on.type as string;
      checkMatch(on, file, [...at, "on"]);
      const scope: RoomScope = !ACTOR_EVENTS.has(type)
        ? { kind: "no_actor", event: type }
        : type === "moved" && typeof on.location === "string"
          ? { kind: "actor", location: on.location }
          : { kind: "actor" };
      const visit = plotVisitor(file, scope);
      walkRequirement(t.when, [...at, "when"], visit);
      walkEffects(t.effects, [...at, "effects"], visit);
    });
  }

  // Trigger event matches: payload fields that name content (adventure-packs.md, "Triggers").
  function checkMatch(on: JsonObject, file: string, path: Segment[]): void {
    const loc = typeof on.location === "string" ? locs.get(on.location) : undefined;
    for (const [key, v] of Object.entries(on)) {
      if (typeof v !== "string") continue;
      const p = [...path, key];
      switch (key) {
        // SPEC_ISSUES.md#trigger-match-refs: `ref` is a content ref; `item`, `target`, and `door` are entity ids.
        case "ref":
          sites.push({ file, path: p, ref: v, kind: "entity", check: "ref", set: (q) => (on.ref = q) });
          break;
        case "item":
        case "target":
        case "door":
        case "entity":
          deferredIds.push({ id: v, file, path: p });
          break;
        case "npc":
          if (!npcs.has(v)) out.add(file, p, `unknown NPC '${v}'`, "plot");
          break;
        case "topic": {
          const holders = typeof on.npc === "string" ? [npcs.get(on.npc)].filter(Boolean) : [...npcs.values()];
          if (!holders.some((n) => isObject(n!.value.topics) && v in n!.value.topics)) out.add(file, p, `unknown topic '${v}'`, "plot");
          break;
        }
        case "location":
          if (!locs.has(v)) out.add(file, p, `unknown location '${v}'`, "plot");
          break;
        case "to":
        case "from":
        case "room":
          if (loc ? !loc.rooms.has(v) : ![...locs.values()].some((l) => l.rooms.has(v))) out.add(file, p, loc ? `location '${loc.id}' has no room '${v}'` : `no location has a room '${v}'`, "room");
          break;
        case "via":
          if (![...locs.values()].some((l) => l.links.has(v))) out.add(file, p, `no location has a link '${v}'`, "plot");
          break;
        case "ending":
          if (!endings.has(v)) out.add(file, p, `unknown ending '${v}'`, "plot");
          break;
        case "flag":
          flagOf(v, file, p);
          break;
        case "arc":
          if (!arcStages.has(v)) out.add(file, p, `unknown arc '${v}'`, "plot");
          break;
        case "stage":
          if (typeof on.arc === "string") stage(on.arc, v, file, p);
          break;
        case "condition":
          if (!declared.conditions.has(v)) out.add(file, p, `condition '${v}' is not declared`, "declared");
          break;
      }
    }
  }

  // npcs/*.yaml
  // SPEC_ISSUES.md#room-scopes: topic effects resolve rooms in the actor's location.
  for (const { file, value } of npcs.values()) {
    sites.push({ file, path: ["template"], ref: value.template as string, kind: "creature", check: "npc", set: (q) => (value.template = q) });
    artSites(ctx, file, value, []);
    for (const [topic, def] of Object.entries((value.topics ?? {}) as Record<string, JsonObject>)) {
      const visit = plotVisitor(file, { kind: "actor" });
      walkRequirement(def.when, ["topics", topic, "when"], visit);
      walkEffects(def.effects, ["topics", topic, "effects"], visit);
    }
  }

  // entities/*.yaml
  for (const [key, { file, value }] of entities) checkEntity(ctx, key, file, value);

  // locations/*.yaml
  const templateFor = (ref: string): Template | undefined => {
    if (ref.startsWith("npc:")) {
      const npc = npcs.get(ref.slice(4));
      const t = npc ? catalog.entities.get(qualify(npc.value.template as string, ns)) : undefined;
      return t ? templateOf(t.value) : undefined;
    }
    const t = catalog.entities.get(qualify(ref, ns));
    return t ? templateOf(t.value) : undefined;
  };
  for (const [id, { file, value }] of locations) {
    if (value.kind === "authored") checkAuthored(id, file, value.map as JsonObject);
    else checkGenerated(id, file, value);
  }

  function checkAuthored(id: string, file: string, map: JsonObject): void {
    const visit = plotVisitor(file, { kind: "location", location: id });
    for (const [ch, entry] of Object.entries((map.legend ?? {}) as JsonObject)) {
      if (isObject(entry)) sites.push({ file, path: ["map", "legend", ch, "place"], ref: entry.place as string, kind: "entity", check: "ref", set: (q) => (entry.place = q) });
    }
    const contents = (map.contents ?? []) as JsonObject[];
    contents.forEach((c, i) => {
      const at: Segment[] = ["map", "contents", i];
      if (typeof c.ref === "string") sites.push({ file, path: [...at, "ref"], ref: c.ref, kind: c.lock !== undefined ? "door" : "entity", check: "ref", set: (q) => (c.ref = q) });
      if (typeof c.room === "string") resolveRoom(c.room, { kind: "location", location: id }, file, [...at, "room"]);
      if (typeof c.id === "string" && c.count !== undefined && c.count !== 1) out.add(file, [...at, "count"], "a placement with an id places exactly one entity", "plot");
      walkRequirement(c.lock, [...at, "lock"], visit);
    });
    const mapCtx = { file, path: ["map"], terrain, template: templateFor };
    const parsed = checkGrid(map, mapCtx, out);
    if (!parsed) return;
    checkPlacements(parsed, contents, ["map", "contents"], mapCtx, out);

    // 5. Rooms: areas inside the map, no overlap, every passable cell covered.
    const owner = new Map<number, string>();
    for (const [room, def] of Object.entries(map.rooms as Record<string, JsonObject>)) {
      (def.area as number[][]).forEach(([x, y, w, h], i) => {
        if (x! + w! > parsed.width || y! + h! > parsed.height) {
          out.add(file, ["map", "rooms", room, "area", i], `rectangle [${x}, ${y}, ${w}, ${h}] extends outside the ${parsed.width}x${parsed.height} map`, "rooms");
        }
        // Cells inside the map still belong to the room, so one bad rectangle reports once.
        for (let cy = y!; cy < Math.min(y! + h!, parsed.height); cy++) {
          for (let cx = x!; cx < Math.min(x! + w!, parsed.width); cx++) {
            const key = cy * 64 + cx;
            const prior = owner.get(key);
            if (prior && prior !== room) out.add(file, ["map", "rooms", room, "area", i], `cell [${cx}, ${cy}] is also in room '${prior}'`, "rooms");
            else owner.set(key, room);
          }
        }
      });
    }
    const uncovered: string[] = [];
    for (let y = 0; y < parsed.height; y++) {
      for (let x = 0; x < parsed.width; x++) {
        const t = parsed.terrain[y * parsed.width + x]!;
        if (t !== "void" && !terrain[t]?.obstructs.includes("movement") && !owner.has(y * 64 + x)) uncovered.push(`[${x}, ${y}]`);
      }
    }
    if (uncovered.length > 0) {
      const more = uncovered.length > 1 ? ` and ${uncovered.length - 1} more cells belong` : " belongs";
      out.add(file, ["map", "rooms"], `cell ${uncovered[0]}${more} to no room`, "rooms");
    }

    // 6. Links.
    for (const [link, def] of Object.entries((map.links ?? {}) as Record<string, JsonObject>)) {
      const [x, y] = def.at as number[];
      if (!owner.has(y! * 64 + x!)) out.add(file, ["map", "links", link, "at"], `link cell [${x}, ${y}] is not in a room`, "link");
      checkLinkTarget(def.to as JsonObject, file, ["map", "links", link, "to"]);
    }

    if (startLoc?.id === id) checkStartRoom(start.room as string, parsed, owner, contents);
  }

  function checkLinkTarget(to: JsonObject, file: string, path: Segment[]): void {
    const loc = locs.get(to.location as string);
    if (!loc) out.add(file, [...path, "location"], `unknown location '${String(to.location)}'`, "link");
    else if (!loc.links.has(to.link as string)) out.add(file, [...path, "link"], `location '${loc.id}' has no link '${String(to.link)}'`, "link");
  }

  // 10. The start room has a free cell for each player.
  // SPEC_ISSUES.md#start-free-cells: only fixed placements are known when compiling, and generated
  // start locations are not checked.
  function checkStartRoom(room: string, parsed: { width: number; height: number; terrain: string[]; placements: { at: readonly [number, number]; ref: string }[] }, owner: Map<number, string>, contents: JsonObject[]): void {
    const blocked = new Set<number>();
    const block = (ref: string, at: readonly [number, number]) => {
      const t = templateFor(ref);
      if (!t || !(t.obstructsMovement || t.kind === "creature")) return;
      for (let dy = 0; dy < t.footprint[1]; dy++) for (let dx = 0; dx < t.footprint[0]; dx++) blocked.add((at[1] + dy) * 64 + at[0] + dx);
    };
    for (const p of parsed.placements) block(p.ref, p.at);
    for (const c of contents) {
      if (!Array.isArray(c.at)) continue;
      block(typeof c.npc === "string" ? npcRef(c.npc) : (c.ref as string), c.at as unknown as [number, number]);
    }
    let free = 0;
    for (const [key, r] of owner) {
      if (r !== room || blocked.has(key)) continue;
      const t = parsed.terrain[Math.floor(key / 64) * parsed.width + (key % 64)]!;
      if (t !== "void" && !terrain[t]?.obstructs.includes("movement")) free++;
    }
    if (free < players[1]) out.add(manifestFile, ["start", "room"], `room '${room}' has ${free} free cells; players allows ${players[1]}`, "start");
  }

  function checkGenerated(id: string, file: string, value: JsonObject): void {
    const generator = (value.generator ?? {}) as JsonObject;
    const rooms = (generator.rooms as [number, number] | undefined) ?? GENERATOR_DEFAULT_ROOMS;
    if (rooms[0] > rooms[1]) out.add(file, ["generator", "rooms"], `room count range [${rooms[0]}, ${rooms[1]}] is not ordered`, "anchors");
    const population = value.population as JsonObject;
    sites.push({ file, path: ["population", "encounter_table"], ref: population.encounter_table as string, kind: "table", check: "ref", set: (q) => (population.encounter_table = q) });
    if (typeof population.loot_table === "string") {
      sites.push({ file, path: ["population", "loot_table"], ref: population.loot_table, kind: "item_table", check: "ref", use: `loot of '${id}'`, set: (q) => (population.loot_table = q) });
    }
    const templates = (population.room_templates ?? []) as string[];
    templates.forEach((ref, i) => sites.push({ file, path: ["population", "room_templates", i], ref, kind: "room_template", check: "ref", set: (q) => (templates[i] = q) }));

    ((value.anchors ?? []) as JsonObject[]).forEach((a, i) => {
      const at: Segment[] = ["anchors", i];
      if (RESERVED_ID.test(a.id as string)) out.add(file, [...at, "id"], `anchor id '${String(a.id)}' is reserved for room aliases`, "anchors");
      const place = a.place as JsonObject;
      if (typeof place.ref === "string") sites.push({ file, path: [...at, "place", "ref"], ref: place.ref, kind: "entity", check: "ref", set: (q) => (place.ref = q) });
      const c = (a.constraints ?? {}) as JsonObject;
      const maxDepth = rooms[1] - 1;
      if (typeof c.min_depth === "number" && c.min_depth > maxDepth) out.add(file, at, `min_depth ${c.min_depth} unreachable with at most ${rooms[1]} rooms`, "anchors");
      if (typeof c.min_depth === "number" && typeof c.max_depth === "number" && c.min_depth > c.max_depth) out.add(file, [...at, "constraints"], `min_depth ${c.min_depth} is greater than max_depth ${c.max_depth}`, "anchors");
    });
    for (const [link, def] of Object.entries((value.links ?? {}) as Record<string, JsonObject>)) {
      if (RESERVED_ID.test(link)) out.add(file, ["links", link], `link id '${link}' is reserved for room aliases`, "anchors");
      if (!GENERATED_ROLES.has(def.role as string)) out.add(file, ["links", link, "role"], `the generator assigns no room the role '${String(def.role)}'`, "anchors");
      else if (def.role === "dead_end" && rooms[1] < 2) out.add(file, ["links", link, "role"], `a dead end needs at least 2 rooms; the location has at most ${rooms[1]}`, "anchors");
      checkLinkTarget(def.to as JsonObject, file, ["links", link, "to"]);
    }
  }

  // Deferred entity ids, now that every placement and spawn is known.
  for (const d of deferredIds) {
    const known = ids.get(d.id);
    const spawned = spawnIds.get(d.id);
    if (!known && spawned === undefined) {
      out.add(d.file, d.path, d.door ? `unknown door '${d.id}'` : `unknown entity id '${d.id}'`, "plot");
      continue;
    }
    if (d.door) {
      const ref = known?.ref ?? spawned!;
      if (kindOf(ref) !== undefined && kindOf(ref) !== "door") out.add(d.file, d.path, `'${d.id}' is not a door`, "plot");
    }
  }

  // 7. Some ending is reachable: with every trigger able to fire, an end_campaign effect exists.
  // SPEC_ISSUES.md#ending-reachability: the automatic ending `lost` does not count.
  if (endingsUsed.size === 0 || ![...endingsUsed].some((e) => endings.has(e))) out.add(manifestFile, ["endings"], "no ending is reachable", "ending");

  // 8. Door locks that reference only flags reference a flag some effect sets.
  for (const [, { file, value }] of locations) {
    if (value.kind !== "authored") continue;
    (((value.map as JsonObject).contents ?? []) as JsonObject[]).forEach((c, i) => {
      if (typeof c.ref !== "string" || kindOf(c.ref) !== "door") return;
      const lock = c.lock ?? (catalog.entities.get(qualify(c.ref, ns))?.value.lock as Json | undefined);
      if (lock === undefined) return;
      const flagsIn: string[] = [];
      let onlyFlags = true;
      walkRequirement(lock, [], {
        requirement(form, _a, _p, node) {
          if (form === "flag") flagsIn.push(node.flag as string);
          else onlyFlags = false;
        },
      });
      if (onlyFlags && flagsIn.length > 0 && !flagsIn.some((f) => flagSetters.has(f))) {
        out.add(file, c.lock !== undefined ? ["map", "contents", i, "lock"] : ["map", "contents", i, "ref"], `no effect sets flag '${flagsIn[0]}'`, "lock");
      }
    });
  }

  // 16. Art.
  checkAssets(assets as Record<string, JsonObject>, assetsFile, pack.assets, out);
  resolveSites(sites, catalog, ns, (ref) => `'${ref}' is outside the namespaces of this adventure and its settings: ${catalog.namespaces.join(", ")}`, out);
  for (const [key, { file, value }] of entities) checkArtKinds(ctx, file, value, [key]);
  for (const [, { file, value }] of npcs) checkArtKinds(ctx, file, value, []);

  if (!out.ok) return { ok: false, diagnostics: sortDiagnostics(out.list) };

  qualifySites(sites, ns);
  for (const { value } of entities.values()) applyEntityDefaults(value);
  for (const f of Object.values(flags)) f.scope ??= "party";
  for (const { value } of arcs.values()) for (const t of value.triggers as JsonObject[]) t.once ??= false;
  const { format_version: _f, kind: _k, id, version, ...rest } = manifest;
  const bundle: AdventureBundle = {
    kind: "adventure",
    format_version: FORMAT_VERSION,
    id: id as string,
    version: version as string,
    namespace: id as string,
    manifest: {
      ...rest,
      system: { ...(manifest.system as JsonObject), modules: bound!.modules, resolved: bound!.resolved },
      requires_settings: (manifest.requires_settings as JsonObject[]).map((r) => ({ ...r, resolved: used.find((s) => s.id === r.id)!.version })),
      start: { ...start, effects: start.effects ?? [] },
    } as unknown as AdventureBundle["manifest"],
    flags: flags as never,
    arcs: [...arcs.values()].map((e) => e.value) as never,
    locations: Object.fromEntries([...locations].map(([k, e]) => [k, e.value])) as never,
    npcs: Object.fromEntries([...npcs].map(([k, e]) => [k, e.value])) as never,
    entities: Object.fromEntries([...entities].map(([k, e]) => [k, e.value])) as never,
    assets: assets as never,
  };
  return { ok: true, diagnostics: [], bundle };
}

/** Checks `requires_settings` against the supplied bundles; returns the settings in requirement order. */
function checkSettings(manifest: JsonObject, file: string, settings: readonly SettingBundle[], out: Diagnostics): SettingBundle[] {
  const used: SettingBundle[] = [];
  const system = manifest.system as JsonObject;
  const modules = (system.modules as string[] | undefined) ?? [];
  (manifest.requires_settings as JsonObject[]).forEach((req, i) => {
    const path: Segment[] = ["requires_settings", i];
    const candidates = settings.filter((s) => s.id === req.id);
    if (candidates.length === 0) {
      out.add(file, path, `requires setting '${String(req.id)}' ${String(req.versions)}, which is not supplied`, "settings");
      return;
    }
    const match = candidates.find((s) => satisfies(s.version, req.versions as string));
    if (!match) {
      out.add(file, [...path, "versions"], `supplied ${String(req.id)} ${candidates.map((s) => s.version).join(", ")} does not satisfy '${String(req.versions)}'`, "settings");
      return;
    }
    if (match.manifest.system.id !== system.id) {
      out.add(file, path, `setting '${match.id}' binds ${match.manifest.system.id}; the adventure binds ${String(system.id)}`, "settings");
      return;
    }
    const missing = match.manifest.system.modules.filter((m) => !modules.includes(m));
    if (missing.length > 0) out.add(file, path, `setting '${match.id}' needs module '${missing[0]}', which the adventure does not declare`, "settings");
    used.push(match);
  });
  return used;
}
