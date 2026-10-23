// Rules systems as clients see them (api.md, System; list_systems, get_system_schema).

import { SYSTEM_DATA } from "../bundle/schemas.generated";
import { SYSTEMS, type RulesSystem, type SchemaKind } from "../systems";
import { ApiError } from "./errors";

const PRESENTATION: Readonly<Record<string, { title: string; derived_from: string | null; accepts: string[]; credit: string; modules: Record<string, string> }>> = {
  quest: {
    title: "Quest",
    derived_from: null,
    accepts: ["quest"],
    credit: "Quest by The Adventure Guild, LLC, under CC BY 4.0. Not endorsed by The Adventure Guild.",
    modules: {},
  },
  cadmium: {
    title: "Cadmium",
    derived_from: "quest",
    accepts: ["cadmium", "quest"],
    credit: "Derived from Quest by The Adventure Guild, LLC, under CC BY 4.0. Not endorsed by The Adventure Guild.",
    modules: { armor: "Armor", stash: "Stash" },
  },
};

export function systemOrThrow(id: unknown): RulesSystem {
  const system = typeof id === "string" ? SYSTEMS[id] : undefined;
  if (!system) throw new ApiError("invalid_request", `unknown rules system '${String(id)}'`);
  return system;
}

export function systemView(id: string) {
  const s = SYSTEMS[id]!;
  const p = PRESENTATION[id]!;
  // Rule values not yet checked against the rulebook (systems/README.md, "Data and confirmation").
  const confirm = ((SYSTEM_DATA[id]?.data as { confirm?: string[] } | undefined)?.confirm ?? []).slice();
  return {
    id: s.ID,
    version: s.VERSION,
    title: p.title,
    derived_from: p.derived_from,
    accepts: p.accepts,
    modules: s.MODULES.map((m) => ({ id: m, title: p.modules[m] ?? m })),
    credit: p.credit,
    pending_confirmation: confirm,
  };
}

export function listSystems() {
  return Object.keys(SYSTEMS).sort((a, b) => (a === "cadmium" ? -1 : b === "cadmium" ? 1 : a < b ? -1 : 1)).map(systemView);
}

export function getSystemSchema(id: unknown, kind: unknown, modules: unknown = []) {
  const system = systemOrThrow(id);
  if (!Array.isArray(modules) || !modules.every((m) => typeof m === "string")) throw new ApiError("invalid_request", "modules must be a list of ids");
  if (typeof kind !== "string" || !["character", "creature", "item", "ability", "check", "structure"].includes(kind)) throw new ApiError("invalid_request", `unknown schema kind '${String(kind)}'`);
  try {
    return system.configure(modules).SCHEMAS[kind as SchemaKind];
  } catch {
    throw new ApiError("invalid_request", `${system.ID} has no module among ${modules.join(", ")}`);
  }
}

/** What a creation form offers: the system's roles and how many starting abilities it requires. */
export function creationRules(id: unknown): { roles: string[]; starting_abilities: number } {
  const system = systemOrThrow(id);
  const data = SYSTEM_DATA[system.ID]!.data as { roles: string[]; starting_abilities: number };
  return { roles: data.roles.slice(), starting_abilities: data.starting_abilities };
}

/** The declared systems a campaign of `id` accepts (systems/README.md, Compatibility). */
export function accepted(id: string): string[] {
  return (PRESENTATION[id]?.accepts ?? [id]).slice();
}
