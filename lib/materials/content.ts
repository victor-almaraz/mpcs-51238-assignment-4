// Content shared by setting and adventure packs: the catalog of what refs can name, ref resolution,
// entity template checks, and engine defaults (spec/README.md, "Checks" and "Bundle").

import { checkArtList } from "./art";
import type { Check, Segment } from "./diagnostics";
import type { Diagnostics } from "./pack";
import { checkStats, type BoundSystem } from "./rules";
import { isObject, walkEffects, walkRequirement, walkVerbs, type Json, type JsonObject, type Visitor } from "./walk";

// SPEC_ISSUES.md#ref-kinds: the expected kind of each ref is inferred from its use.
/** What a ref must resolve to. `item_table` is a table whose entries are all items. */
export type RefKind = "entity" | "item" | "door" | "creature" | "table" | "item_table" | "room_template" | "ability" | "asset" | "currency";

export interface RefSite {
  file: string;
  path: Segment[];
  ref: string;
  kind: RefKind;
  check: Check;
  /** Why an `item_table` must hold items, for messages. */
  use?: string;
  /** Replaces the ref with its qualified form in the data being compiled. */
  set?: (qualified: string) => void;
}

export interface CatalogEntry {
  value: JsonObject;
  /** Where the entry is defined, for diagnostics about its contents. */
  file?: string;
  path?: Segment[];
}

/** Everything refs can name, keyed by qualified ref `namespace:key`. */
export interface Catalog {
  namespaces: string[];
  entities: Map<string, CatalogEntry>;
  tables: Map<string, CatalogEntry & { entries: JsonObject[] }>;
  rooms: Map<string, CatalogEntry>;
  abilities: Map<string, CatalogEntry>;
  assets: Map<string, CatalogEntry>;
  currencies: Set<string>;
}

export function emptyCatalog(namespaces: string[]): Catalog {
  return { namespaces, entities: new Map(), tables: new Map(), rooms: new Map(), abilities: new Map(), assets: new Map(), currencies: new Set() };
}

export function qualify(ref: string, namespace: string): string {
  return ref.includes(":") ? ref : `${namespace}:${ref}`;
}

export const BUILTIN_CONDITIONS = ["incapacitated", "hidden"];

const article = (word: string): string => `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;

const KIND_LABEL: Readonly<Record<RefKind, string>> = {
  entity: "an entity template",
  item: "an item template",
  door: "a door template",
  creature: "a creature template",
  table: "a table",
  item_table: "a table",
  room_template: "a room template",
  ability: "an ability",
  asset: "an asset",
  currency: "a currency",
};

/**
 * Resolves every site against the catalog: unqualified refs in `namespace`, and only namespaces
 * the catalog holds. Missing refs read `unknown ref 'x'` (adventure-packs.md, "Compilation").
 */
export function resolveSites(sites: readonly RefSite[], catalog: Catalog, namespace: string, outside: (ref: string) => string, out: Diagnostics): void {
  for (const site of sites) {
    const q = qualify(site.ref, namespace);
    const ns = q.slice(0, q.indexOf(":"));
    if (!catalog.namespaces.includes(ns)) {
      out.add(site.file, site.path, outside(site.ref), site.check);
      continue;
    }
    const unknown = () => out.add(site.file, site.path, `unknown ref '${site.ref}'`, site.check);
    const wrongKind = (actual: string) => out.add(site.file, site.path, `'${site.ref}' is ${article(actual)} template, not ${KIND_LABEL[site.kind]}`, site.check);
    switch (site.kind) {
      case "entity":
        if (!catalog.entities.has(q)) unknown();
        break;
      case "item":
      case "door":
      case "creature": {
        const e = catalog.entities.get(q);
        if (!e) unknown();
        else if (e.value.kind !== site.kind) wrongKind(String(e.value.kind));
        break;
      }
      case "table":
      case "item_table": {
        const table = catalog.tables.get(q);
        if (q.endsWith(":room_labels")) {
          out.add(site.file, site.path, "'room_labels' holds labels, not templates", site.check);
          break;
        }
        if (!table) {
          unknown();
          break;
        }
        if (site.kind === "item_table") {
          table.entries.forEach((e, i) => {
            const target = catalog.entities.get(qualify(e.ref as string, ns));
            if (target && target.value.kind !== "item") {
              out.add(table.file ?? site.file, [...(table.path ?? []), i, "ref"], `'${String(e.ref)}' is ${article(String(target.value.kind))} template; table '${q.slice(ns.length + 1)}' supplies items to ${site.use}`, "ref");
            }
          });
        }
        break;
      }
      case "room_template":
        if (!catalog.rooms.has(q)) unknown();
        break;
      case "ability":
        if (!catalog.abilities.has(q)) unknown();
        break;
      case "asset":
        if (!catalog.assets.has(q)) unknown();
        break;
      case "currency":
        if (!catalog.currencies.has(q)) unknown();
        break;
    }
  }
}

/** Rewrites every site with its qualified ref. */
export function qualifySites(sites: readonly RefSite[], namespace: string): void {
  for (const site of sites) site.set?.(qualify(site.ref, namespace));
}

export interface ContentContext {
  out: Diagnostics;
  sites: RefSite[];
  bound: BoundSystem | undefined;
  /** The language visitor for effects and requirements in `file`. */
  visitor: (file: string) => Visitor;
  /** `namespace` of the pack, for `art` kind lookups. */
  namespace: string;
  catalog: Catalog;
}

/** Pushes the sites of an `art` list. */
export function artSites(ctx: ContentContext, file: string, value: JsonObject, path: Segment[]): void {
  if (!Array.isArray(value.art)) return;
  const list = value.art as string[];
  list.forEach((ref, i) => ctx.sites.push({ file, path: [...path, "art", i], ref, kind: "asset", check: "art", set: (q) => (list[i] = q) }));
}

/** Checks that no `art` list holds two assets of one kind. */
export function checkArtKinds(ctx: ContentContext, file: string, value: JsonObject, path: Segment[]): void {
  if (!Array.isArray(value.art)) return;
  checkArtList(value.art as string[], (ref) => ctx.catalog.assets.get(qualify(ref, ctx.namespace))?.value.kind as never, file, [...path, "art"], ctx.out);
}

/** The checks for one entity template, wherever it is defined. */
export function checkEntity(ctx: ContentContext, key: string, file: string, value: JsonObject): void {
  const { out, sites, bound } = ctx;
  const kind = value.kind as string;
  const visit = ctx.visitor(file);
  artSites(ctx, file, value, [key]);
  walkVerbs(value.verbs, [key, "verbs"], visit);
  // SPEC_ISSUES.md#container-locks: containers take `lock`, as engine.md and the schema state.
  walkRequirement(value.lock, [key, "lock"], visit);
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
    if (isObject(value.use)) walkEffects(value.use.effects, [key, "use", "effects"], visit);
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

/**
 * The parts of the effect and requirement languages shared by every pack: content refs, declared
 * damage types and conditions, and check specifications. `extra` adds pack-specific visits.
 */
export function contentVisitor(
  ctx: Omit<ContentContext, "visitor">,
  file: string,
  declared: { damageTypes: ReadonlySet<string>; conditions: ReadonlySet<string> },
  extra: Visitor = {},
): Visitor {
  const { out, sites, bound } = ctx;
  return {
    requirement(form, args, path, node) {
      if (form === "has_item" && typeof args === "string") {
        sites.push({ file, path: [...path, "has_item"], ref: args, kind: "item", check: "ref", set: (q) => (node.has_item = q) });
      }
      if (form === "check" && bound) checkStats(bound, "check", args, file, [...path, "check"], out);
      extra.requirement?.(form, args, path, node);
    },
    effect(name, args, path) {
      if ((name === "give_item" || name === "remove_item" || name === "drop_item") && typeof args.ref === "string") {
        sites.push({ file, path: [...path, "ref"], ref: args.ref, kind: "item", check: "ref", set: (q) => (args.ref = q) });
      }
      if (name === "spawn" && typeof args.ref === "string") {
        sites.push({ file, path: [...path, "ref"], ref: args.ref, kind: "entity", check: "ref", set: (q) => (args.ref = q) });
      }
      if (name === "damage" && typeof args.type === "string" && !declared.damageTypes.has(args.type)) {
        out.add(file, [...path, "type"], `damage type '${args.type}' is not declared in damage_types`, "declared");
      }
      if ((name === "apply_condition" || name === "remove_condition") && typeof args.condition === "string" && !declared.conditions.has(args.condition)) {
        out.add(file, [...path, "condition"], `condition '${args.condition}' is not declared`, "declared");
      }
      extra.effect?.(name, args, path);
    },
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

export type { Json };
