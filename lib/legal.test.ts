// The application's legal documents (SPEC_ISSUES.md#legal-documents).

import { describe, expect, it } from "vitest";
import { legalDocument } from "./spec";

describe("legal documents", () => {
  it("state the takedown date, no retention promise, and deletion on request with holds", () => {
    const terms = legalDocument("terms.md", "");
    const privacy = legalDocument("privacy.md", "");
    for (const doc of [terms, privacy]) {
      expect(doc).toContain("on or after December 2, 2026");
      expect(doc).toMatch(/no promise to retain any data/);
      expect(doc).toMatch(/internal hold/);
      expect(doc).not.toMatch(/\[DATE\]|\[END DATE\]|14 days' notice/);
    }
    expect(privacy).toContain("We delete your data when you ask, unless it is under an internal hold");
  });

  it("fills the contact address when the deployment sets one", () => {
    expect(legalDocument("privacy.md", "ops@example.org")).not.toContain("[EMAIL]");
    expect(legalDocument("privacy.md", "ops@example.org")).toContain("ops@example.org");
    expect(legalDocument("privacy.md", "")).toContain("[EMAIL]");
  });
});
