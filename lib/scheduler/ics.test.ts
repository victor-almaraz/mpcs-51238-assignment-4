import { describe, expect, it } from "vitest";
import { text } from "./ics";

describe("iCalendar TEXT values", () => {
  it("escapes backslashes, semicolons, commas, and every line break", () => {
    expect(text("a\\b;c,d")).toBe("a\\\\b\\;c\\,d");
    // A lone CR must not start a new content line such as an ATTENDEE property.
    expect(text("x\rATTENDEE:mailto:a@b\r\ny\nz")).toBe("x\\nATTENDEE:mailto:a@b\\ny\\nz");
  });
});
