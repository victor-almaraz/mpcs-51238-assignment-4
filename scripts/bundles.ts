// Builds the bundles an operator publishes on a fresh deployment (runbooks/content-publishing.md):
// the packs in PUBLISHED (lib/demo/seed.ts), the settings and then the exemplar sunken_archive.
// Writes them to bundles/ (not committed); upload each in /admin, settings before the adventure.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compilePublished } from "../lib/demo/seed";
import { withFiles } from "../lib/materials";

const OUT = join(process.cwd(), "bundles");
mkdirSync(OUT, { recursive: true });

for (const [n, { bundle, files }] of compilePublished().entries()) {
  const file = join(OUT, `${n + 1}-${bundle.kind}-${bundle.id}-${bundle.version}.json`);
  writeFileSync(file, JSON.stringify(withFiles(bundle, files)));
  console.log(file);
}
