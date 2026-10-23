import { describe, expect, it } from "vitest";
import { identityOf, type ClerkUser } from "./identity";

const base: ClerkUser = {
  id: "user_1",
  username: null,
  first_name: null,
  last_name: null,
  primary_email_address_id: "e2",
  email_addresses: [
    { id: "e1", email_address: "old@example.org" },
    { id: "e2", email_address: "vale.ortiz@example.org" },
  ],
  legal_accepted_at: null,
};

describe("Clerk users as User records", () => {
  it("uses the primary email and, for the name, the username, then the full name, then the email name", () => {
    expect(identityOf(base)).toEqual({ id: "user_1", email: "vale.ortiz@example.org", display_name: "vale.ortiz", terms_accepted_at: null });
    expect(identityOf({ ...base, first_name: "Vale", last_name: "Ortiz" })!.display_name).toBe("Vale Ortiz");
    expect(identityOf({ ...base, first_name: "Vale", username: "valeo" })!.display_name).toBe("valeo");
  });

  it("limits the display name to 40 characters and records Clerk's legal acceptance", () => {
    expect(identityOf({ ...base, username: "x".repeat(60) })!.display_name).toHaveLength(40);
    expect(identityOf({ ...base, legal_accepted_at: Date.UTC(2026, 9, 22) })!.terms_accepted_at).toBe("2026-10-22T00:00:00.000Z");
  });

  it("skips a user without an email", () => {
    expect(identityOf({ ...base, email_addresses: [] })).toBeUndefined();
  });
});
