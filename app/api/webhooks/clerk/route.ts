// Clerk user sync (app-flow.md, Server boundaries): verifies the webhook signature and upserts the User
// row. The signing secret is CLERK_WEBHOOK_SIGNING_SECRET.
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { identityOf, type ClerkUser } from "@/lib/api/identity";
import { serverStore } from "@/lib/server/supabase";

export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  const store = serverStore();
  if (event.type === "user.created" || event.type === "user.updated") {
    const identity = identityOf(event.data as unknown as ClerkUser);
    if (identity) await store.upsertUser(identity);
  } else if (event.type === "user.deleted" && event.data.id) {
    await store.markUserDeleted(event.data.id);
  }
  return new Response(null, { status: 204 });
}
