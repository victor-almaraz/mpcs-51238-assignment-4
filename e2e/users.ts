// The two Clerk test users of the end-to-end tests. `+clerk_test` addresses are Clerk's test emails:
// they receive no mail, and a development instance accepts them without verification.
export const USERS = {
  a: "cadmium-e2e-a+clerk_test@example.com",
  b: "cadmium-e2e-b+clerk_test@example.com",
} as const;
