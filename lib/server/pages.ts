// Helpers for server-rendered pages.
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ApiError } from "../api/errors";

export { defaultRange } from "../api/materials";

/** The operation's result; the 404 page when it fails with not_found (app-flow.md, Redirect rules). */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.code === "not_found") notFound();
    throw e;
  }
}

/** A path segment decoded; a malformed escape such as "%E0" is kept as written, so it matches nothing. */
export function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The site's origin for absolute links, from the request. */
export async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The request's time, for windows such as the next 7 days. Server components render once per request. */
export function requestTime(): number {
  return Date.now();
}
