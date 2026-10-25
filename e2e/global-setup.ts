// Before the tests: a Clerk testing token (so sign-in skips bot protection), and the two test users,
// created on the development instance through Clerk's Backend API when they do not exist yet.
import { clerkSetup } from "@clerk/testing/playwright";
import { USERS } from "./users";

const API = "https://api.clerk.com/v1";

export default async function globalSetup() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set: put the Clerk development keys in .env.local");
  if (!secretKey.startsWith("sk_test_")) throw new Error("the end-to-end tests run only against a Clerk development instance (sk_test_ keys)");
  await clerkSetup({ publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, secretKey });
  const headers = { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" };
  for (const [name, email] of Object.entries(USERS)) {
    const found = await fetch(`${API}/users?email_address=${encodeURIComponent(email)}`, { headers });
    if (!found.ok) throw new Error(`Clerk user lookup failed: ${found.status} ${await found.text()}`);
    if (((await found.json()) as unknown[]).length > 0) continue;
    const made = await fetch(`${API}/users`, { method: "POST", headers, body: JSON.stringify({ email_address: [email], first_name: "E2E", last_name: name.toUpperCase(), skip_password_requirement: true }) });
    if (!made.ok) throw new Error(`Clerk user creation failed: ${made.status} ${await made.text()}`);
  }
}
