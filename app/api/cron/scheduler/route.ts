// The scheduler cron job (app-flow.md, Scheduled jobs). Vercel Cron calls it with
// `Authorization: Bearer $CRON_SECRET`; any other caller is refused.
import { runScheduler } from "@/lib/scheduler/run";
import { notifier } from "@/lib/notifier";
import { serverDeps } from "@/lib/server/coordinator";
import { cronRefusal } from "@/lib/server/cron";
import { webPushFromEnv } from "@/lib/server/push";

export async function GET(request: Request): Promise<Response> {
  const refused = cronRefusal(request);
  if (refused) return refused;
  const deps = serverDeps();
  const summary = await runScheduler({ ...deps, defer: undefined }, notifier(deps.broadcast, webPushFromEnv(deps.store)));
  for (const e of summary.errors) console.error(`scheduler: ${e.step} failed for instance ${e.instance_id}: ${e.message}`);
  return Response.json(summary);
}
