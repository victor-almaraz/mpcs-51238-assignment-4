// Every route in this group requires a signed-in user (app-flow.md, "Route map"; Redirect rules):
// signed-out users go to /sign-in?redirect_url=<route>, and Clerk returns them there after sign-in.
import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";

export default async function SignedInLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return children;
}
