// The server's Supabase client and the store over it. Server-only: it uses the service role key, which
// bypasses row-level security and must never reach a browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Store, type Rpc } from "../store";
import { setting } from "./env";

let client: SupabaseClient | undefined;

/** The service-role client, created on first use. */
export function serviceClient(): SupabaseClient {
  client ??= createClient(setting("supabaseUrl"), setting("supabaseServiceRoleKey"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Store functions called through PostgREST `rpc`; errors keep Postgres's code, such as CD409. */
export function supabaseRpc(supabase: SupabaseClient): Rpc {
  return {
    async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code });
      return data as T;
    },
  };
}

let store: Store | undefined;

export function serverStore(): Store {
  store ??= new Store(supabaseRpc(serviceClient()));
  return store;
}
