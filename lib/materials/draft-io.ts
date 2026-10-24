// Drafts and adventure directories (app-flow.md, Adventure editor: the draft maps one-to-one onto
// the adventure's YAML files; Validation: diagnostics carry a JSON Pointer into the draft).

import { parse } from "yaml";
import type { Diagnostic } from "./diagnostics";

export interface DraftDiagnostic {
  pointer: string;
  severity: "error" | "warning";
  code: string;
  message: string;
}

const DIRS: Record<string, string> = { plot: "arcs", locations: "locations", npcs: "npcs" };

/** A draft document from an adventure directory's files, with paths relative to the directory. */
export function filesToDraft(files: ReadonlyMap<string, string>): { draft: Record<string, unknown>; problems: DraftDiagnostic[] } {
  const draft: Record<string, unknown> = { adventure: {}, flags: {}, arcs: {}, locations: {}, npcs: {}, entities: {}, editor: { layout: {}, snapshots: [] } };
  const problems: DraftDiagnostic[] = [];
  for (const [path, text] of files) {
    let data: unknown;
    try {
      data = parse(text, { version: "1.2" });
    } catch (e) {
      problems.push({ pointer: "", severity: "error", code: "file", message: `${path}: ${(e as Error).message}` });
      continue;
    }
    const [dir, file] = path.split("/");
    if (path === "adventure.yaml") draft.adventure = data;
    else if (path === "flags.yaml") draft.flags = data ?? {};
    else if (file && dir && DIRS[dir] && file.endsWith(".yaml")) {
      const id = (data as { id?: string } | null)?.id ?? file.replace(/\.yaml$/, "");
      (draft[DIRS[dir]!] as Record<string, unknown>)[id] = data;
    } else if (dir === "entities" && file?.endsWith(".yaml")) Object.assign(draft.entities as object, data ?? {});
    else problems.push({ pointer: "", severity: "warning", code: "file", message: `${path}: not part of an adventure directory; ignored` });
  }
  return { draft, problems };
}

/** The draft location of a compiler diagnostic: its file's record, then its path within it. */
export function draftPointer(d: Pick<Diagnostic, "file" | "path">): string {
  // Paths are written by formatPath: identifiers joined by ".", [n] for indexes, ["key"] for other keys.
  const segments = (path: string): string[] => {
    const out: string[] = [];
    const re = /\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]|([^.[\]]+)/g;
    for (const m of path.matchAll(re)) out.push(m[1] ?? (m[2] ? (JSON.parse(m[2]) as string) : m[3]!));
    return out.map((x) => x.replace(/~/g, "~0").replace(/\//g, "~1"));
  };
  let base: string[];
  const [dir, file] = d.file.split("/");
  if (d.file === "draft") base = [];
  else if (d.file === "adventure.yaml") base = ["adventure"];
  else if (d.file === "flags.yaml") base = ["flags"];
  else if (dir && file && DIRS[dir]) base = [DIRS[dir]!, file.replace(/\.yaml$/, "")];
  else if (dir === "entities") base = ["entities"];
  else base = [];
  const parts = [...base, ...segments(d.path === "." ? "" : d.path)];
  return parts.length ? `/${parts.join("/")}` : "";
}

export function toDraftDiagnostics(list: readonly Diagnostic[]): DraftDiagnostic[] {
  return list.map((d) => ({ pointer: draftPointer(d), severity: "error", code: d.check, message: d.message }));
}
