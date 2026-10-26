// Reads documents at build time: the specification's, for the attribution page, and the application's
// own legal documents in legal/ (app-flow.md, Legal documents).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function specDocument(path: string): string {
  return readFileSync(join(process.cwd(), "cadmium-spec", path), "utf8");
}

/** `legal/terms.md` or `legal/privacy.md`. */
export function legalDocument(name: "terms.md" | "privacy.md"): string {
  return readFileSync(join(process.cwd(), "legal", name), "utf8");
}
