// An in-process Postgres (PGlite) with every migration applied, for store tests.

import { PGlite, type Transaction } from "@electric-sql/pglite";
import type { Db } from "../index";
import { migrate } from "../migrate";
import { migrations } from "../migrations";

type Client = PGlite | Transaction;

function wrap(pg: Client): Db {
  return {
    query: async <T,>(text: string, params?: unknown[]) => ({ rows: (await pg.query<T>(text, params)).rows }),
    exec: async (script: string) => {
      await pg.exec(script);
    },
    transaction: async <T,>(fn: (tx: Db) => Promise<T>) => ("transaction" in pg ? (pg as PGlite).transaction((tx) => fn(wrap(tx))) : fn(wrap(pg))),
  };
}

/** A fresh database; `migrated: false` leaves it empty, for migration tests. */
export async function testDb(options: { migrated?: boolean } = {}): Promise<Db & { close: () => Promise<void> }> {
  const pg = new PGlite();
  const db = wrap(pg);
  if (options.migrated !== false) await migrate(db, migrations());
  return { ...db, close: () => pg.close() };
}
