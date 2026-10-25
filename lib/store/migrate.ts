// Applies SQL migrations in name order, each in its own transaction, recording them in
// cadmium_migrations. A migration that fails leaves no trace and stops the run.

import type { Db } from "./index";

export interface Migration {
  name: string;
  sql: string;
}

// Like every store table: row-level security on, and nothing granted to Supabase's API roles.
const TRACKING = `create table if not exists cadmium_migrations (name text primary key, applied_at timestamptz not null default now());
alter table cadmium_migrations enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on cadmium_migrations from anon, authenticated; end if;
end $$;`;

/** Migrations not yet applied, in name order. Reads only: it creates nothing. */
export async function pending(db: Db, all: readonly Migration[]): Promise<Migration[]> {
  const { rows: exists } = await db.query<{ t: string | null }>("select to_regclass('cadmium_migrations')::text as t");
  const { rows } = exists[0]?.t ? await db.query<{ name: string }>("select name from cadmium_migrations") : { rows: [] };
  const applied = new Set(rows.map((r) => r.name));
  return [...all].sort((a, b) => (a.name < b.name ? -1 : 1)).filter((m) => !applied.has(m.name));
}

/** Applies every pending migration; returns the names applied. With `dryRun`, applies nothing. */
export async function migrate(db: Db, all: readonly Migration[], options: { dryRun?: boolean } = {}): Promise<string[]> {
  const todo = await pending(db, all);
  if (options.dryRun) return todo.map((m) => m.name);
  if (todo.length > 0) await db.exec(TRACKING);
  for (const m of todo) {
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("insert into cadmium_migrations (name) values ($1)", [m.name]);
    });
  }
  return todo.map((m) => m.name);
}
