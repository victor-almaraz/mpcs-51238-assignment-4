// Compiler diagnostics (spec/README.md, "Compiler interface"): `FILE: PATH: MESSAGE` lines, or
// `{ file, path, message, check }` objects with `--json` and from the library.

export type Segment = string | number;

export interface Diagnostic {
  file: string;
  path: string;
  message: string;
  /** The failed check; see CHECKS. */
  check: Check;
}

// SPEC_ISSUES.md#diagnostic-check-ids: the specification names checks in prose only.
export const CHECKS = {
  file: "A file is readable, parses as JSON-compatible YAML, and belongs to the pack layout",
  duplicate_key: "A key is defined once across the files of a merged directory",
  schema: "A file matches its schema",
  system: "The rules system exists, its version satisfies system.versions, and system.modules are its modules",
  system_stats: "system_stats and check specifications match the configured system's schemas",
  ref: "A ref resolves to a template, table, ability, or asset of the expected kind in the pack's namespace",
  declared: "Damage types, terrain types, and conditions are declared",
  generation: "generation.door and generation.locks name door templates; lock keys are items",
  remains: "remains appears only on templates with system_stats",
  depth: "Depth ranges are ordered",
  light: "A light source's dim radius is at least its bright radius",
  currency: "Currency has a denomination of value 1",
  map: "Map rows have equal length within 64 x 64 and use built-in or legend characters",
  placement: "Placements lie on passable cells inside the map without conflicting occupants",
  art: "Art refs, kinds, files, types, sizes, alt text, and credits",
} as const;

export type Check = keyof typeof CHECKS;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

// SPEC_ISSUES.md#diagnostic-check-ids: the root path is written `.`.
/** `a.b[2]["~"]`; the root is `.`. */
export function formatPath(path: readonly Segment[]): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else if (IDENT.test(seg)) out += out === "" ? seg : `.${seg}`;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out === "" ? "." : out;
}

export function formatDiagnostic(d: Diagnostic): string {
  return `${d.file}: ${d.path}: ${d.message}`;
}

/** Python-style rendering used in messages: `'goon'`, `[9, 0]`, `['a', 'b']`. */
export function show(value: unknown): string {
  if (typeof value === "string") return `'${value}'`;
  if (Array.isArray(value)) return `[${value.map(show).join(", ")}]`;
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Sorts diagnostics by file, then path, then message, so output is stable. */
export function sortDiagnostics(list: Diagnostic[]): Diagnostic[] {
  return [...list].sort(
    (a, b) => cmp(a.file, b.file) || cmp(a.path, b.path) || cmp(a.message, b.message) || cmp(a.check, b.check),
  );
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
