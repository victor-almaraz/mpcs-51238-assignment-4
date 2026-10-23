// Times for display in the user's time zone (api.md, Scheduling: clients display times in the user's
// `timezone`).

export function formatWhen(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** The Monday of the week containing `iso`, in `timezone`, as a label. */
export function weekOf(iso: string, timezone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday!);
  const monday = new Date(Date.UTC(+parts.year!, +parts.month! - 1, +parts.day! - day));
  return `Week of ${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long" }).format(monday)}`;
}
