// The signed-in user, with a User record guaranteed to exist: the Clerk webhook normally creates it, and
// this creates it on first request if the webhook has not arrived yet.
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { identityOf, type ClerkUser } from "../api/identity";
import { termsCurrent } from "../api/users";
import type { UserRecord } from "../store";
import { serverStore } from "./supabase";

export async function sessionUser(): Promise<UserRecord | undefined> {
  const { userId } = await auth();
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
 * The user for a signed-in page: sends a user who has not accepted the current terms to the acceptance
 * page. Pages call this themselves because a layout does not re-render on client navigation.
 */
export async function pageUser(): Promise<UserRecord> {
  const user = await sessionUser();
  if (!user || user.status !== "active" || !termsCurrent(user)) redirect("/accept-terms");
  return user;
}
