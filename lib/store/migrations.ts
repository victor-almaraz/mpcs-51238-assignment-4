// The SQL migrations under supabase/migrations, in name order: what Supabase applies in production
// and what the test database applies at start. Node only.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

export function migrations(): { name: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(`${DIR}${name}`, "utf8") }));
}
