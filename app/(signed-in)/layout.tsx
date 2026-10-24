// Every route in this group requires a signed-in user (app-flow.md, "Route map"; Redirect rules):
// signed-out users go to /sign-in?redirect_url=<route>, and Clerk returns them there after sign-in.
import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { demoMode } from "@/lib/server/demo";

export default async function SignedInLayout({ children }: { children: ReactNode }) {
  if (!demoMode()) await auth.protect();
  return children;
}
