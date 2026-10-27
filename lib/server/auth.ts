// The signed-in user's id: Clerk's, or in demo mode (lib/server/demo.ts) the demo user, or the seeded
// user that /demo/as chose.
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { DEMO_USER, DEMO_USER_COOKIE, demoMode } from "./demo";

export async function signedInId(): Promise<string | null> {
  if (demoMode()) {
    const chosen = (await cookies()).get(DEMO_USER_COOKIE)?.value;
    return chosen && /^user_[a-z]+$/.test(chosen) ? chosen : DEMO_USER;
  }
  return (await auth()).userId;
}
