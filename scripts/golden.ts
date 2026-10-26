// Writes the golden files of the scripted scenarios: lib/harness/golden/<name>.input.jsonl (the input
// lines the autopilot authored) and <name>.log.jsonl (the log they produce). Rerun only when engine or
// material behaviour changes on purpose, and review the diff.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS, author } from "../lib/harness/scenarios";

const DIR = fileURLToPath(new URL("../lib/harness/golden", import.meta.url));

for (const scenario of SCENARIOS) {
  const session = author(scenario);
  if (session.state.ended?.ending !== scenario.ending) {
    console.error(`golden: ${scenario.name} ended with ${JSON.stringify(session.state.ended)}, expected ${scenario.ending}`);
    process.exit(1);
  }
  const inputs = session.log.flatMap((l) => ("input" in l ? [JSON.stringify(l.input)] : []));
  writeFileSync(join(DIR, `${scenario.name}.input.jsonl`), inputs.join("\n") + "\n");
  writeFileSync(join(DIR, `${scenario.name}.log.jsonl`), session.log.map((l) => JSON.stringify(l)).join("\n") + "\n");
}
