// The Content Compiler (spec/README.md): one library for the command line, the adventure editor,
// and publishing.

import type { SettingBundle } from "../bundle/setting";
import type { Diagnostic } from "./diagnostics";
import { Diagnostics, type PackFiles } from "./pack";
import { compileSetting, type CompileResult } from "./setting";

export { compileSetting, type CompileResult };
export type { Diagnostic, PackFiles };
export { formatDiagnostic, CHECKS } from "./diagnostics";

export type Bundle = SettingBundle;

const has = (files: PackFiles, name: string) => files.has(`${name}.yaml`) || files.has(`${name}.json`);

/** Compiles the pack in `files`, as a setting pack when it has a manifest. */
export function compile(files: PackFiles): CompileResult<Bundle> {
  if (has(files, "manifest")) return compileSetting(files);
  const out = new Diagnostics();
  out.add("manifest.yaml", ".", "is required: a setting pack has manifest.yaml", "file");
  return { ok: false, diagnostics: out.list };
}
