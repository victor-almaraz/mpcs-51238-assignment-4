// Short ability descriptions that ship beside the application's own packs (materials/<pack>/descriptions.yaml),
// keyed by ref. A pack's namespace comes from materials/<pack>/pack/manifest.yaml, or, for a directory without
// a pack, from the specification's example of that name (docs/spec/spec/examples/<pack>/manifest.yaml).
// Packs have no description field, so these reach only the creation form and the sheet.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const MATERIALS = join(process.cwd(), "materials");
const EXAMPLES = join(process.cwd(), "docs/spec/spec/examples");

let cache: Map<string, string> | undefined;

export function abilityDescriptions(): Map<string, string> {
  if (cache) return cache;
  cache = new Map();
  for (const pack of readdirSync(MATERIALS)) {
    let text: string;
    try {
      text = readFileSync(join(MATERIALS, pack, "descriptions.yaml"), "utf8");
    } catch {
      continue; // This pack ships no descriptions.
    }
    const { namespace } = parse(readFileSync(manifestOf(pack), "utf8"), { version: "1.2" }) as { namespace: string };
    for (const [key, line] of Object.entries(parse(text, { version: "1.2" }) as Record<string, string>)) cache.set(`${namespace}:${key}`, line);
  }
  return cache;
}

function manifestOf(pack: string): string {
  const own = join(MATERIALS, pack, "pack", "manifest.yaml");
  return existsSync(own) ? own : join(EXAMPLES, pack, "manifest.yaml");
}

/** `options` with each ability's description, where one ships. */
export function withDescriptions<T extends { ref: string }>(options: T[]): (T & { description?: string })[] {
  const d = abilityDescriptions();
  return options.map((o) => (d.has(o.ref) ? { ...o, description: d.get(o.ref)! } : o));
}
