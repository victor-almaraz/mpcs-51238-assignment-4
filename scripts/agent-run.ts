// Agent-driven runs of the exemplar (SPRINTS.md, sprint 24): a Groq player model and the Groq parser
// play one character to each ending. Writes agent-runs/<scenario>.{turns,log}.jsonl (not committed).
//   pnpm agent:run [escaped|archive_sealed|lost]...
// Exits 0 when every run reaches its ending, 1 otherwise, 2 when GROQ_API_KEY is unset.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GOALS } from "../lib/agent/goals";
import { agentRun, chatPlayer, patient } from "../lib/agent/run";
import { replay } from "../lib/engine";
import { commitOf } from "../lib/harness/harness";
import { SCENARIOS } from "../lib/harness/scenarios";
import { groqChat } from "../lib/models/groq";
import { modelParser } from "../lib/parser/adapter";

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("agent-run: GROQ_API_KEY is not set");
  process.exit(2);
}
const chat = patient(groqChat(key), undefined, undefined, (e, ms) => console.log(`  (${e.message}; retrying in ${ms / 1000} s)`));
const parserModel = process.env.GROQ_PARSER_MODEL || "llama-3.1-8b-instant";
const playerModel = process.env.GROQ_PLAYER_MODEL || "llama-3.1-8b-instant";
const parser = modelParser(chat, parserModel, Number(process.env.PARSER_TIMEOUT || 8) * 1000);
const player = chatPlayer(chat, playerModel);

const wanted = process.argv.slice(2);
const goals = GOALS.filter((g) => wanted.length === 0 || wanted.includes(g.ending));
const OUT = join(process.cwd(), "agent-runs");
mkdirSync(OUT, { recursive: true });

// One small call first, so a rejected key or model name stops the run with Groq's own message.
try {
  await chat({ model: playerModel, messages: [{ role: "user", content: "Reply with the word ready." }], max_tokens: 5 }, 20000);
  if (parserModel !== playerModel) await chat({ model: parserModel, messages: [{ role: "user", content: "Reply with the word ready." }], max_tokens: 5 }, 20000);
} catch (e) {
  console.error(`agent-run: ${(e as Error).message}`);
  process.exit(1);
}

let failed = 0;
for (const g of goals) {
  const scenario = SCENARIOS.find((s) => s.name === g.scenario)!;
  console.log(`${g.scenario}: player ${playerModel}, parser ${parserModel}`);
  const lines: string[] = [];
  let r: Awaited<ReturnType<typeof agentRun>>;
  try {
    r = await agentRun({
      bundles: scenario.bundles(),
      seed: scenario.seed,
      characters: scenario.characters(),
      player,
      parser,
      goal: g.goal,
      guide: g.guide,
      maxTurns: g.maxTurns,
      onTurn: (t) => {
        lines.push(JSON.stringify(t));
        console.log(`  ${String(t.turn).padStart(3)} ${t.outcome.padEnd(9)} ${t.input}${t.call ? `  -> ${t.call.tool} ${JSON.stringify(t.call.args)}` : ""}`);
      },
    });
  } catch (e) {
    // A model that stays unavailable ends this run; the turns so far are kept.
    writeFileSync(join(OUT, `${g.scenario}.turns.jsonl`), lines.join("\n") + "\n");
    console.log(`${g.scenario}: stopped after ${lines.length} turns: ${(e as Error).message}`);
    failed++;
    continue;
  }
  writeFileSync(join(OUT, `${g.scenario}.turns.jsonl`), lines.join("\n") + "\n");
  writeFileSync(join(OUT, `${g.scenario}.log.jsonl`), r.session.log.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const replayed = replay(scenario.bundles(), r.session.log.map(commitOf));
  const ok = r.ending === g.ending && replayed.ok;
  if (!ok) failed++;
  console.log(`${g.scenario}: ${ok ? "reached" : "did not reach"} '${g.ending}' (ended: ${r.ending ?? "no"}) in ${r.turns.length} turns, ${r.fallbacks} fallbacks, replay ${replayed.ok ? "ok" : "differs"}`);
}
process.exit(failed === 0 ? 0 : 1);
