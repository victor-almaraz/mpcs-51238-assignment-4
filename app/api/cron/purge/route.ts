// The daily purge job (app-flow.md, Scheduled jobs; data-model.md, Deletion): erases accounts and
// records deleted more than 90 days ago, skipping held ones, and the erased users at Clerk.
import { clerkClient } from "@clerk/nextjs/server";
import { runPurge } from "@/lib/api/account";
import { shutdownPhase } from "@/lib/ops/shutdown";
import { serverStore } from "@/lib/server/supabase";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const clerk = await clerkClient();
  // 90 days after shutdown every record that is not held is erased; the operator then deletes the Clerk application.
  if (shutdownPhase(process.env.SHUTDOWN_AT, new Date()).phase === "purge") return Response.json({ shutdown: await serverStore().shutdownPurge() });
  return Response.json(await runPurge(serverStore(), async (id) => void (await clerk.users.deleteUser(id))));
}
