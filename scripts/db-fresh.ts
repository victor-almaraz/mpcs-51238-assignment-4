// Writes supabase/fresh.sql (not committed): the reset and every migration in one transaction, to paste
// into the Supabase SQL Editor when the database should start from scratch.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { freshScript } from "../lib/store/fresh";

const out = join(process.cwd(), "supabase/fresh.sql");
writeFileSync(out, freshScript());
console.log(out);
