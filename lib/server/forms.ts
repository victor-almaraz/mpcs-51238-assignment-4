// Helpers for server actions: run an operation as the session user, and report its error to the form.
import { ApiError } from "../api/errors";
import { sessionUser } from "./session";

export type FormState = { error: string | null };

/** Runs `fn` as the session user; an ApiError becomes the form's error message. */
export async function attempt<T>(fn: (userId: string | null) => Promise<T>): Promise<{ ok: T } | { error: string }> {
  const user = await sessionUser();
  try {
    return { ok: await fn(user?.id ?? null) };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e;
  }
}

/** A same-site path to return to, or the dashboard. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}
