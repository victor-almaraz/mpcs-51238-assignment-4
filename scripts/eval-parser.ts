// Runs the parser evaluation set against the configured Groq model (engine-implementation.md, Parser
// evaluation set). Exits 1 below 90% exact match or when an overreach input resolves to a
// state-changing tool; 2 when GROQ_API_KEY is unset.
import { patient } from "../lib/agent/run";
import { DEFAULT_MODEL, groqChat, tunedForReasoning } from "../lib/models/groq";
import { modelParser } from "../lib/parser/adapter";
import { evaluate } from "../lib/parser/eval/cases";

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("eval-parser: GROQ_API_KEY is not set");
  process.exit(2);
}
const model = process.env.GROQ_PARSER_MODEL || DEFAULT_MODEL;
// Rate limits wait as long as Groq asks, as in agent:run; each wait prints one line.
const chat = patient(groqChat(key), undefined, undefined, (e, ms) => console.log(`  (${e.status === 429 ? "rate limited" : e.message.slice(0, 120)}; waiting ${(ms / 1000).toFixed(1)} s)`));
const parser = modelParser(tunedForReasoning(chat, process.env.GROQ_REASONING_EFFORT || "low"), model, Number(process.env.PARSER_TIMEOUT || 20) * 1000);
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
