// Health check: whether the server is configured and each migration's functions are reachable. Anyone
// gets the overall status; the operator, with `Authorization: Bearer $CRON_SECRET`, gets each setting's
// and each migration's state. Reports states only, never values or error details.
import { hasCronSecret } from "@/lib/server/cron";
import { configured } from "@/lib/server/env";
import { serviceClient, supabaseRpc } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** One read-only function per migration, called with ids that match nothing. */
const PROBES: [migration: string, fn: string, args: Record<string, unknown>][] = [
  ["20261027000000_access", "cadmium_health", {}],
  ["20261027000100_users", "cadmium_get_user", { p_id: "health" }],
  ["20261027000200_bundles", "cadmium_get_bundle", { p_kind: "setting", p_id: "health", p_version: "0.0.0" }],
  ["20261027000300_campaigns", "cadmium_campaign", { p_id: "health" }],
  ["20261027000400_characters", "cadmium_character_played", { p_id: "health" }],
  ["20261027000500_play", "cadmium_deadline", { p_id: "health" }],
  ["20261027000600_schedules", "cadmium_get_session", { p_id: "health" }],
  ["20261027000700_drafts", "cadmium_get_draft", { p_id: "health" }],
  ["20261027000800_assets", "cadmium_get_asset", { p_hash: "health" }],
  ["20261027000900_accounts", "cadmium_list_push", { p_user: "health" }],
  ["20261027001000_operations", "cadmium_is_operator", { p_id: "health" }],
  ["20261027001100_realtime", "realtime_may_receive", { p_topic: "health" }],
  ["20261028000000_sandbox", "cadmium_sandbox", { p_id: "health" }],
];

export async function GET(request: Request) {
  // The operator, presenting the cron secret, sees the details.
  const detailed = hasCronSecret(request);
  const settings = { ...configured(), webPush: !!process.env.VAPID_PUBLIC_KEY?.trim() && !!process.env.VAPID_PRIVATE_KEY?.trim() };
  if (!settings.supabaseUrl || !settings.supabaseServiceRoleKey) {
    return Response.json(detailed ? { status: "unconfigured", database: "unconfigured", settings } : { status: "unconfigured" }, { status: 503 });
  }
  const rpc = supabaseRpc(serviceClient());
  const probed = await Promise.all(
    PROBES.map(async ([name, fn, args]): Promise<[string, "applied" | "missing" | "error"]> => {
      try {
        await rpc.call(fn, args);
        return [name, "applied"];
      } catch (e) {
        // PGRST202: PostgREST found no such function, so the database answered but the migration is missing.
        const code = (e as { code?: string }).code;
        if (code !== "PGRST202") console.error(`health ${fn}:`, e);
        return [name, code === "PGRST202" ? "missing" : "error"];
      }
    }),
  );
  const migrations = Object.fromEntries(probed);
  const all = Object.values(migrations).every((m) => m === "applied");
  const status = all ? "ok" : "incomplete";
  return Response.json(detailed ? { status, database: "ok", schema: all ? "applied" : "incomplete", migrations, settings } : { status }, { status: all ? 200 : 503 });
}
