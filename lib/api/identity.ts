// Clerk users as User records (app-flow.md, Stack constraints: a Clerk webhook creates and updates the
// User row; records reference the Clerk user id).

export interface ClerkUser {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string }[];
  legal_accepted_at: number | null;
}

export interface Identity {
  id: string;
  email: string;
  display_name: string;
  terms_accepted_at: string | null;
}

/** The user's primary email, and a display name of 1–40 characters: username, full name, or email name. */
export function identityOf(u: ClerkUser): Identity | undefined {
  const email = (u.email_addresses.find((e) => e.id === u.primary_email_address_id) ?? u.email_addresses[0])?.email_address;
  if (!email) return undefined;
  const full = [u.first_name, u.last_name].filter((p) => p && p.trim() !== "").join(" ").trim();
  const name = (u.username?.trim() || full || email.split("@")[0] || "Player").slice(0, 40);
  return { id: u.id, email, display_name: name, terms_accepted_at: u.legal_accepted_at === null ? null : new Date(u.legal_accepted_at).toISOString() };
}
