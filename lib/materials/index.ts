// The Content Compiler (spec/README.md): one library for the command line, the adventure editor,
// and publishing.

import { stringify } from "yaml";
import type { AdventureBundle } from "../bundle/adventure";
import type { SettingBundle } from "../bundle/setting";
import { compileAdventure } from "./adventure";
import type { Diagnostic } from "./diagnostics";
import { Diagnostics, schemaIssues, type PackFiles } from "./pack";
import { compileSetting, type CompileResult } from "./setting";

export { compileAdventure, compileSetting, type CompileResult };
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

/**
 * The files an editor draft maps onto (spec/README.md, "Adventure directory": the draft holds the
 * same records keyed by id and maps one-to-one onto the files).
 */
export function draftFiles(draft: Record<string, unknown>): Map<string, string> {
  const files = new Map<string, string>();
  const put = (path: string, data: unknown) => files.set(path, stringify(data, { version: "1.2" }));
  put("adventure.yaml", draft.adventure);
  if (draft.flags && Object.keys(draft.flags).length > 0) put("flags.yaml", draft.flags);
  for (const [dir, key] of [["plot", "arcs"], ["locations", "locations"], ["npcs", "npcs"]] as const) {
    for (const [id, record] of Object.entries((draft[key] ?? {}) as Record<string, unknown>)) put(`${dir}/${id}.yaml`, record);
  }
  // SPEC_ISSUES.md#draft-entity-files: the draft's merged entities map onto one file.
  if (draft.entities && Object.keys(draft.entities).length > 0) put("entities/entities.yaml", draft.entities);
  return files;
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
