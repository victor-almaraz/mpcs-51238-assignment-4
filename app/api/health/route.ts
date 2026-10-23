// Health check: whether the server is configured and the database schema is reachable. Reports states
// only, never values or error details.
import { configured } from "@/lib/server/env";
import { serviceClient, supabaseRpc } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = configured();
  if (!settings.supabaseUrl || !settings.supabaseServiceRoleKey) {
    return Response.json({ database: "unconfigured", settings }, { status: 503 });
  }
  try {
    await supabaseRpc(serviceClient()).call("cadmium_health", {});
    return Response.json({ database: "ok", schema: "applied", settings });
  } catch (e) {
    const code = (e as { code?: string }).code;
    // PGRST202: PostgREST found no such function, so the database answered but the schema is not applied.
    if (code === "PGRST202") return Response.json({ database: "ok", schema: "not applied", settings }, { status: 503 });
    console.error("health:", e);
    return Response.json({ database: "error", settings }, { status: 503 });
  }
}
