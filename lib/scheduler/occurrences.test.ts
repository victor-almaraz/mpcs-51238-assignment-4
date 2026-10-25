import { describe, expect, it } from "vitest";
import { occurrencesBetween, occurrencesOf, originalStarts, type SessionRecord } from "./occurrences";
import { instantOf, localInstant } from "./zone";

const weekly = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: "s_1",
  instance_id: "i_1",
  title: "Weekly game",
  starts_at: "2026-10-20T18:00:00Z",
  timezone: "Europe/Berlin",
  duration_minutes: 180,
  recurrence: { freq: "weekly", interval: 1, count: 10 },
  auto_resume: true,
  auto_pause: false,
  notes: "",
  status: "scheduled",
  cancelled_at: null,
  created_by: "u_1",
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const isoList = (ms: number[]) => ms.map((t) => new Date(t).toISOString());

describe("weekly recurrence", () => {
  it("keeps the local time across the end of daylight saving time", () => {
    // 20:00 in Berlin: CEST (UTC+2) before 25 October 2026, CET (UTC+1) after.
    expect(isoList(originalStarts(weekly()).slice(0, 3))).toEqual(["2026-10-20T18:00:00.000Z", "2026-10-27T19:00:00.000Z", "2026-11-03T19:00:00.000Z"]);
  });

  it("keeps the local time across the start of daylight saving time in New York", () => {
    const s = weekly({ starts_at: "2027-03-08T23:00:00Z", timezone: "America/New_York" });
    // 18:00 in New York: EST (UTC-5) before 14 March 2027, EDT (UTC-4) after.
    expect(isoList(originalStarts(s).slice(0, 2))).toEqual(["2027-03-08T23:00:00.000Z", "2027-03-15T22:00:00.000Z"]);
  });

  it("repeats every 2 to 4 weeks, stops at count or until, and defaults to 52", () => {
    expect(originalStarts(weekly({ recurrence: { freq: "weekly", interval: 2, count: 3 } })).length).toBe(3);
    expect(isoList(originalStarts(weekly({ recurrence: { freq: "weekly", interval: 2, count: 2 } })))[1]).toBe("2026-11-03T19:00:00.000Z");
    expect(originalStarts(weekly({ recurrence: { freq: "weekly", interval: 1, until: "2026-11-04T00:00:00Z" } })).length).toBe(3);
    expect(originalStarts(weekly({ recurrence: { freq: "weekly", interval: 1 } })).length).toBe(52);
    expect(originalStarts(weekly({ recurrence: null })).length).toBe(1);
  });

  it("applies moved and cancelled exceptions, and cancels the rest of a cancelled series", () => {
    const s = weekly();
    const list = occurrencesOf(s, [
      { session_id: "s_1", occurrence_start: "2026-10-27T19:00:00Z", status: "moved", moved_to: "2026-10-28T19:00:00Z" },
      { session_id: "s_1", occurrence_start: "2026-11-03T19:00:00Z", status: "cancelled", moved_to: null },
    ]);
    expect(list[1]).toEqual({ session_id: "s_1", occurrence_start: "2026-10-27T19:00:00Z", starts_at: "2026-10-28T19:00:00Z", ends_at: "2026-10-28T22:00:00Z", status: "moved" });
    expect(list[2]!.status).toBe("cancelled");
    const cancelled = occurrencesOf({ ...s, status: "cancelled", cancelled_at: "2026-11-05T00:00:00Z" }, []);
    expect(cancelled.map((o) => o.status).slice(0, 4)).toEqual(["scheduled", "scheduled", "scheduled", "cancelled"]);
  });

  it("lists occurrences overlapping a window", () => {
    const list = occurrencesBetween([weekly()], [], Date.parse("2026-10-27T00:00:00Z"), Date.parse("2026-11-04T00:00:00Z"));
    expect(list.map((o) => o.occurrence_start)).toEqual(["2026-10-27T19:00:00Z", "2026-11-03T19:00:00Z"]);
  });

  it("moves a time in a daylight-saving gap forward", () => {
    // 02:30 on 29 March 2026 does not exist in Berlin.
    expect(new Date(instantOf({ year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 }, "Europe/Berlin")).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
});

describe("localInstant", () => {
  it("reads a datetime-local value in a zone, and refuses a bad value or zone without throwing", () => {
    expect(localInstant("2026-10-31T15:30", "America/Chicago")).toBe("2026-10-31T20:30:00.000Z");
    expect(localInstant("2026-10-31T15:30", "Not/AZone")).toBeUndefined();
    expect(localInstant("tomorrow", "UTC")).toBeUndefined();
    expect(localInstant(undefined, "UTC")).toBeUndefined();
  });
});
