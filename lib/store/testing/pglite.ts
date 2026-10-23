// An in-process Postgres (PGlite) with every migration applied, for store tests.

import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../index";
import { migrations } from "../migrations";

export async function testDb(): Promise<Db & { close: () => Promise<void> }> {
  const pg = new PGlite();
  for (const m of migrations()) await pg.exec(m.sql);
  return {
    query: async <T,>(text: string, params?: unknown[]) => {
      const r = await pg.query<T>(text, params);
      return { rows: r.rows };
    },
    close: () => pg.close(),
  };
}
