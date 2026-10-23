// System version ranges (setting-packs.md, manifest `system`: `^X[.Y]`, `~X.Y`, or exact `X.Y.Z`;
// the `versions` pattern of `system_ref` in defs.schema.json).

export type Version = readonly [number, number, number];

const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const RANGE = /^([\^~]?)(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?(?:\.(0|[1-9][0-9]*))?$/;

export function parseVersion(text: string): Version | null {
  const m = VERSION.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Whether `version` satisfies `range`, with npm semantics for the forms the pattern allows:
 * `^1.2` is `>=1.2.0 <2.0.0` (`^0.2` is `>=0.2.0 <0.3.0`), `~1.2` is `>=1.2.0 <1.3.0`, `1.2.3`
 * is exact, and a partial version without an operator matches every version it prefixes.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version);
  const m = RANGE.exec(range);
  if (!v || !m) return false;
  const op = m[1]!;
  const parts = [m[2], m[3], m[4]].filter((p): p is string => p !== undefined).map(Number);
  const low: Version = [parts[0]!, parts[1] ?? 0, parts[2] ?? 0];
  if (compareVersions(v, low) < 0) return false;
  let high: Version;
  if (op === "^") {
    if (low[0] > 0 || parts.length === 1) high = [low[0] + 1, 0, 0];
    else if (low[1] > 0 || parts.length === 2) high = [0, low[1] + 1, 0];
    else high = [0, 0, low[2] + 1];
  } else if (op === "~") {
    high = parts.length === 1 ? [low[0] + 1, 0, 0] : [low[0], low[1] + 1, 0];
  } else if (parts.length === 3) {
    return compareVersions(v, low) === 0;
  } else {
    high = parts.length === 1 ? [low[0] + 1, 0, 0] : [low[0], low[1] + 1, 0];
  }
  return compareVersions(v, high) < 0;
}
