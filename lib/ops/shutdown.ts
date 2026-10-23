// The end-of-course shutdown (app-flow.md, Scheduled jobs: Shutdown), set by the operator as the
// deployment setting SHUTDOWN_AT: a banner from 14 days before, a closed notice from the time itself,
// and the purge of every record that is not held 90 days after.

const DAY = 86_400_000;

export type ShutdownPhase = { phase: "none" } | { phase: "notice"; at: Date } | { phase: "closed"; at: Date } | { phase: "purge"; at: Date };

export function shutdownPhase(setting: string | undefined, now: Date): ShutdownPhase {
  const at = setting ? new Date(setting) : null;
  if (!at || Number.isNaN(at.getTime())) return { phase: "none" };
  const t = now.getTime();
  if (t >= at.getTime() + 90 * DAY) return { phase: "purge", at };
  if (t >= at.getTime()) return { phase: "closed", at };
  if (t >= at.getTime() - 14 * DAY) return { phase: "notice", at };
  return { phase: "none" };
}

/** Paths still served once closed: the legal pages and what they need. */
export function openWhenClosed(path: string): boolean {
  return /^\/(terms|privacy|attribution|closed)(\/|$)/.test(path) || path.startsWith("/_next") || path === "/robots.txt" || path.startsWith("/api/cron/");
}
