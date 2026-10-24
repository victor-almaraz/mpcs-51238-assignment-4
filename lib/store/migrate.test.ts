import { afterEach, describe, expect, it } from "vitest";
import { migrate, pending } from "./migrate";
import { migrations } from "./migrations";
import { testDb } from "./testing/pglite";

let db: Awaited<ReturnType<typeof testDb>> | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

const tables = async () =>
  (await db!.query<{ t: string }>("select tablename as t from pg_tables where schemaname = 'public' order by 1")).rows.map((r) => r.t);

describe("migrations", () => {
  it("lists every migration as pending on an empty database, creating nothing", async () => {
    db = await testDb({ migrated: false });
    expect((await pending(db, migrations())).map((m) => m.name)).toEqual(migrations().map((m) => m.name));
    expect(await migrate(db, migrations(), { dryRun: true })).toEqual(migrations().map((m) => m.name));
    expect(await tables()).toEqual([]);
  });

  it("applies pending migrations once, recording each", async () => {
    db = await testDb({ migrated: false });
    const names = migrations().map((m) => m.name);
    expect(await migrate(db, migrations())).toEqual(names);
    expect(await migrate(db, migrations())).toEqual([]);
    expect(await tables()).toEqual(expect.arrayContaining(["bundles", "cadmium_migrations", "commits", "events", "instances"]));
    expect((await db.query<{ name: string }>("select name from cadmium_migrations")).rows.map((r) => r.name)).toEqual(names);
  });

  it("rolls back a failing migration entirely and stops", async () => {
    db = await testDb({ migrated: false });
    const broken = [
      { name: "0001_ok.sql", sql: "create table a (x int);" },
      { name: "0002_bad.sql", sql: "create table b (x int); select * from no_such_table;" },
      { name: "0003_after.sql", sql: "create table c (x int);" },
    ];
    await expect(migrate(db, broken)).rejects.toThrow(/no_such_table/);
    expect(await tables()).toEqual(["a", "cadmium_migrations"]);
    expect((await pending(db, broken)).map((m) => m.name)).toEqual(["0002_bad.sql", "0003_after.sql"]);
  });

  it("lets only the service role call store functions or read store tables, when Supabase's roles exist", async () => {
    db = await testDb({ migrated: false });
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await migrate(db, migrations());
    const { rows: fns } = await db.query<{ f: string }>(
      "select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'cadmium\\_%'",
    );
    expect(fns.length).toBeGreaterThan(10);
    for (const { f } of fns) {
      const { rows } = await db.query<{ anon: boolean; auth: boolean; service: boolean }>(
        "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth, has_function_privilege('service_role', $1, 'execute') as service",
        [f],
      );
      expect(rows[0], f).toEqual({ anon: false, auth: false, service: true });
    }
    for (const table of ["bundles", "instances", "events", "commits", "input_logs", "narrations", "instance_characters", "users", "characters", "campaigns", "campaign_members", "campaign_materials", "invitations", "rate_windows", "scheduled_sessions", "session_exceptions", "rsvps", "scheduler_marks", "push_subscriptions", "operator_log", "material_drafts", "assets"]) {
      const { rows } = await db.query<{ anon: boolean; rls: boolean }>(
        "select has_table_privilege('anon', $1, 'select') as anon, relrowsecurity as rls from pg_class where relname = $1",
        [table],
      );
      expect(rows[0], table).toEqual({ anon: false, rls: true });
    }
  });
});
