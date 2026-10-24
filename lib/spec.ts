// Reads documents at build time: the specification's, for the attribution page, and the application's
// own legal documents in legal/ (SPEC_ISSUES.md#legal-documents).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function specDocument(path: string): string {
  return readFileSync(join(process.cwd(), "cadmium-spec", path), "utf8");
}

/** `legal/terms.md` or `legal/privacy.md`, with `[EMAIL]` replaced by the deployment's CONTACT_EMAIL when set. */
export function legalDocument(name: "terms.md" | "privacy.md", contact = process.env.CONTACT_EMAIL): string {
  const text = readFileSync(join(process.cwd(), "legal", name), "utf8");
  return contact ? text.replaceAll("[EMAIL]", contact) : text;
}
