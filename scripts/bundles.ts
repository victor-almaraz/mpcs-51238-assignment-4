// Builds the bundles an operator publishes on a fresh deployment (runbooks/content-publishing.md):
// the example settings, the Quest quick-start setting, lantern_coast, and the exemplar sunken_archive.
// Writes them to bundles/ (not committed); upload each in /admin, settings before the adventure.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileAdventure, compileSetting, formatDiagnostic, withFiles } from "../lib/materials";
import { readPackDir } from "../lib/materials/fs";

const OUT = join(process.cwd(), "bundles");
mkdirSync(OUT, { recursive: true });

const compiled = ["cadmium-spec/spec/examples/derelict_station", "cadmium-spec/spec/examples/sunless_crypt", "materials/quest_starter/pack", "materials/lantern_coast/pack"].map((dir) => {
  const r = compileSetting(readPackDir(join(process.cwd(), dir)));
  if (!r.bundle) throw new Error(`${dir}:\n${r.diagnostics.map(formatDiagnostic).join("\n")}`);
  return r;
});
const adventure = compileAdventure(readPackDir(join(process.cwd(), "materials/sunken_archive/pack")), compiled.map((r) => r.bundle!));
if (!adventure.bundle) throw new Error(adventure.diagnostics.map(formatDiagnostic).join("\n"));

for (const [n, r] of [...compiled, adventure].entries()) {
  const b = r.bundle!;
  const file = join(OUT, `${n + 1}-${b.kind}-${b.id}-${b.version}.json`);
  writeFileSync(file, JSON.stringify(withFiles(b, r.files)));
  console.log(file);
}
