// Health check: whether the server is configured and each migration's functions are reachable. Reports
// states only, never values or error details.
import { configured } from "@/lib/server/env";
import { serviceClient, supabaseRpc } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** One read-only function per migration, called with ids that match nothing. */
const PROBES: [migration: string, fn: string, args: Record<string, unknown>][] = [
  ["20261023000100_store_api", "cadmium_health", {}],
  ["20261023000200_users_characters", "cadmium_get_user", { p_id: "health" }],
  ["20261023000300_campaigns", "cadmium_campaign", { p_id: "health" }],
  ["20261023000400_coordinator", "cadmium_deadline", { p_id: "health" }],
  ["20261023000500_inputs", "cadmium_input_processing", { p_instance: "health", p_character: "health", p_seconds: 1 }],
  ["20261023000600_schedules", "cadmium_get_session", { p_id: "health" }],
  ["20261023000700_accounts", "cadmium_list_push", { p_user: "health" }],
  ["20261023000800_operations", "cadmium_is_operator", { p_id: "health" }],
  ["20261023000900_drafts", "cadmium_get_draft", { p_id: "health" }],
  ["20261023001000_assets", "cadmium_get_asset", { p_hash: "health" }],
  ["20261023001100_portraits", "cadmium_asset_meta", { p_hash: "health" }],
];

export async function GET() {
  const settings = configured();
  if (!settings.supabaseUrl || !settings.supabaseServiceRoleKey) {
    return Response.json({ database: "unconfigured", settings }, { status: 503 });
  }
  const rpc = supabaseRpc(serviceClient());
  const migrations: Record<string, "applied" | "missing" | "error"> = {};
  for (const [name, fn, args] of PROBES) {
    try {
      await rpc.call(fn, args);
      migrations[name] = "applied";
    } catch (e) {
      // PGRST202: PostgREST found no such function, so the database answered but the migration is missing.
      const code = (e as { code?: string }).code;
      if (code !== "PGRST202") console.error(`health ${fn}:`, e);
      migrations[name] = code === "PGRST202" ? "missing" : "error";
    }
  }
  const all = Object.values(migrations).every((m) => m === "applied");
  return Response.json({ database: "ok", schema: all ? "applied" : "incomplete", migrations, settings }, { status: all ? 200 : 503 });
}
