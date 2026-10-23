// Users (api.md, Users: get_me, accept_terms; Conventions: the terms gate and closing accounts).

import type { Store, UserRecord } from "../store";
import { ApiError } from "./errors";
import { TERMS_VERSION } from "./terms";

/** The public shape of a user for themself (api.md, User). */
export function userView(u: UserRecord) {
  return { id: u.id, email: u.email, display_name: u.display_name, timezone: u.timezone, reminders: u.reminders, created_at: u.created_at, terms_current: termsCurrent(u) };
}

export function termsCurrent(u: UserRecord): boolean {
  return u.terms_accepted_at !== null && u.terms_version === TERMS_VERSION;
}

/**
 * The caller's user record, for any operation. Every operation except get_me, accept_terms, and logout
 * fails with forbidden until the current terms are accepted; a closing account may call only get_me,
 * restore_account, export_my_data, and logout.
 */
export async function caller(store: Store, userId: string | null, operation: string): Promise<UserRecord> {
  if (userId === null) throw new ApiError("unauthenticated", "sign in first");
  const user = await store.getUser(userId);
  if (!user || user.status === "deleted") throw new ApiError("unauthenticated", "the account does not exist");
  if (user.status === "closing" && !["get_me", "restore_account", "export_my_data", "logout"].includes(operation)) {
    throw new ApiError("forbidden", "the account is being deleted");
  }
  if (!termsCurrent(user) && !["get_me", "accept_terms", "logout"].includes(operation)) {
    throw new ApiError("forbidden", "accept the current Terms of Service and Privacy Policy first");
  }
  return user;
}

export async function getMe(store: Store, userId: string | null) {
  const user = await caller(store, userId, "get_me");
  const characters = await store.listCharacters(user.id, { limit: 100 });
  return { user: userView(user), character_ids: characters.map((c) => c.id), active_campaign_ids: [] as string[], authored_campaign_ids: [] as string[] };
}

export async function acceptTerms(store: Store, userId: string | null, version: unknown) {
  const user = await caller(store, userId, "accept_terms");
  if (version !== TERMS_VERSION) throw new ApiError("invalid_request", "version is not the current terms version");
  return userView((await store.acceptTerms(user.id, TERMS_VERSION))!);
}
