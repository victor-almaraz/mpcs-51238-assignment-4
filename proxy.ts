// Clerk middleware (app-flow.md, "Route map"). It authenticates every request; protection lives in the
// pages: app/(signed-in)/layout.tsx sends signed-out users to /sign-in?redirect_url=<original path>.
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    // Every route except Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
