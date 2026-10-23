// The SQL migrations under supabase/migrations, in name order, read from the project root. Node only.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Migration } from "./migrate";

export const MIGRATIONS_DIR = "supabase/migrations";

export function migrations(root = process.cwd()): Migration[] {
  const dir = join(root, MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}
