"use client";
// Clerk's client hooks, or stand-ins in demo mode (lib/server/demo.ts), where no Clerk script loads and
// no session exists. `pnpm demo` sets NEXT_PUBLIC_CADMIUM_DEMO, so the choice is fixed per build.
import { useClerk, useSession } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const DEMO = process.env.NEXT_PUBLIC_CADMIUM_DEMO === "1";

type Session = { getToken: () => Promise<string | null> } | null | undefined;

function useNoSession(): { session: Session } {
  return { session: null };
}

function useNoSignOut() {
  const router = useRouter();
  return { signOut: async (_options?: { redirectUrl?: string }) => router.push("/") };
}

/** The Clerk session, for Realtime tokens; null in demo mode, so clients poll. */
export const useClerkSession: () => { session: Session } = DEMO ? useNoSession : (useSession as () => { session: Session });

/** Clerk's sign-out; in demo mode, a return to the demo index. */
export const useClerkSignOut: () => { signOut: (options?: { redirectUrl?: string }) => Promise<unknown> } = DEMO ? useNoSignOut : useClerk;
