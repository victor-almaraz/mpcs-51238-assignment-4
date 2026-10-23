// The `materials` command line (spec/README.md, "Compiler interface"):
//   materials check [--json] [--setting PATH]... [--] DIR
//   materials build [--json] [-o FILE] [--setting PATH]... [--] DIR
//   materials --help | --version
// Exit status 0: valid; 1: invalid, diagnostics on stderr, no bundle written; 2: usage error.

import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { FORMAT_VERSION, loadSettingBundle, type SettingBundle } from "../bundle/setting";
import { formatDiagnostic } from "./diagnostics";
import { readPackDir } from "./fs";
import { compile, compileSetting } from "./index";

export const VERSION = "0.1.0";

const USAGE = `usage: materials check [--json] [--setting PATH]... [--] DIR
       materials build [--json] [-o FILE] [--setting PATH]... [--] DIR
       materials --help | --version

check  Validate the pack in DIR. Writes nothing on success.
build  Validate, then write the bundle as JSON to stdout, or atomically to FILE with -o.

--setting PATH  A setting bundle (JSON) or setting pack directory that an adventure in DIR
                requires. Repeat for each required setting.

Exit status: 0 valid, 1 invalid (diagnostics on stderr), 2 usage error.`;

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const processIo: Io = {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
};

/** Runs the command line with `argv` (without the program name); returns the exit status. */
export function main(argv: readonly string[], io: Io = processIo): number {
  const usage = (message: string): number => {
    io.stderr(`materials: ${message}\n${USAGE}\n`);
    return 2;
  };
  if (argv.length === 1 && argv[0] === "--help") {
    io.stdout(`${USAGE}\n`);
    return 0;
  }
  if (argv.length === 1 && argv[0] === "--version") {
    io.stdout(`materials ${VERSION} (format_version ${FORMAT_VERSION})\n`);
    return 0;
  }
  const [command, ...rest] = argv;
  if (command !== "check" && command !== "build") return usage(command === undefined ? "missing subcommand" : `unknown subcommand '${command}'`);

  let json = false;
  let output: string | undefined;
  const settingPaths: string[] = [];
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--") {
      positional.push(...rest.slice(i + 1));
      break;
    }
    if (arg === "--json") json = true;
    else if (arg === "-o" && command === "build") {
      output = rest[++i];
      if (output === undefined) return usage("-o needs a FILE");
    } else if (arg === "--setting") {
      const path = rest[++i];
      if (path === undefined) return usage("--setting needs a PATH");
      settingPaths.push(path);
    } else if (arg.startsWith("-")) return usage(`unknown flag '${arg}'`);
    else positional.push(arg);
  }
  if (positional.length !== 1) return usage(positional.length === 0 ? "missing DIR" : "expected one DIR");
  const dir = positional[0]!;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return usage(`cannot read directory '${dir}'`);

  let files;
  try {
    files = readPackDir(dir);
  } catch (e) {
    return usage(`cannot read directory '${dir}': ${(e as Error).message}`);
  }
  // SPEC_ISSUES.md#cli-adventure-settings: --setting supplies the bundles an adventure requires.
  const settings: SettingBundle[] = [];
  for (const path of settingPaths) {
    if (!existsSync(path)) return usage(`cannot read setting '${path}'`);
    if (statSync(path).isDirectory()) {
      const compiled = compileSetting(readPackDir(path));
      for (const d of compiled.diagnostics) io.stderr(`${json ? JSON.stringify({ ...d, file: `${path}/${d.file}` }) : `${path}/${formatDiagnostic(d)}`}\n`);
      if (!compiled.bundle) return 1;
      settings.push(compiled.bundle);
    } else {
      try {
        settings.push(loadSettingBundle(JSON.parse(readFileSync(path, "utf8"))));
      } catch (e) {
        return usage(`'${path}' is not a setting bundle: ${(e as Error).message}`);
      }
    }
  }
  const result = compile(files, settings);
  for (const d of result.diagnostics) io.stderr(`${json ? JSON.stringify(d) : formatDiagnostic(d)}\n`);
  if (!result.ok || !result.bundle) return 1;
  if (command === "build") {
    const text = `${JSON.stringify(result.bundle, null, 2)}\n`;
    if (output === undefined) io.stdout(text);
    else {
      const tmp = join(dirname(output), `.${basename(output)}.${process.pid}.tmp`);
      writeFileSync(tmp, text);
      renameSync(tmp, output);
    }
  }
  return 0;
}

const invokedDirectly = process.argv[1] !== undefined && /materials[\\/]cli\.[cm]?[jt]s$/.test(process.argv[1]);
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
