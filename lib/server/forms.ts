// Helpers for server actions: read a form, run an operation as the session user, and report its error to
// the form.
import { ApiError, type ApiErrorCode } from "../api/errors";
import { RATE_LIMIT } from "../api/limits";
import { sentence } from "../text";
import { sessionUser } from "./session";
import { serverStore } from "./supabase";

/** A form's result: the error to show, or on success an optional confirmation such as "Saved." */
export type FormState = { error: string | null; saved?: string };

/** A form field's text; undefined when the field is absent or a file. */
export function str(form: FormData, name: string): string | undefined {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
}

/**
 * An API error detail as a sentence for the form: a leading field name in words ("display_name must
 * have…" becomes "Display name must have…"), a capital, and a full stop.
 */
export function plain(detail: string): string {
  return sentence(detail.replace(/^([a-z]+(?:[._][a-z]+)+)\b/, (field) => field.replace(/[._]/g, " ")));
}

/**
 * Runs `fn` as the session user; an ApiError becomes the form's error message, with its code. Each call
 * counts against the user's request limit, shared with the HTTP binding (api.md, Rate limits), except
 * `read` calls: the play page refreshes its view and history after every commit, which a busy table
 * would otherwise spend.
 */
export async function attempt<T>(fn: (userId: string | null) => Promise<T>, options: { read?: boolean } = {}): Promise<{ ok: T } | { error: string; code: ApiErrorCode }> {
  const user = await sessionUser();
  try {
    if (user && !options.read) {
      const wait = await serverStore().rateHit(user.id, "api", RATE_LIMIT.window_seconds, RATE_LIMIT.limit);
      if (wait > 0) throw new ApiError("rate_limited", `too many requests; try again in ${Math.ceil(wait / 1000)} seconds`);
    }
    return { ok: await fn(user?.id ?? null) };
  } catch (e) {
    if (e instanceof ApiError) return { error: plain(e.detail), code: e.code };
    throw e;
  }
}

/**
 * Runs `fn` as `attempt` does, for a form that stays on its page: on success `changed` revalidates the
 * pages the change shows on, and the form confirms with `saved` when given.
 */
export async function save(fn: (userId: string | null) => Promise<unknown>, changed: () => void, saved?: string): Promise<FormState> {
  const r = await attempt(fn);
  if ("error" in r) return { error: r.error };
  changed();
  return saved ? { error: null, saved } : { error: null };
}

/** A same-site path to return to, or the dashboard. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}
