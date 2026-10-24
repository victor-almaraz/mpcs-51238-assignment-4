// The application's legal documents (SPEC_ISSUES.md#legal-documents).

import { describe, expect, it } from "vitest";
import { CONTACT } from "./legal";
import { legalDocument } from "./spec";

describe("legal documents", () => {
  it("state the takedown date, no retention promise, and deletion on request with holds", () => {
    const terms = legalDocument("terms.md");
    const privacy = legalDocument("privacy.md");
    for (const doc of [terms, privacy]) {
      expect(doc).toContain("on or after December 2, 2026");
      expect(doc).toMatch(/no promise to retain any data/);
      expect(doc).toMatch(/internal hold/);
      expect(doc).not.toMatch(/\[DATE\]|\[END DATE\]|14 days' notice/);
    }
    expect(privacy).toContain("We delete your data when you ask, unless it is under an internal hold");
  });

  it("name the contact address and leave no placeholder", () => {
    for (const name of ["terms.md", "privacy.md"] as const) {
      expect(legalDocument(name)).toContain(CONTACT);
      expect(legalDocument(name)).not.toContain("[EMAIL]");
    }
  });
});
