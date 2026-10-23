// Runs the parser evaluation set against the configured Groq model (engine-implementation.md, Parser
// evaluation set). Exits 1 below 90% exact match or when an overreach input resolves to a
// state-changing tool; 2 when GROQ_API_KEY is unset.
import { groqChat } from "../lib/models/groq";
import { modelParser } from "../lib/parser/adapter";
import { evaluate } from "../lib/parser/eval/cases";
import { sunkenBundles } from "../lib/harness/scenarios";

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("eval-parser: GROQ_API_KEY is not set");
  process.exit(2);
}
const model = process.env.GROQ_PARSER_MODEL || "llama-3.3-70b-versatile";
const parser = modelParser(groqChat(key), model, Number(process.env.PARSER_TIMEOUT || 8) * 1000);
const hints = sunkenBundles().settings.map((s) => s.parser);
const report = await evaluate(async (c) => {
  const r = await parser.parse(c.context, c.tools, hints);
  return r.ok ? r.call : null;
});
for (const f of report.failures) console.log(`miss  ${f.name}\n      expected ${JSON.stringify(f.expected)}\n      got      ${JSON.stringify(f.got)}`);
console.log(`${model}: ${report.exact}/${report.total} exact (${(report.accuracy * 100).toFixed(1)}%), overreach violations: ${report.overreach_violations.length}`);
process.exit(report.accuracy >= 0.9 && report.overreach_violations.length === 0 ? 0 : 1);
