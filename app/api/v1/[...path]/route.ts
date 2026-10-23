// The /v1 HTTP binding (api.md, HTTP and WebSocket binding); next.config.ts rewrites /v1/* here.
// Clerk authenticates the bearer token (a Clerk session token) or the session cookie.
import { auth } from "@clerk/nextjs/server";
import { handle } from "@/lib/api/http";
import { serverDeps } from "@/lib/server/coordinator";

async function serve(request: Request): Promise<Response> {
  const { userId } = await auth();
  return handle(request, userId, serverDeps());
}

export const GET = serve;
export const POST = serve;
export const PUT = serve;
export const PATCH = serve;
export const DELETE = serve;
