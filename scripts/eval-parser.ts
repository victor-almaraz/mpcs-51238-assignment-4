// Runs the parser evaluation set against the configured Groq model (engine-implementation.md, Parser
// evaluation set). Exits 1 below 90% exact match or when an overreach input resolves to a
// state-changing tool; 2 when GROQ_API_KEY is unset or PARSER_TIMEOUT is not an integer.
import { evaluate } from "../lib/parser/eval/cases";
import { groqFromEnv } from "./lib";

const { parser, parserModel: model } = groqFromEnv("eval-parser");
/** Why a case produced no call: the parser's failure reason and detail. */
const failures = new Map<string, string>();
const report = await evaluate(async (c) => {
  const r = await parser.parse(c.context, c.tools, c.hints);
  if (!r.ok) failures.set(c.name, `${r.reason}: ${r.detail}`.slice(0, 300));
  return r.ok ? r.call : null;
});
for (const f of report.failures) console.log(`miss  ${f.name}\n      expected ${JSON.stringify(f.expected)}\n      got      ${JSON.stringify(f.got)}${failures.has(f.name) ? `\n      because  ${failures.get(f.name)}` : ""}`);
console.log(`${model}: ${report.exact}/${report.total} exact (${(report.accuracy * 100).toFixed(1)}%), overreach violations: ${report.overreach_violations.length}`);
process.exit(report.accuracy >= 0.9 && report.overreach_violations.length === 0 ? 0 : 1);
