// The signed-in user's id: Clerk's, or the demo user's in demo mode (lib/server/demo.ts).
import { auth } from "@clerk/nextjs/server";
import { DEMO_USER, demoMode } from "./demo";

export async function signedInId(): Promise<string | null> {
  if (demoMode()) return DEMO_USER;
  return (await auth()).userId;
}
