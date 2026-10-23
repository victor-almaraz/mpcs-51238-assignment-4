// The Instance Coordinator's dependencies on the server: the store, Supabase Realtime, the clock, and
// round timeouts from the environment (architecture.md, Round timeouts: deployment configuration).
import { supabaseBroadcaster } from "../broadcast";
import { DEFAULT_TIMEOUTS, type Deps } from "../coordinator/instance";
import { setting } from "./env";
import { serverStore } from "./supabase";

function seconds(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? fallback : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

let deps: Deps | undefined;

export function serverDeps(): Deps {
  deps ??= {
    store: serverStore(),
    broadcast: supabaseBroadcaster(setting("supabaseUrl"), setting("supabaseServiceRoleKey")),
    now: () => new Date(),
    timeouts: {
      exploration: seconds("EXPLORATION_ROUND_TIMEOUT", DEFAULT_TIMEOUTS.exploration),
      combat: seconds("COMBAT_TURN_TIMEOUT", DEFAULT_TIMEOUTS.combat),
    },
    warn: (m) => console.warn(`broadcast: ${m}`),
  };
  return deps;
}
