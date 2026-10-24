// The visitor of a public page that acts once signed in (app-flow.md, Route map: /invite/[code],
// /join/[code]): where to send them first, or null when they may act now.
import { signedInId } from "./auth";
import { termsCurrent } from "../api/users";
import { sessionUser } from "./session";

export async function nextStep(path: string): Promise<{ href: string; label: string } | null> {
  const userId = await signedInId();
  if (!userId) return { href: `/sign-in?redirect_url=${encodeURIComponent(path)}`, label: "Sign in to respond" };
  const user = await sessionUser();
  if (!user || !termsCurrent(user)) return { href: `/accept-terms?next=${encodeURIComponent(path)}`, label: "Accept the terms to respond" };
  return null;
}
