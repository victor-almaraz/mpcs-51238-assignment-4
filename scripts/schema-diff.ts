// Compares the schema two sets of migrations build, each applied in name order to an empty in-process
// Postgres: tables and columns, constraints, indexes, functions (signature, kind, volatility, return
// type, defaults, access, and body without comments or spacing), triggers, row-level security, table
// access, and policies.
//   pnpm schema:diff OLD_DIR [NEW_DIR]   (NEW_DIR defaults to supabase/migrations)
// Prints each difference and exits 1 when there is any; prints nothing and exits 0 when they match.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const [oldDir, newDir = "supabase/migrations"] = process.argv.slice(2);
if (!oldDir) {
  console.error("usage: pnpm schema:diff OLD_DIR [NEW_DIR]");
  process.exit(2);
}

/** A database built from every .sql file in `dir`, in name order, each in its own transaction. */
async function build(dir: string): Promise<PGlite> {
  const db = new PGlite();
  for (const name of readdirSync(resolve(dir)).filter((n) => n.endsWith(".sql")).sort()) {
    try {
      await db.exec(`begin;\n${readFileSync(join(resolve(dir), name), "utf8")}\ncommit;`);
    } catch (e) {
      console.error(`${dir}/${name}: ${(e as Error).message}`);
      process.exit(2);
    }
  }
  return db;
}

/** SQL without comments, with runs of whitespace collapsed, for comparing function bodies. */
const plain = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();

const QUERIES: Record<string, string> = {
  columns: `select table_name || '.' || column_name || ' ' || udt_name || case when is_nullable = 'NO' then ' not null' else '' end || coalesce(' default ' || column_default, '') as line
              from information_schema.columns where table_schema = 'public' and table_name <> 'cadmium_migrations'`,
  constraints: `select conrelid::regclass::text || ' ' || contype::text || ' ' || pg_get_constraintdef(oid) as line
                  from pg_constraint where connamespace = 'public'::regnamespace and conrelid <> 0`,
  indexes: `select tablename || ' ' || regexp_replace(indexdef, 'INDEX \\S+ ON', 'INDEX ON') as line from pg_indexes where schemaname = 'public'`,
  functions: `select p.oid::regprocedure::text || ' ' || p.prokind::text || ' ' || p.provolatile::text || ' returns ' || pg_get_function_result(p.oid)
                     || coalesce(' defaults ' || pg_get_expr(p.proargdefaults, 0), '') || ' language ' || l.lanname || ' acl ' || coalesce(p.proacl::text, 'default') || ' :: ' || p.prosrc as line
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang where n.nspname = 'public'`,
  triggers: `select tgrelid::regclass::text || ' ' || regexp_replace(pg_get_triggerdef(oid), 'TRIGGER \\S+ ', 'TRIGGER ') as line from pg_trigger where not tgisinternal`,
  security: `select relname || ' rls=' || relrowsecurity || ' force=' || relforcerowsecurity || ' acl ' || coalesce(relacl::text, 'default') as line from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> 'cadmium_migrations'`,
  policies: `select schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '') as line from pg_policies`,
};

async function describe(db: PGlite): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {};
  for (const [kind, sql] of Object.entries(QUERIES)) {
    const { rows } = await db.query<{ line: string }>(sql);
    out[kind] = new Set(rows.map((r) => (kind === "functions" ? plain(r.line) : r.line)));
  }
  return out;
}

const [a, b] = await Promise.all([build(oldDir), build(newDir)]);
const [before, after] = await Promise.all([describe(a), describe(b)]);
let differences = 0;
for (const kind of Object.keys(QUERIES)) {
  for (const line of [...before[kind]!].filter((l) => !after[kind]!.has(l)).sort()) {
    console.log(`- ${kind}: ${line.slice(0, 400)}`);
    differences++;
  }
  for (const line of [...after[kind]!].filter((l) => !before[kind]!.has(l)).sort()) {
    console.log(`+ ${kind}: ${line.slice(0, 400)}`);
    differences++;
  }
}
await Promise.all([a.close(), b.close()]);
process.exit(differences > 0 ? 1 : 0);
