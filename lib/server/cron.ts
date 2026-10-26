// The cron secret: Vercel Cron calls the scheduled jobs with `Authorization: Bearer $CRON_SECRET`, and
// the operator presents it for the health check's details.

/** Whether the request carries the cron secret; false while CRON_SECRET is unset. */
export function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

/** The response refusing a scheduled job's request without the cron secret; null when it carries it. */
export function cronRefusal(request: Request): Response | null {
  if (!process.env.CRON_SECRET) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  return hasCronSecret(request) ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
