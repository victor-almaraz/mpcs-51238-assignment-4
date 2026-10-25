// Wall-clock time in an IANA time zone, from the platform's Intl data: no time-zone library.

export interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formats = new Map<string, Intl.DateTimeFormat>();

function format(tz: string): Intl.DateTimeFormat {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formats.set(tz, f);
  }
  return f;
}

export function validZone(tz: string): boolean {
  try {
    format(tz);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock time in `tz` at the UTC instant `ms`. */
export function wallAt(ms: number, tz: string): Wall {
  const parts = Object.fromEntries(format(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { year: +parts.year!, month: +parts.month!, day: +parts.day!, hour: +parts.hour! % 24, minute: +parts.minute!, second: +parts.second! };
}

const asUtc = (w: Wall) => Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);

/** The zone's offset from UTC at instant `ms`, in milliseconds. */
export function offsetAt(ms: number, tz: string): number {
  return asUtc(wallAt(ms, tz)) - Math.floor(ms / 1000) * 1000;
}

/**
 * The UTC instant of a wall-clock time in `tz`. In a gap (clocks jump forward) the time moves forward
 * by the gap; in an overlap (clocks fall back) the earlier instant is used.
 */
export function instantOf(w: Wall, tz: string): number {
  const guess = asUtc(w);
  const first = guess - offsetAt(guess, tz);
  const second = guess - offsetAt(first, tz);
  if (first === second) return first;
  // Two candidates: keep one that maps back to the wall time, preferring the earlier; in a gap
  // neither does, and the later reading moves the time past the gap.
  const fits = [first, second].filter((t) => asUtc(wallAt(t, tz)) === guess).sort((a, b) => a - b);
  return fits[0] ?? Math.max(first, second);
}

/**
 * A form's `datetime-local` value (`YYYY-MM-DDTHH:MM`) read as wall time in `tz`, as an ISO instant;
 * undefined when the value or the zone is invalid, so the operation reports the field.
 */
export function localInstant(local: string | undefined, tz: string): string | undefined {
  const m = local && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m || !validZone(tz)) return undefined;
  return new Date(instantOf({ year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]!, second: 0 }, tz)).toISOString();
}

/** `w` moved by whole days, keeping the wall-clock time. */
export function addDays(w: Wall, days: number): Wall {
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return { ...w, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
