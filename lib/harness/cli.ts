// The harness command line (engine-implementation.md, "Command-line harness"):
//   harness play --bundle FILE... --seed N --character ID=SHEET_FILE... [--state FILE] [--log FILE]
//   harness replay --bundle FILE... LOG
//   harness --help | --version
// play reads JSON lines on stdin and writes JSON lines on stdout. Engine rejections are data: exit 0.
// A malformed line stops with `harness: line N: MESSAGE` and exit 1; replay exits 1 at the first
// differing version. Usage errors exit 2.

import { readFileSync, writeFileSync } from "node:fs";
import { loadAdventureBundle, type AdventureBundle } from "../bundle/adventure";
import { loadSettingBundle, type SettingBundle } from "../bundle/setting";
import type { Bundles, JoiningCharacter } from "../engine";
import { SYSTEMS } from "../systems";
import { HarnessError, begin, play, replay, type LogLine } from "./harness";

export const VERSION = "0.1.0";

const USAGE = `usage: harness play --bundle FILE... --seed N --character ID=SHEET_FILE... [--state FILE] [--log FILE]
       harness replay --bundle FILE... LOG
       harness --help | --version`;

export interface Io {
  stdin: () => string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  read: (path: string) => string;
  write: (path: string, text: string) => void;
}

const processIo: Io = {
  stdin: () => readFileSync(0, "utf8"),
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
  read: (p) => readFileSync(p, "utf8"),
  write: (p, t) => writeFileSync(p, t),
};

class Usage extends Error {}

/** Loads bundle files: one adventure and the settings it requires, in the order given. */
export function loadBundles(texts: readonly string[]): Bundles {
  const settings: SettingBundle[] = [];
  let adventure: AdventureBundle | undefined;
  for (const text of texts) {
    const json = JSON.parse(text) as { kind?: string };
    if (json.kind === "adventure") {
      if (adventure) throw new Usage("more than one adventure bundle");
      adventure = loadAdventureBundle(json);
    } else settings.push(loadSettingBundle(json));
  }
  if (!adventure) throw new Usage("no adventure bundle");
  const binding = adventure.manifest.system;
  const system = SYSTEMS[binding.id];
  if (!system) throw new Usage(`rules system '${binding.id}' is not installed`);
  return { system: system.configure(binding.modules), settings, adventure };
}

export function main(argv: readonly string[], io: Io = processIo): number {
  try {
    return run(argv, io);
  } catch (e) {
    if (e instanceof Usage) {
      io.stderr(`harness: ${e.message}\n${USAGE}\n`);
      return 2;
    }
    if (e instanceof HarnessError) {
      io.stderr(`harness: ${e.message}\n`);
      return 1;
    }
    io.stderr(`harness: ${(e as Error).message}\n`);
    return 1;
  }
}

function run(argv: readonly string[], io: Io): number {
  if (argv.length === 1 && argv[0] === "--help") {
    io.stdout(`${USAGE}\n`);
    return 0;
  }
  if (argv.length === 1 && argv[0] === "--version") {
    io.stdout(`harness ${VERSION}\n`);
    return 0;
  }
  const [command, ...rest] = argv;
  if (command !== "play" && command !== "replay") throw new Usage(command === undefined ? "missing subcommand" : `unknown subcommand '${command}'`);
  const bundles: string[] = [];
  const characters: string[] = [];
  const positional: string[] = [];
  let seed: string | undefined;
  let stateFile: string | undefined;
  let logFile: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    const value = () => {
      const v = rest[++i];
      if (v === undefined || v.startsWith("--")) throw new Usage(`${arg} needs a value`);
      return v;
    };
    const values = (into: string[]) => {
      into.push(value());
      while (rest[i + 1] !== undefined && !rest[i + 1]!.startsWith("--")) into.push(rest[++i]!);
    };
    if (arg === "--bundle") values(bundles);
    else if (arg === "--character" && command === "play") values(characters);
    else if (arg === "--seed" && command === "play") seed = value();
    else if (arg === "--state" && command === "play") stateFile = value();
    else if (arg === "--log" && command === "play") logFile = value();
    else if (arg.startsWith("--")) throw new Usage(`unknown flag '${arg}'`);
    else positional.push(arg);
  }
  // In `replay --bundle FILE... LOG`, the path after the bundles is the LOG.
  if (command === "replay" && positional.length === 0 && bundles.length > 1) positional.push(bundles.pop()!);
  if (bundles.length === 0) throw new Usage("--bundle is required");
  const loaded = loadBundles(bundles.map((p) => io.read(p)));

  if (command === "replay") {
    if (positional.length !== 1) throw new Usage("expected one LOG");
    const log = io
      .read(positional[0]!)
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as LogLine);
    const result = replay(loaded, log);
    if (!result.ok) {
      io.stderr(`harness: version ${result.version}: ${result.reason}\n`);
      return 1;
    }
    return 0;
  }

  if (positional.length > 0) throw new Usage(`unexpected argument '${positional[0]}'`);
  if (seed === undefined || !/^[0-9]+$/.test(seed)) throw new Usage("--seed N is required, a non-negative integer");
  if (characters.length === 0) throw new Usage("at least one --character ID=SHEET_FILE is required");
  const joining: JoiningCharacter[] = characters.map((spec) => {
    const eq = spec.indexOf("=");
    if (eq <= 0) throw new Usage(`--character expects ID=SHEET_FILE, got '${spec}'`);
    return { id: spec.slice(0, eq), sheet: JSON.parse(io.read(spec.slice(eq + 1))) as JoiningCharacter["sheet"] };
  });
  const session = begin(loaded, BigInt(seed), joining);
  try {
    for (const line of play(session, io.stdin().split("\n"))) io.stdout(`${line}\n`);
  } finally {
    if (stateFile) io.write(stateFile, `${JSON.stringify(session.state)}\n`);
    if (logFile) io.write(logFile, session.log.map((l) => JSON.stringify(l)).join("\n") + "\n");
  }
  return 0;
}

const invokedDirectly = process.argv[1] !== undefined && /harness[\\/]cli\.[cm]?[jt]s$/.test(process.argv[1]);
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
