// The /v1 HTTP binding (api.md, HTTP and WebSocket binding); next.config.ts rewrites /v1/* here.
// Clerk authenticates the bearer token (a Clerk session token) or the session cookie.
import { signedInId } from "@/lib/server/auth";
import { handle } from "@/lib/api/http";
import { serverDeps } from "@/lib/server/coordinator";

async function serve(request: Request): Promise<Response> {
  return handle(request, await signedInId(), serverDeps());
}

export const GET = serve;
export const POST = serve;
export const PUT = serve;
export const PATCH = serve;
export const DELETE = serve;
