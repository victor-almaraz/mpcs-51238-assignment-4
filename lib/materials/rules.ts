// Rules-system checks (spec/README.md, "Checks"): the system exists, its installed version
// satisfies `system.versions`, `system.modules` are its modules, and `system_stats` and check
// specifications match the system configured with those modules.

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import { SYSTEMS, type RulesSystem, type SchemaKind } from "../systems";
import type { Diagnostics } from "./pack";
import type { Segment } from "./diagnostics";
import { Explainer } from "./explain";
import { satisfies } from "./semver";
import type { JsonObject } from "./walk";

export interface BoundSystem {
  system: RulesSystem;
  /** The installed version validated against. */
  resolved: string;
  modules: string[];
}

/** Resolves the manifest's `system` binding, reporting at `path` in `file`. */
export function bindSystem(binding: JsonObject, file: string, path: Segment[], out: Diagnostics): BoundSystem | undefined {
  const id = binding.id as string;
  const versions = binding.versions as string;
  const modules = (binding.modules as string[] | undefined) ?? [];
  const base = SYSTEMS[id];
  if (!base) {
    out.add(file, [...path, "id"], `rules system '${id}' is not installed; installed: ${Object.keys(SYSTEMS).join(", ")}`, "system");
    return undefined;
  }
  if (!satisfies(base.VERSION, versions)) {
    out.add(file, [...path, "versions"], `installed ${id} ${base.VERSION} does not satisfy '${versions}'`, "system");
    return undefined;
  }
  const unknown = modules.filter((m) => !base.MODULES.includes(m));
  if (unknown.length > 0) {
    const offered = base.MODULES.length > 0 ? base.MODULES.map((m) => `'${m}'`).join(", ") : "none";
    out.add(file, [...path, "modules"], `'${unknown[0]}' is not a module of ${id}; modules: ${offered}`, "system");
    return undefined;
  }
  return { system: base.configure(modules), resolved: base.VERSION, modules };
}

const validators = new Map<string, Map<SchemaKind, ValidateFunction>>();

function validatorFor(system: RulesSystem, kind: SchemaKind): ValidateFunction {
  const key = `${system.ID}@${system.VERSION}:${(system as { ENABLED?: string[] }).ENABLED?.join(",") ?? ""}`;
  let byKind = validators.get(key);
  if (!byKind) {
    // One registry per configuration: configured schemas keep their $id (systems/README.md, "Modules").
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
    byKind = new Map();
    for (const k of ["character", "creature", "item", "ability", "check", "structure"] as const) byKind.set(k, ajv.compile(system.SCHEMAS[k]!));
    validators.set(key, byKind);
  }
  return byKind.get(kind)!;
}

/** Validates `value` against the system's schema for `kind`; messages name the system and kind. */
export function checkStats(
  bound: BoundSystem,
  kind: SchemaKind,
  value: unknown,
  file: string,
  path: Segment[],
  out: Diagnostics,
): void {
  const validate = validatorFor(bound.system, kind);
  if (validate(value)) return;
  const root = bound.system.SCHEMAS[kind]! as { $id: string };
  const explainer = new Explainer((id) => (id === root.$id ? (root as never) : undefined));
  const issues = explainer.explain({ id: root.$id, root: root as never }, value);
  const prefix = `${bound.system.ID} ${kind}`;
  if (issues.length === 0) {
    for (const e of validate.errors ?? []) out.add(file, path, `${prefix}: ${e.instancePath || "."} ${e.message ?? "is invalid"}`, "system_stats");
    return;
  }
  for (const issue of issues) out.add(file, [...path, ...issue.path], `${prefix}: ${issue.message}`, "system_stats");
}
