// Reads documents from the specification at build time, for the legal and attribution pages.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function specDocument(path: string): string {
  return readFileSync(join(process.cwd(), "cadmium-spec", path), "utf8");
}
