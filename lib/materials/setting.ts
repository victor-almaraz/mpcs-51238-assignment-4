// The Content Compiler for setting packs (spec/README.md, "Checks" and "Bundle";
// setting-packs.md, "Validation").

import type { SettingBundle } from "../bundle/setting";
import { FORMAT_VERSION, builtinConditions, builtinTerrain } from "../bundle/setting";
import { checkArtList, checkAssets } from "./art";
import { sortDiagnostics, type Check, type Diagnostic, type Segment } from "./diagnostics";
import { checkGrid, checkPlacements, templateOf, terrainTable } from "./maps";
import { Diagnostics, readPack, type Entry, type PackFiles, type ParsedPack } from "./pack";
import { bindSystem, checkStats, type BoundSystem } from "./rules";
import { isObject, walkEffects, walkRequirement, walkVerbs, type Json, type JsonObject, type Visitor } from "./walk";

export interface CompileResult<B> {
  ok: boolean;
  diagnostics: Diagnostic[];
  bundle?: B;
}

// SPEC_ISSUES.md#ref-kinds: the expected kind of each ref is inferred from its use.
/** What a ref must resolve to. `item_table` is a table whose entries are all items. */
export type RefKind = "entity" | "item" | "door" | "table" | "item_table" | "ability" | "asset";

export interface RefSite {
  file: string;
  path: Segment[];
  ref: string;
  kind: RefKind;
  check: Check;
  /** Why an `item_table` must hold items, for messages. */
  use?: string;
  /** Replaces the ref in the data being compiled. */
  set?: (qualified: string) => void;
}

const BUILTIN_CONDITIONS = ["incapacitated", "hidden"];

export function qualify(ref: string, namespace: string): string {
  return ref.includes(":") ? ref : `${namespace}:${ref}`;
}

/** Every ref in the effect and requirement languages under `visit`, and declared-name checks. */
export function languageVisitor(
  file: string,
  sites: RefSite[],
  onDamageType: (type: string, path: Segment[]) => void,
  onCondition: (condition: string, path: Segment[]) => void,
  onCheck: (spec: Json, path: Segment[]) => void,
): Visitor {
  return {
    requirement(form, args, path) {
      // Requirement refs are qualified by qualifyRequirement, since leaves arrive without their parent.
      if (form === "has_item" && typeof args === "string") {
        sites.push({ file, path: [...path, "has_item"], ref: args, kind: "item", check: "ref" });
      }
      if (form === "check") onCheck(args, [...path, "check"]);
    },
    effect(name, args, path) {
      if ((name === "give_item" || name === "remove_item" || name === "drop_item") && typeof args.ref === "string") {
        sites.push({ file, path: [...path, "ref"], ref: args.ref, kind: "item", check: "ref", set: (q) => (args.ref = q) });
      }
      if (name === "spawn" && typeof args.ref === "string") {
        sites.push({ file, path: [...path, "ref"], ref: args.ref, kind: "entity", check: "ref", set: (q) => (args.ref = q) });
      }
      if (name === "damage" && typeof args.type === "string") onDamageType(args.type, [...path, "type"]);
      if ((name === "apply_condition" || name === "remove_condition") && typeof args.condition === "string") {
        onCondition(args.condition, [...path, "condition"]);
      }
    },
  };
}

/** Qualifies `has_item` refs in a requirement tree in place. */
export function qualifyRequirement(req: Json | undefined, namespace: string): void {
  if (!isObject(req)) return;
  if (Array.isArray(req.all)) req.all.forEach((r) => qualifyRequirement(r, namespace));
  if (Array.isArray(req.any)) req.any.forEach((r) => qualifyRequirement(r, namespace));
  if ("not" in req) qualifyRequirement(req.not, namespace);
  if (typeof req.has_item === "string") req.has_item = qualify(req.has_item, namespace);
}

/** Qualifies requirement refs inside effects (`if.when`) in place. */
export function qualifyEffectRequirements(effects: Json | undefined, namespace: string): void {
  if (!Array.isArray(effects)) return;
  for (const effect of effects) {
    if (!isObject(effect) || !isObject(effect.if)) continue;
    qualifyRequirement(effect.if.when, namespace);
    qualifyEffectRequirements(effect.if.then, namespace);
    qualifyEffectRequirements(effect.if.else, namespace);
  }
}

const clone = <T>(v: T): T => structuredClone(v);

interface Setting {
  file: string;
  manifest: JsonObject;
  namespace: string;
  conditions: JsonObject;
  abilities: Map<string, Entry>;
  entities: Map<string, Entry>;
  rooms: Map<string, Entry>;
  tables: JsonObject;
  tablesFile: string;
  parser: JsonObject;
  assets: JsonObject;
  assetsFile: string;
}

function settingOf(pack: ParsedPack): Setting {
  const get = (p: string) => pack.single.get(p);
  return {
    file: get("manifest.yaml")!.file,
    manifest: clone(get("manifest.yaml")!.data),
    namespace: get("manifest.yaml")!.data.namespace as string,
    conditions: clone(get("conditions.yaml")?.data ?? {}),
    abilities: new Map([...(pack.merged.get("abilities/*.yaml") ?? [])].map(([k, e]) => [k, { file: e.file, value: clone(e.value) }])),
    entities: new Map([...(pack.merged.get("entities/*.yaml") ?? [])].map(([k, e]) => [k, { file: e.file, value: clone(e.value) }])),
    rooms: new Map([...(pack.merged.get("rooms/*.yaml") ?? [])].map(([k, e]) => [k, { file: e.file, value: clone(e.value) }])),
    tables: clone(get("tables.yaml")!.data),
    tablesFile: get("tables.yaml")!.file,
    parser: clone(get("parser.yaml")?.data ?? {}),
    assets: clone(get("assets.yaml")?.data ?? {}),
    assetsFile: get("assets.yaml")?.file ?? "assets.yaml",
  };
}

function conditionsFile(pack: ParsedPack): string {
  return pack.single.get("conditions.yaml")?.file ?? "conditions.yaml";
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
  const damageTypes = new Set(s.manifest.damage_types as string[]);
  const conditionIds = new Set([...Object.keys(s.conditions), ...BUILTIN_CONDITIONS]);
  const terrain = terrainTable((s.manifest.terrain ?? {}) as Record<string, JsonObject>);

  const visitor = (file: string) =>
    languageVisitor(
      file,
      sites,
      (type, path) => {
        if (!damageTypes.has(type)) out.add(file, path, `damage type '${type}' is not declared in damage_types`, "declared");
      },
      (condition, path) => {
        if (!conditionIds.has(condition)) out.add(file, path, `condition '${condition}' is not declared`, "declared");
      },
      (spec, path) => {
        if (bound) checkStats(bound, "check", spec, file, path, out);
      },
    );

  const art = (file: string, value: JsonObject, path: Segment[]) => {
    if (!Array.isArray(value.art)) return;
    const list = value.art as string[];
    list.forEach((ref, i) => sites.push({ file, path: [...path, "art", i], ref, kind: "asset", check: "art", set: (q) => (list[i] = q) }));
  };

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
  for (const [id, t] of Object.entries((s.manifest.terrain ?? {}) as Record<string, JsonObject>)) art(s.file, t, ["terrain", id]);
  if (isObject(s.manifest.currency)) {
    const values = Object.values(s.manifest.currency.denominations as Record<string, JsonObject>).map((d) => d.value);
    if (!values.includes(1)) out.add(s.file, ["currency", "denominations"], "needs a denomination of value 1", "currency");
  }

  // conditions.yaml
  const cfile = conditionsFile(pack);
  for (const [id, c] of Object.entries(s.conditions as Record<string, JsonObject>)) walkEffects(c.on_turn_start, [id, "on_turn_start"], visitor(cfile));

  // abilities/*.yaml
  for (const [key, { file, value }] of s.abilities) {
    walkEffects(value.effects, [key, "effects"], visitor(file));
    art(file, value, [key]);
    if (bound) checkStats(bound, "ability", value.system_stats, file, [key, "system_stats"], out);
  }

  // entities/*.yaml
  for (const [key, { file, value }] of s.entities) {
    const kind = value.kind as string;
    art(file, value, [key]);
    walkVerbs(value.verbs, [key, "verbs"], visitor(file));
    walkRequirement(value.lock, [key, "lock"], visitor(file));
    if (isObject(value.light) && (value.light.dim as number) < (value.light.bright as number)) {
      out.add(file, [key, "light", "dim"], `dim radius ${String(value.light.dim)} is less than bright radius ${String(value.light.bright)}`, "light");
    }
    if (kind === "creature") {
      if (bound) checkStats(bound, "creature", value.system_stats, file, [key, "system_stats"], out);
      if (isObject(value.loot)) {
        const loot = value.loot;
        sites.push({ file, path: [key, "loot", "table"], ref: loot.table as string, kind: "item_table", check: "ref", use: `loot of '${key}'`, set: (q) => (loot.table = q) });
      }
    }
    if (kind === "item") {
      if (value.system_stats !== undefined && bound) checkStats(bound, "item", value.system_stats, file, [key, "system_stats"], out);
      if (isObject(value.use)) walkEffects(value.use.effects, [key, "use", "effects"], visitor(file));
    }
    if (kind === "container") {
      const contents = value.contents;
      if (isObject(contents)) {
        sites.push({ file, path: [key, "contents", "table"], ref: contents.table as string, kind: "item_table", check: "ref", use: `contents of '${key}'`, set: (q) => (contents.table = q) });
      } else if (Array.isArray(contents)) {
        contents.forEach((ref, i) => sites.push({ file, path: [key, "contents", i], ref: ref as string, kind: "item", check: "ref", set: (q) => (contents[i] = q) }));
      }
    }
    if (kind === "obstacle" || kind === "door") {
      if (value.system_stats !== undefined && bound) checkStats(bound, "structure", value.system_stats, file, [key, "system_stats"], out);
      if (value.remains !== undefined) {
        if (value.system_stats === undefined) out.add(file, [key, "remains"], "requires system_stats, so that the template can be destroyed", "remains");
        sites.push({ file, path: [key, "remains"], ref: value.remains as string, kind: "entity", check: "ref", set: (q) => (value.remains = q) });
      }
    }
  }

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
      walkRequirement(c.lock, [key, "contents", i, "lock"], visitor(file));
    });
    const ctx = { file, path: [key, "map"], terrain, template: (ref: string) => templates.get(qualify(ref, ns)) };
    const parsed = checkGrid(map, ctx, out);
    if (parsed) checkPlacements(parsed, contents, [key, "contents"], ctx, out);
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

  // assets.yaml
  checkAssets(s.assets as Record<string, JsonObject>, s.assetsFile, pack.assets, out);

  resolveSites(sites, s, out);
  for (const { file, value, path } of artLists(s)) {
    checkArtList(value, (ref) => (s.assets[keyIn(ref, ns)] as JsonObject | undefined)?.kind as never, file, path, out);
  }

  if (!out.ok) return { ok: false, diagnostics: sortDiagnostics(out.list) };
  return { ok: true, diagnostics: [], bundle: buildBundle(s, sites, bound!) };
}

function keyIn(ref: string, namespace: string): string {
  const [ns, key] = ref.includes(":") ? ref.split(":") : [namespace, ref];
  return ns === namespace ? key! : "";
}

function* artLists(s: Setting): Generator<{ file: string; value: string[]; path: Segment[] }> {
  for (const [id, t] of Object.entries((s.manifest.terrain ?? {}) as Record<string, JsonObject>)) {
    if (Array.isArray(t.art)) yield { file: s.file, value: t.art as string[], path: ["terrain", id, "art"] };
  }
  for (const map of [s.abilities, s.entities]) {
    for (const [key, { file, value }] of map) if (Array.isArray(value.art)) yield { file, value: value.art as string[], path: [key, "art"] };
  }
}

const article = (word: string): string => `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;

const KIND_LABEL: Readonly<Record<RefKind, string>> = {
  entity: "an entity template",
  item: "an item template",
  door: "a door template",
  table: "a table",
  item_table: "a table",
  ability: "an ability",
  asset: "an asset",
};

/** Resolves every ref within the pack's namespace, checking its kind. */
function resolveSites(sites: RefSite[], s: Setting, out: Diagnostics): void {
  const ns = s.namespace;
  for (const site of sites) {
    const [refNs, key] = site.ref.includes(":") ? site.ref.split(":") : [ns, site.ref];
    if (refNs !== ns) {
      out.add(site.file, site.path, `'${site.ref}' is outside the pack's namespace '${ns}'`, site.check);
      continue;
    }
    const k = key!;
    const missing = () => out.add(site.file, site.path, `'${site.ref}' is not ${KIND_LABEL[site.kind]} of this pack`, site.check);
    switch (site.kind) {
      case "entity":
        if (!s.entities.has(k)) missing();
        break;
      case "item":
      case "door": {
        const e = s.entities.get(k);
        if (!e) missing();
        else if (e.value.kind !== site.kind) out.add(site.file, site.path, `'${site.ref}' is ${article(String(e.value.kind))} template, not ${KIND_LABEL[site.kind]}`, site.check);
        break;
      }
      case "table":
      case "item_table": {
        const entries = s.tables[k];
        if (!Array.isArray(entries) || k === "room_labels") {
          out.add(site.file, site.path, k === "room_labels" ? `'room_labels' holds labels, not templates` : `'${site.ref}' is not a table of this pack`, site.check);
          break;
        }
        if (site.kind === "item_table") {
          (entries as JsonObject[]).forEach((e, i) => {
            const target = s.entities.get(keyIn(e.ref as string, ns));
            if (target && target.value.kind !== "item") {
              out.add(s.tablesFile, [k, i, "ref"], `'${String(e.ref)}' is ${article(String(target.value.kind))} template; table '${k}' supplies items to ${site.use}`, "ref");
            }
          });
        }
        break;
      }
      case "ability":
        if (!s.abilities.has(k)) missing();
        break;
      case "asset":
        if (!isObject(s.assets[k])) missing();
        break;
    }
  }
}

/** Qualifies refs, writes engine defaults, and merges built-in terrain and conditions (spec/README.md, "Bundle"). */
function buildBundle(s: Setting, sites: RefSite[], bound: BoundSystem): SettingBundle {
  const ns = s.namespace;
  for (const site of sites) site.set?.(qualify(site.ref, ns));
  const m = s.manifest;
  const gen = m.generation as JsonObject;
  gen.locks = Object.fromEntries(Object.entries(gen.locks as JsonObject).map(([d, k]) => [qualify(d, ns), qualify(k as string, ns)]));

  for (const c of Object.values(s.conditions as Record<string, JsonObject>)) qualifyEffectRequirements(c.on_turn_start, ns);
  for (const { value } of s.abilities.values()) qualifyEffectRequirements(value.effects, ns);
  for (const { value } of s.entities.values()) {
    qualifyRequirement(value.lock, ns);
    for (const verb of Object.values((value.verbs ?? {}) as Record<string, JsonObject>)) {
      qualifyRequirement(verb.requirement, ns);
      qualifyEffectRequirements(verb.effects, ns);
    }
    if (isObject(value.use)) qualifyEffectRequirements(value.use.effects, ns);
    applyEntityDefaults(value);
  }
  for (const { value } of s.rooms.values()) for (const c of (value.contents ?? []) as JsonObject[]) qualifyRequirement(c.lock, ns);

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

/** Engine defaults written into each entity: `footprint`, `obstructs`, `cover`, `open`, and `uses`. */
export function applyEntityDefaults(value: JsonObject): void {
  const kind = value.kind as string;
  value.footprint ??= [1, 1];
  if (kind === "container" || kind === "fixture") value.obstructs ??= [];
  if (kind === "obstacle" || kind === "door") value.obstructs ??= ["movement", "sight"];
  if (kind === "container" || kind === "fixture" || kind === "obstacle") value.cover ??= false;
  if (kind === "door") value.open ??= false;
  if (kind === "item") value.uses ??= null;
}
