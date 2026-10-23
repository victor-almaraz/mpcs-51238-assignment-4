// An Rpc over a SQL connection: `select fn(p_a => $1, ...)`. Used by tests with PGlite; production
// calls the same functions through supabase-js (lib/server/supabase.ts).

import type { Db, Rpc } from "./index";

const FUNCTION = /^cadmium_[a-z_]+$/;
const ARGUMENT = /^p_[a-z_]+$/;

export function sqlRpc(db: Db): Rpc {
  return {
    async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      // Names cannot be parameters, so they are checked before they are written into the statement.
      if (!FUNCTION.test(fn)) throw new Error(`invalid store function name '${fn}'`);
      const names = Object.keys(args);
      for (const n of names) if (!ARGUMENT.test(n)) throw new Error(`invalid argument name '${n}'`);
      const params = names.map((n) => {
        const v = args[n];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      const call = `select ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`;
      const { rows } = await db.query<{ r: T }>(call, params);
      return rows[0]!.r;
    },
  };
}
