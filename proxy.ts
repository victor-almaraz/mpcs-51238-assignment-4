// Clerk middleware (app-flow.md, "Route map"). It authenticates every request; protection lives in the
// pages: app/(signed-in)/layout.tsx sends signed-out users to /sign-in?redirect_url=<original path>.
// After the shutdown time (SHUTDOWN_AT), every page but the legal ones shows the closed notice, and
// sign-in stops (app-flow.md, Scheduled jobs: Shutdown).
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { demoMode } from "./lib/server/demo";
import { openWhenClosed, shutdownPhase } from "./lib/ops/shutdown";

function closed(request: NextRequest): NextResponse | undefined {
  const phase = shutdownPhase(process.env.SHUTDOWN_AT, new Date()).phase;
  if ((phase === "closed" || phase === "purge") && !openWhenClosed(request.nextUrl.pathname)) {
    return NextResponse.rewrite(new URL("/closed", request.url), { status: 503 });
  }
}

// Demo mode (lib/server/demo.ts) runs without Clerk.
export default demoMode() ? (request: NextRequest) => closed(request) : clerkMiddleware((_auth, request) => closed(request), { signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    // Every route except Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
