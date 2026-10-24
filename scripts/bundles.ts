// Builds the bundles an operator publishes on a fresh deployment (runbooks/content-publishing.md):
// the example settings, the Quest quick-start setting, and the guide's sunken_archive adventure.
// Writes them to bundles/ (not committed); upload each in /admin, settings before the adventure.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileAdventure, compileSetting, formatDiagnostic } from "../lib/materials";
import { readPackDir } from "../lib/materials/fs";
import { guideAdventure } from "../lib/materials/testing/fixtures";

const OUT = join(process.cwd(), "bundles");
mkdirSync(OUT, { recursive: true });

const settings = ["cadmium-spec/spec/examples/derelict_station", "cadmium-spec/spec/examples/sunless_crypt", "materials/quest_starter/pack"].map((dir) => {
  const r = compileSetting(readPackDir(join(process.cwd(), dir)));
  if (!r.bundle) throw new Error(`${dir}:\n${r.diagnostics.map(formatDiagnostic).join("\n")}`);
  return r.bundle;
});
const adventure = compileAdventure(guideAdventure(), settings);
if (!adventure.bundle) throw new Error(adventure.diagnostics.map(formatDiagnostic).join("\n"));

for (const [n, b] of [...settings, adventure.bundle].entries()) {
  const file = join(OUT, `${n + 1}-${b.kind}-${b.id}-${b.version}.json`);
  writeFileSync(file, JSON.stringify(b));
  console.log(file);
}
