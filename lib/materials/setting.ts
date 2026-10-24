// The Content Compiler for setting packs (spec/README.md, "Checks" and "Bundle";
// setting-packs.md, "Validation").

import type { SettingBundle } from "../bundle/setting";
import { FORMAT_VERSION, builtinConditions, builtinTerrain } from "../bundle/setting";
import { checkAssets, hashAssets, type AssetFile } from "./art";
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
  type Catalog,
  type ContentContext,
  type RefSite,
} from "./content";
import { sortDiagnostics, type Diagnostic } from "./diagnostics";
import { checkGrid, checkPlacements, templateOf, terrainTable } from "./maps";
import { Diagnostics, readPack, type Entry, type PackFiles, type ParsedPack } from "./pack";
import { bindSystem, checkStats, type BoundSystem } from "./rules";
import { isObject, walkEffects, walkRequirement, type JsonObject } from "./walk";

export interface CompileResult<B> {
  ok: boolean;
  diagnostics: Diagnostic[];
  bundle?: B;
  /** The bundle's asset files by SHA-256, for publishing beside it. */
  files?: Record<string, AssetFile>;
}

export { qualify };

const clone = <T>(v: T): T => structuredClone(v);

interface Setting {
  file: string;
  manifest: JsonObject;
  namespace: string;
  conditions: JsonObject;
  conditionsFile: string;
  abilities: Map<string, Entry>;
  entities: Map<string, Entry>;
  rooms: Map<string, Entry>;
  tables: JsonObject;
  tablesFile: string;
  parser: JsonObject;
  assets: JsonObject;
  assetsFile: string;
}

const records = (pack: ParsedPack, dir: string): Map<string, Entry> =>
  new Map([...(pack.merged.get(dir) ?? [])].map(([k, e]) => [k, { file: e.file, value: clone(e.value) }]));

function settingOf(pack: ParsedPack): Setting {
  const get = (p: string) => pack.single.get(p);
  return {
    file: get("manifest.yaml")!.file,
    manifest: clone(get("manifest.yaml")!.data),
    namespace: get("manifest.yaml")!.data.namespace as string,
    conditions: clone(get("conditions.yaml")?.data ?? {}),
    conditionsFile: get("conditions.yaml")?.file ?? "conditions.yaml",
    abilities: records(pack, "abilities/*.yaml"),
    entities: records(pack, "entities/*.yaml"),
    rooms: records(pack, "rooms/*.yaml"),
    tables: clone(get("tables.yaml")!.data),
    tablesFile: get("tables.yaml")!.file,
    parser: clone(get("parser.yaml")?.data ?? {}),
    assets: clone(get("assets.yaml")?.data ?? {}),
    assetsFile: get("assets.yaml")?.file ?? "assets.yaml",
  };
}

function catalogOf(s: Setting): Catalog {
  const ns = s.namespace;
  const c = emptyCatalog([ns]);
  for (const [k, e] of s.entities) c.entities.set(`${ns}:${k}`, e);
  for (const [k, e] of s.abilities) c.abilities.set(`${ns}:${k}`, e);
  for (const [k, e] of s.rooms) c.rooms.set(`${ns}:${k}`, e);
  for (const [k, entries] of Object.entries(s.tables)) {
    if (Array.isArray(entries)) c.tables.set(`${ns}:${k}`, { value: {}, entries: entries as JsonObject[], file: s.tablesFile, path: [k] });
  }
  for (const [k, a] of Object.entries(s.assets)) if (isObject(a)) c.assets.set(`${ns}:${k}`, { value: a });
  if (isObject(s.manifest.currency)) c.currencies.add(`${ns}:${String(s.manifest.currency.id)}`);
  return c;
}

/** Compiles a setting pack. The result carries every diagnostic, and the bundle when there are none. */
export function compileSetting(files: PackFiles): CompileResult<SettingBundle> {
  const out = new Diagnostics();
  const pack = readPack("setting", files, out);
  if (!out.ok) return { ok: false, diagnostics: sortDiagnostics(out.list) };

  const s = settingOf(pack);
  const ns = s.namespace;
  const bound = bindSystem(s.manifest.system as JsonObject, s.file, ["system"], out);
  const sites: RefSite[] = [];
  const catalog = catalogOf(s);
  const declared = {
    damageTypes: new Set(s.manifest.damage_types as string[]),
    conditions: new Set([...Object.keys(s.conditions), ...BUILTIN_CONDITIONS]),
  };
  const base = { out, sites, bound, namespace: ns, catalog };
  const ctx: ContentContext = { ...base, visitor: (file) => contentVisitor(base, file, declared) };
  const terrain = terrainTable((s.manifest.terrain ?? {}) as Record<string, JsonObject>);

  // manifest.yaml
  const gen = s.manifest.generation as JsonObject;
  sites.push({ file: s.file, path: ["generation", "door"], ref: gen.door as string, kind: "door", check: "generation", set: (q) => (gen.door = q) });
  for (const [door, key] of Object.entries(gen.locks as JsonObject)) {
    sites.push({ file: s.file, path: ["generation", "locks", door], ref: door, kind: "door", check: "generation" });
    sites.push({ file: s.file, path: ["generation", "locks", door], ref: key as string, kind: "item", check: "generation" });
  }
  if (isObject(s.manifest.starting_items)) {
    const pick = s.manifest.starting_items;
    sites.push({ file: s.file, path: ["starting_items", "table"], ref: pick.table as string, kind: "item_table", check: "ref", use: "starting_items", set: (q) => (pick.table = q) });
  }
  const terrainDefs = (s.manifest.terrain ?? {}) as Record<string, JsonObject>;
  for (const [id, t] of Object.entries(terrainDefs)) artSites(ctx, s.file, t, ["terrain", id]);
  if (isObject(s.manifest.currency)) {
    const values = Object.values(s.manifest.currency.denominations as Record<string, JsonObject>).map((d) => d.value);
    if (!values.includes(1)) out.add(s.file, ["currency", "denominations"], "needs a denomination of value 1", "currency");
  }

  // conditions.yaml
  for (const [id, c] of Object.entries(s.conditions as Record<string, JsonObject>)) walkEffects(c.on_turn_start, [id, "on_turn_start"], ctx.visitor(s.conditionsFile));

  // abilities/*.yaml
  for (const [key, { file, value }] of s.abilities) {
    walkEffects(value.effects, [key, "effects"], ctx.visitor(file));
    artSites(ctx, file, value, [key]);
    if (bound) checkStats(bound, "ability", value.system_stats, file, [key, "system_stats"], out);
  }

  // entities/*.yaml
  for (const [key, { file, value }] of s.entities) checkEntity(ctx, key, file, value);

  // rooms/*.yaml
  const templates = new Map([...s.entities].map(([k, e]) => [`${ns}:${k}`, templateOf(e.value)]));
  for (const [key, { file, value }] of s.rooms) {
    if (typeof value.min_depth === "number" && typeof value.max_depth === "number" && value.min_depth > value.max_depth) {
      out.add(file, [key, "max_depth"], `max_depth ${value.max_depth} is less than min_depth ${value.min_depth}`, "depth");
    }
    const map = value.map as JsonObject;
    for (const [ch, entry] of Object.entries((map.legend ?? {}) as JsonObject)) {
      if (isObject(entry)) sites.push({ file, path: [key, "map", "legend", ch, "place"], ref: entry.place as string, kind: "entity", check: "ref", set: (q) => (entry.place = q) });
    }
    const contents = (value.contents ?? []) as JsonObject[];
    contents.forEach((c, i) => {
      for (const forbidden of ["npc", "id", "room"]) {
        if (forbidden in c) out.add(file, [key, "contents", i, forbidden], `room template contents cannot use '${forbidden}'`, "placement");
      }
      if (typeof c.ref === "string") {
        sites.push({ file, path: [key, "contents", i, "ref"], ref: c.ref, kind: c.lock !== undefined ? "door" : "entity", check: "ref", set: (q) => (c.ref = q) });
      }
      walkRequirement(c.lock, [key, "contents", i, "lock"], ctx.visitor(file));
    });
    const mapCtx = { file, path: [key, "map"], terrain, template: (ref: string) => templates.get(qualify(ref, ns)) };
    const parsed = checkGrid(map, mapCtx, out);
    if (parsed) checkPlacements(parsed, contents, [key, "contents"], mapCtx, out);
  }

  // tables.yaml
  for (const [table, entries] of Object.entries(s.tables)) {
    if (table === "room_labels" || !Array.isArray(entries)) continue;
    (entries as JsonObject[]).forEach((e, i) => {
      sites.push({ file: s.tablesFile, path: [table, i, "ref"], ref: e.ref as string, kind: "entity", check: "ref", set: (q) => (e.ref = q) });
      const depth = e.depth as number[] | undefined;
      if (depth && depth[0]! > depth[1]!) out.add(s.tablesFile, [table, i, "depth"], `depth range [${depth[0]}, ${depth[1]}] is not ordered`, "depth");
    });
  }

  // assets.yaml and art lists
  checkAssets(s.assets as Record<string, JsonObject>, s.assetsFile, pack.assets, out);
  resolveSites(sites, catalog, ns, (ref) => `'${ref}' is outside the pack's namespace '${ns}'`, out);
  for (const [id, t] of Object.entries(terrainDefs)) checkArtKinds(ctx, s.file, t, ["terrain", id]);
  for (const map of [s.abilities, s.entities]) for (const [key, { file, value }] of map) checkArtKinds(ctx, file, value, [key]);

  if (!out.ok) return { ok: false, diagnostics: sortDiagnostics(out.list) };
  const assetFiles = hashAssets(s.assets as Record<string, JsonObject>, pack.assets);
  return { ok: true, diagnostics: [], bundle: buildBundle(s, sites, bound!), files: assetFiles };
}

/** Qualifies refs, writes engine defaults, and merges built-in terrain and conditions (spec/README.md, "Bundle"). */
function buildBundle(s: Setting, sites: RefSite[], bound: BoundSystem): SettingBundle {
  const ns = s.namespace;
  qualifySites(sites, ns);
  const m = s.manifest;
  const gen = m.generation as JsonObject;
  gen.locks = Object.fromEntries(Object.entries(gen.locks as JsonObject).map(([d, k]) => [qualify(d, ns), qualify(k as string, ns)]));
  for (const { value } of s.entities.values()) applyEntityDefaults(value);

  const terrain = builtinTerrain();
  for (const [id, t] of Object.entries((m.terrain ?? {}) as Record<string, JsonObject>)) {
    terrain[id] = { ...t, obstructs: (t.obstructs as string[] | undefined) ?? [], cost: (t.cost as number | undefined) ?? 1, tags: (t.tags as string[] | undefined) ?? [] } as never;
  }
  const { format_version: _f, kind: _k, id, version, namespace, ...rest } = m;
  const system = m.system as JsonObject;
  const manifest = { ...rest, terrain, system: { ...system, modules: bound.modules, resolved: bound.resolved } };
  return {
    kind: "setting",
    format_version: FORMAT_VERSION,
    id: id as string,
    version: version as string,
    namespace: namespace as string,
    manifest: manifest as never,
    conditions: { ...builtinConditions(), ...s.conditions } as never,
    abilities: Object.fromEntries([...s.abilities].map(([k, e]) => [k, e.value])) as never,
    entities: Object.fromEntries([...s.entities].map(([k, e]) => [k, e.value])) as never,
    rooms: Object.fromEntries([...s.rooms].map(([k, e]) => [k, e.value])) as never,
    tables: s.tables as never,
    parser: s.parser as never,
    assets: s.assets as never,
  };
}
