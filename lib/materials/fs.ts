// Reads a pack directory into the in-memory file map the compiler takes. The only file I/O of
// `lib/materials` besides the command line.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { PackFiles } from "./pack";

export function readPackDir(dir: string): PackFiles {
  const files = new Map<string, Uint8Array>();
  const visit = (path: string) => {
    for (const name of readdirSync(path).sort()) {
      const full = join(path, name);
      if (statSync(full).isDirectory()) visit(full);
      else files.set(relative(dir, full).split(sep).join("/"), readFileSync(full));
    }
  };
  visit(dir);
  return files;
}
