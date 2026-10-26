// The daily purge job (app-flow.md, Scheduled jobs; data-model.md, Deletion): erases accounts and
// records deleted more than 90 days ago, skipping held ones, and the erased users at Clerk.
import { clerkClient } from "@clerk/nextjs/server";
import { runPurge } from "@/lib/api/account";
import { shutdownPhase } from "@/lib/ops/shutdown";
import { cronRefusal } from "@/lib/server/cron";
import { serverStore } from "@/lib/server/supabase";

export async function GET(request: Request): Promise<Response> {
  const refused = cronRefusal(request);
  if (refused) return refused;
  const store = serverStore();
  const now = new Date();
  // 90 days after shutdown every record that is not held is erased; the operator then deletes the Clerk application.
  if (shutdownPhase(process.env.SHUTDOWN_AT, now).phase === "purge") return Response.json({ shutdown: await store.shutdownPurge() });
  const clerk = await clerkClient();
  const purged = await runPurge(store, async (id) => void (await clerk.users.deleteUser(id)), now);
  for (const e of purged.identity_errors) console.error(`purge: Clerk user ${e.user_id} was not deleted: ${e.message}`);
  return Response.json(purged);
}
