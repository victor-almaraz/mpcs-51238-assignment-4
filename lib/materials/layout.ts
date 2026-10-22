// Pack and adventure directory layouts (spec/README.md, "Pack directory" and "Adventure directory").

export type PackKind = "setting" | "adventure";

export interface LayoutEntry {
  /** Pack-relative path; `*` matches one file name in a merged or one-per-file directory. */
  path: string;
  schema: string;
  required: boolean;
}

export const SETTING_LAYOUT: readonly LayoutEntry[] = [
  { path: "manifest.yaml", schema: "manifest.schema.json", required: true },
  { path: "conditions.yaml", schema: "conditions.schema.json", required: false },
  { path: "abilities/*.yaml", schema: "abilities.schema.json", required: false },
  { path: "entities/*.yaml", schema: "entities.schema.json", required: true },
  { path: "rooms/*.yaml", schema: "rooms.schema.json", required: false },
  { path: "tables.yaml", schema: "tables.schema.json", required: true },
  { path: "parser.yaml", schema: "parser.schema.json", required: false },
  { path: "assets.yaml", schema: "assets.schema.json", required: false },
];

export const ADVENTURE_LAYOUT: readonly LayoutEntry[] = [
  { path: "adventure.yaml", schema: "adventure.schema.json", required: true },
  { path: "flags.yaml", schema: "flags.schema.json", required: false },
  { path: "plot/*.yaml", schema: "arc.schema.json", required: true },
  { path: "locations/*.yaml", schema: "location.schema.json", required: true },
  { path: "npcs/*.yaml", schema: "npc.schema.json", required: false },
  { path: "entities/*.yaml", schema: "entities.schema.json", required: false },
  { path: "assets.yaml", schema: "assets.schema.json", required: false },
];

export function layout(kind: PackKind): readonly LayoutEntry[] {
  return kind === "setting" ? SETTING_LAYOUT : ADVENTURE_LAYOUT;
}

function matches(pattern: string, path: string): boolean {
  const [dir, name] = pattern.includes("/") ? pattern.split("/") : ["", pattern];
  const [pdir, pname] = path.includes("/") ? path.split("/") : ["", path];
  if (dir !== pdir || pname === undefined || path.split("/").length > 2) return false;
  return name === "*.yaml" ? /^[^/]+\.yaml$/.test(pname) : name === pname;
}

/** The layout entry for a pack-relative path, or undefined when the path is not part of the layout. */
export function layoutEntry(kind: PackKind, path: string): LayoutEntry | undefined {
  return layout(kind).find((e) => matches(e.path, path));
}

/** The layout entry for a path in either kind of pack; `entities/` and `assets.yaml` share a schema in both. */
export function anyLayoutEntry(path: string): LayoutEntry | undefined {
  return layoutEntry("setting", path) ?? layoutEntry("adventure", path);
}
