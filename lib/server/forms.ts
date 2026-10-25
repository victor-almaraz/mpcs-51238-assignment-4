// Helpers for server actions: run an operation as the session user, and report its error to the form.
import { ApiError } from "../api/errors";
import { RATE_LIMIT } from "../api/limits";
import { sessionUser } from "./session";
import { serverStore } from "./supabase";

export type FormState = { error: string | null };

/**
 * Runs `fn` as the session user; an ApiError becomes the form's error message. Each call counts against
 * the user's request limit, shared with the HTTP binding (api.md, Rate limits), except `read` calls: the
 * play page refreshes its view and history after every commit, which a busy table would otherwise spend.
 */
export async function attempt<T>(fn: (userId: string | null) => Promise<T>, options: { read?: boolean } = {}): Promise<{ ok: T } | { error: string }> {
  const user = await sessionUser();
  try {
    if (user && !options.read) {
      const wait = await serverStore().rateHit(user.id, "api", RATE_LIMIT.window_seconds, RATE_LIMIT.limit);
      if (wait > 0) throw new ApiError("rate_limited", `too many requests; try again in ${Math.ceil(wait / 1000)} seconds`);
    }
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
