// Golden replays and the harness command line (engine-implementation.md, "Command-line harness";
// AGENTS.md, Test layers: golden replays of every example adventure).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { main, type Io } from "./cli";
import { HarnessError, begin, parseInput, play, replay, type LogLine } from "./harness";
import { SCENARIOS } from "./scenarios";

const GOLDEN = fileURLToPath(new URL("./golden/", import.meta.url));
const read = (name: string) => readFileSync(`${GOLDEN}${name}`, "utf8");
const lines = (text: string) => text.split("\n").filter((l) => l.trim() !== "");
const parseLog = (text: string) => lines(text).map((l) => JSON.parse(l) as LogLine);

describe.each(SCENARIOS)("golden scenario $name", (scenario) => {
  const inputs = lines(read(`${scenario.name}.input.jsonl`));
  const golden = read(`${scenario.name}.log.jsonl`);

  it(`plays the scripted inputs to the ending '${scenario.ending}', producing the golden log`, () => {
    const session = begin(scenario.bundles(), scenario.seed, scenario.characters());
    play(session, inputs);
    expect(session.state.ended).toEqual({ ending: scenario.ending });
    expect(session.log.map((l) => JSON.stringify(l)).join("\n") + "\n").toBe(golden);
  });

  it("replays the golden log", () => {
    const result = replay(scenario.bundles(), parseLog(golden));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.ended).toEqual({ ending: scenario.ending });
  });

  it("reports the first version whose events differ", () => {
    const log = parseLog(golden);
    const target = log[2]!;
    target.events = [...target.events, { type: "waited", actor: "c_1" }];
    expect(replay(scenario.bundles(), log)).toEqual({ ok: false, version: target.version, reason: "events differ" });
  });
});

describe("harness input lines", () => {
  it.each([
    ['{"actor":"c_1","tool":"move","args":{"to_id":"hold"}}', { actor: "c_1", tool: "move", args: { to_id: "hold" } }],
    ['{"advance":true}', { advance: true }],
    ['{"view":"c_1"}', { view: "c_1" }],
  ])("accepts %s", (text, input) => {
    expect(parseInput(text, 1)).toEqual(input);
  });

  it.each(["{not json", '{"advance":false}', '{"actor":"c_1","tool":"wait"}', '{"view":"c_1","extra":1}', "[]"])("rejects %s with its line number", (text) => {
    expect(() => parseInput(text, 4)).toThrow(HarnessError);
    expect(() => parseInput(text, 4)).toThrow(/^line 4: /);
  });
});

describe("harness command line", () => {
  const trial = SCENARIOS.find((s) => s.name === "trial_escaped")!;
  const bundles = trial.bundles();
  const files: Record<string, string> = {
    "setting.json": JSON.stringify(bundles.settings[0]),
    "adventure.json": JSON.stringify(bundles.adventure),
    "vale.json": JSON.stringify(trial.characters()[0]!.sheet),
    "golden.log": read("trial_escaped.log.jsonl"),
  };

  function run(argv: string[], stdin = "") {
    const written: Record<string, string> = {};
    let stdout = "";
    let stderr = "";
    const io: Io = {
      stdin: () => stdin,
      stdout: (t) => (stdout += t),
      stderr: (t) => (stderr += t),
      read: (p) => {
        const f = files[p] ?? written[p];
        if (f === undefined) throw new Error(`ENOENT: ${p}`);
        return f;
      },
      write: (p, t) => (written[p] = t),
    };
    return { code: main(argv, io), stdout, stderr, written };
  }

  const playArgs = ["play", "--bundle", "setting.json", "adventure.json", "--seed", "7", "--character", "c_1=vale.json"];

  it("plays JSON lines: one output line per input, rejections as data, exit 0", () => {
    const stdin = ['{"actor":"c_1","tool":"move","args":{"to_id":"nowhere"}}', '{"actor":"c_1","tool":"wait","args":{}}', '{"view":"c_1"}'].join("\n");
    const { code, stdout } = run(playArgs, stdin);
    expect(code).toBe(0);
    const out = lines(stdout).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(out[0]).toEqual({ error: { code: "unknown_id", detail: "'nowhere' does not exist" } });
    expect(out[1]).toMatchObject({ version: 2 });
    expect(Object.keys(out[2]!)).toEqual(["view"]);
  });

  it("writes --state and --log, and the log replays", () => {
    const { code, written } = run([...playArgs, "--state", "state.json", "--log", "run.log"], read("trial_escaped.input.jsonl"));
    expect(code).toBe(0);
    expect(JSON.parse(written["state.json"]!).ended).toEqual({ ending: "escaped" });
    // Characters from ID=SHEET_FILE carry no user_id, so only the start line's characters differ.
    expect(parseLog(written["run.log"]!).map((l) => l.events)).toEqual(parseLog(read("trial_escaped.log.jsonl")).map((l) => l.events));
    files["run.log"] = written["run.log"]!;
    expect(run(["replay", "--bundle", "setting.json", "adventure.json", "run.log"]).code).toBe(0);
  });

  it("stops at a malformed line with 'harness: line N: MESSAGE' and exit 1", () => {
    const { code, stderr } = run(playArgs, '{"advance":true}\n{oops');
    expect(code).toBe(1);
    expect(stderr).toBe("harness: line 2: not valid JSON\n");
  });

  it("replays a log with exit 0, and exits 1 naming the first differing version", () => {
    expect(run(["replay", "--bundle", "setting.json", "adventure.json", "golden.log"])).toMatchObject({ code: 0, stderr: "" });
    const log = parseLog(files["golden.log"]!);
    log[3]!.events = [];
    files["broken.log"] = log.map((l) => JSON.stringify(l)).join("\n");
    expect(run(["replay", "--bundle", "setting.json", "adventure.json", "broken.log"])).toMatchObject({ code: 1, stderr: `harness: version ${log[3]!.version}: events differ\n` });
  });

  it.each([[["fly"]], [["play", "--seed", "7"]], [["play", "--bundle", "setting.json", "adventure.json"]], [["play", "--bundle", "setting.json", "adventure.json", "--seed", "x", "--character", "c_1=vale.json"]], [["replay", "--bundle", "setting.json"]]])(
    "exits 2 on usage errors: %j",
    (argv) => {
      expect(run(argv).code).toBe(2);
    },
  );
});
