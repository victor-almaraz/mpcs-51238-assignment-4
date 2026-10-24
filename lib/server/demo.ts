// Demo mode, for screenshots and design review on a developer's machine: with CADMIUM_DEMO=1 under
// `next dev`, every request is signed in as the demo user, the store is an in-memory Postgres seeded by
// lib/demo/seed.ts, and nothing reaches Supabase Realtime or Groq. It never turns on in a production
// build or on Vercel. Clerk still loads (its keys come from .env.local), but no Clerk session is used.

export const DEMO_USER = "user_demo";

export function demoMode(): boolean {
  return process.env.CADMIUM_DEMO === "1" && process.env.NODE_ENV === "development" && !process.env.VERCEL;
}
