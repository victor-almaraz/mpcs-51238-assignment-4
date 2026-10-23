// The scheduler cron job (app-flow.md, Scheduled jobs). Vercel Cron calls it with
// `Authorization: Bearer $CRON_SECRET`; any other caller is refused.
import { runScheduler } from "@/lib/scheduler/run";
import { notifier } from "@/lib/notifier";
import { serverDeps } from "@/lib/server/coordinator";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const deps = serverDeps();
  return Response.json(await runScheduler({ ...deps, defer: undefined }, notifier(deps.broadcast)));
}
