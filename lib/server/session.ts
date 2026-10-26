// The signed-in user, with a User record guaranteed to exist: the Clerk webhook normally creates it, and
// this creates it on first request if the webhook has not arrived yet.
import { currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identityOf, type ClerkUser } from "../api/identity";
import { termsCurrent } from "../api/users";
import type { UserRecord } from "../store";
import { signedInId } from "./auth";
import { serverStore } from "./supabase";

export async function sessionUser(): Promise<UserRecord | undefined> {
  const userId = await signedInId();
  if (!userId) return undefined;
  const store = serverStore();
  const existing = await store.getUser(userId);
  if (existing) return existing;
  const clerk = await currentUser();
  if (!clerk) return undefined;
  const identity = identityOf({
    id: clerk.id,
    username: clerk.username,
    first_name: clerk.firstName,
    last_name: clerk.lastName,
    primary_email_address_id: clerk.primaryEmailAddressId,
    email_addresses: clerk.emailAddresses.map((e) => ({ id: e.id, email_address: e.emailAddress })),
    legal_accepted_at: clerk.legalAcceptedAt ? new Date(clerk.legalAcceptedAt).getTime() : null,
  } satisfies ClerkUser);
  return identity ? store.upsertUser(identity) : undefined;
}

/**
 * The path and query of the page being requested, from the request URL Clerk's middleware passes on
 * (the header its own sign-in redirect reads); null without it, as in demo mode.
 */
async function requestedPath(): Promise<string | null> {
  const raw = (await headers()).get("x-clerk-clerk-url");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.searchParams.delete("_rsc");
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

/**
 * The user for a signed-in page: sends a user who has not accepted the current terms, whose account is
 * closing, or who is suspended to the acceptance page, which says which and what they can still do, and
 * after acceptance returns them to the page they asked for. Pages call this themselves because a layout
 * does not re-render on client navigation.
 */
export async function pageUser(): Promise<UserRecord> {
  const user = await sessionUser();
  // A suspended account can only read and export its own data (api.md, Conventions).
  if (!user || user.status !== "active" || user.suspended_at || !termsCurrent(user)) {
    const path = await requestedPath();
    redirect(path && path !== "/dashboard" && !path.startsWith("/accept-terms") ? `/accept-terms?next=${encodeURIComponent(path)}` : "/accept-terms");
  }
  return user;
}
