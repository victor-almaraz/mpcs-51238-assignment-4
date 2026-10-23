// Helpers for server-rendered pages.
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ApiError } from "../api/errors";

/** The operation's result; the 404 page when it fails with not_found (app-flow.md, Redirect rules). */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.code === "not_found") notFound();
    throw e;
  }
}

/** The default system version range for a new campaign: the installed major and minor version. */
export function defaultRange(version: string): string {
  const [major, minor] = version.split(".");
  return `^${major}.${minor}`;
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
