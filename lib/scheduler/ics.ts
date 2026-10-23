// iCalendar export (api.md, export_calendar and calendar feed: text/calendar, RFC 5545): one event per
// occurrence, cancelled ones with STATUS:CANCELLED, and one VALARM per reminder lead time in feeds.

import type { Occurrence } from "./occurrences";

export interface CalendarEntry {
  occurrence: Occurrence;
  title: string;
  description: string;
  /** Lead times in minutes for VALARM components; empty for exports. */
  alarms: readonly number[];
}

const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets (RFC 5545, 3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function calendar(name: string, entries: readonly CalendarEntry[], now: Date): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cadmium//Schedule//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${text(name)}`];
  for (const e of entries) {
    const o = e.occurrence;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${o.session_id}-${stamp(o.occurrence_start)}@cadmium`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `DTSTART:${stamp(o.starts_at)}`,
      `DTEND:${stamp(o.ends_at)}`,
      `SUMMARY:${text(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${text(e.description)}`] : []),
      `STATUS:${o.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    );
    if (o.status !== "cancelled") {
      for (const lead of e.alarms) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${text(e.title)}`, `TRIGGER:-PT${lead}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
