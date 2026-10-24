// Starting over (supabase/reset.sql and `pnpm db:fresh`): the reset removes everything the migrations
// create, and the fresh script rebuilds the same schema whether the database is empty or migrated.

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { freshScript, RESET } from "./fresh";
import { testDb } from "./testing/pglite";

type Db = Awaited<ReturnType<typeof testDb>>;
let db: Db | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function objects(d: Db) {
  const tables = (await d.query<{ t: string }>("select tablename as t from pg_tables where schemaname = 'public' and tablename <> 'cadmium_migrations' order by 1")).rows.map((r) => r.t);
  const functions = (await d.query<{ f: string }>("select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1")).rows.map((r) => r.f);
  return { tables, functions };
}

describe("starting the database over", () => {
  it("the reset leaves no table or function behind", async () => {
    db = await testDb();
    expect((await objects(db)).tables.length).toBeGreaterThan(20);
    await db.exec(readFileSync(RESET, "utf8"));
    expect(await objects(db)).toEqual({ tables: [], functions: [] });
  });

  it("the fresh script builds the migrated schema, from empty or from migrated", async () => {
    const reference = await testDb();
    const want = await objects(reference);
    await reference.close();
    for (const migrated of [false, true]) {
      db = await testDb({ migrated });
      await db.exec(freshScript());
      expect(await objects(db)).toEqual(want);
      await db.close();
      db = undefined;
    }
  });
});
