// The Content Compiler (spec/README.md): one library for the command line, the adventure editor,
// and publishing.

import type { AdventureBundle } from "../bundle/adventure";
import type { SettingBundle } from "../bundle/setting";
import { compileAdventure } from "./adventure";
import { formatDiagnostic, type Diagnostic } from "./diagnostics";
import { draftFiles } from "./draft-io";
import { Diagnostics, schemaIssues, type PackFiles } from "./pack";
import { compileSetting, type CompileResult } from "./setting";

export { compileAdventure, compileSetting, draftFiles, type CompileResult };
export type { Diagnostic, PackFiles };
export { formatDiagnostic, CHECKS } from "./diagnostics";

export type Bundle = SettingBundle | AdventureBundle;

const has = (files: PackFiles, name: string) => files.has(`${name}.yaml`) || files.has(`${name}.json`);

/**
 * Compiles the pack in `files`: a setting pack when it has `manifest.yaml`, an adventure pack when
 * it has `adventure.yaml`, compiled against `settings`.
 */
export function compile(files: PackFiles, settings: readonly SettingBundle[] = []): CompileResult<Bundle> {
  if (has(files, "manifest")) return compileSetting(files);
  if (has(files, "adventure")) return compileAdventure(files, settings);
  const out = new Diagnostics();
  out.add("manifest.yaml", ".", "is required: a pack has manifest.yaml (setting) or adventure.yaml (adventure)", "file");
  return { ok: false, diagnostics: out.list };
}

/** The bundle a compilation produced; throws with `label` and every diagnostic when it produced none. */
export function mustCompile<B>(result: CompileResult<B>, label: string): B {
  if (!result.bundle) throw new Error(`${label}:\n${result.diagnostics.map(formatDiagnostic).join("\n")}`);
  return result.bundle;
}

/** Compiles an adventure editor draft with the same checks and diagnostics as its directory. */
export function compileDraft(draft: unknown, settings: readonly SettingBundle[]): CompileResult<AdventureBundle> {
  const issues = schemaIssues("draft.schema.json", draft);
  if (issues) {
    const out = new Diagnostics();
    for (const i of issues) out.add("draft", i.path, i.message, "schema");
    return { ok: false, diagnostics: out.list };
  }
  const d = draft as Record<string, Record<string, { id?: string }>>;
  const out = new Diagnostics();
  for (const key of ["arcs", "locations", "npcs"]) {
    for (const [k, record] of Object.entries(d[key] ?? {})) {
      if (record.id !== k) out.add("draft", [key, k, "id"], `id '${String(record.id)}' differs from its key '${k}'`, "schema");
    }
  }
  if (!out.ok) return { ok: false, diagnostics: out.list };
  return compileAdventure(draftFiles(draft as Record<string, unknown>), settings);
}

/**
 * A bundle with its asset files, as `materials build` writes it and `publish_bundle` reads it: the
 * bundle's fields, plus `files` mapping each SHA-256 to its type and base64 bytes (spec/README.md,
 * "Asset files").
 */
export function withFiles(bundle: Bundle, files: CompileResult<Bundle>["files"]): Record<string, unknown> {
  const entries = Object.entries(files ?? {});
  if (entries.length === 0) return bundle as unknown as Record<string, unknown>;
  const b64 = (d: Uint8Array) => {
    let s = "";
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return { ...bundle, files: Object.fromEntries(entries.map(([h, f]) => [h, { mime: f.mime, data: b64(f.data), ...(f.width ? { width: f.width, height: f.height } : {}) }])) };
}
