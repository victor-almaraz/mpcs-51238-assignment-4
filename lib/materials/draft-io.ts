// Drafts and adventure directories (app-flow.md, Adventure editor: the draft maps one-to-one onto
// the adventure's YAML files; Validation: diagnostics carry a JSON Pointer into the draft).

import { parse, stringify } from "yaml";
import type { Diagnostic } from "./diagnostics";

export interface DraftDiagnostic {
  pointer: string;
  severity: "error" | "warning";
  code: string;
  message: string;
}

/**
 * How a draft maps onto an adventure directory: a key held in one file (written only when not empty,
 * unless required), a key whose records are one file each in a directory, or a key merged from every
 * file in a directory and written to one.
 */
type Part = { key: string; kind: "file"; file: string; required?: true } | { key: string; kind: "records"; dir: string } | { key: string; kind: "merged"; dir: string; file: string };

const PARTS: readonly Part[] = [
  { key: "adventure", kind: "file", file: "adventure.yaml", required: true },
  { key: "flags", kind: "file", file: "flags.yaml" },
  { key: "arcs", kind: "records", dir: "plot" },
  { key: "locations", kind: "records", dir: "locations" },
  { key: "npcs", kind: "records", dir: "npcs" },
  // SPEC_ISSUES.md#draft-entity-files: the draft's merged entities map onto one file.
  { key: "entities", kind: "merged", dir: "entities", file: "entities/entities.yaml" },
];

/** The part a directory path belongs to, with the record id its file name gives in a directory of records. */
function partOf(path: string): { part: Part; id?: string } | undefined {
  const [dir, file] = path.split("/");
  for (const part of PARTS) {
    if (part.kind === "file" && path === part.file) return { part };
    if (part.kind === "records" && dir === part.dir && file) return { part, id: file.replace(/\.yaml$/, "") };
    if (part.kind === "merged" && dir === part.dir) return { part };
  }
  return undefined;
}

/**
 * The files an editor draft maps onto (spec/README.md, "Adventure directory": the draft holds the
 * same records keyed by id and maps one-to-one onto the files).
 */
export function draftFiles(draft: Record<string, unknown>): Map<string, string> {
  const files = new Map<string, string>();
  const put = (path: string, data: unknown) => files.set(path, stringify(data, { version: "1.2" }));
  for (const part of PARTS) {
    const value = draft[part.key];
    if (part.kind === "records") for (const [id, record] of Object.entries((value ?? {}) as Record<string, unknown>)) put(`${part.dir}/${id}.yaml`, record);
    else if ((part.kind === "file" && part.required) || (value && Object.keys(value).length > 0)) put(part.file, value);
  }
  return files;
}

/** A draft document from an adventure directory's files, with paths relative to the directory. */
export function filesToDraft(files: ReadonlyMap<string, string>): { draft: Record<string, unknown>; problems: DraftDiagnostic[] } {
  const draft: Record<string, unknown> = { ...Object.fromEntries(PARTS.map((p) => [p.key, {}])), editor: { layout: {}, snapshots: [] } };
  const problems: DraftDiagnostic[] = [];
  for (const [path, text] of files) {
    let data: unknown;
    try {
      data = parse(text, { version: "1.2" });
    } catch (e) {
      problems.push({ pointer: "", severity: "error", code: "file", message: `${path}: ${(e as Error).message}` });
      continue;
    }
    const at = (path.split("/")[1] ?? path).endsWith(".yaml") ? partOf(path) : undefined;
    if (!at) problems.push({ pointer: "", severity: "warning", code: "file", message: `${path}: not part of an adventure directory; ignored` });
    else if (at.part.kind === "records") (draft[at.part.key] as Record<string, unknown>)[(data as { id?: string } | null)?.id ?? at.id!] = data;
    else if (at.part.kind === "merged") Object.assign(draft[at.part.key] as object, data ?? {});
    else draft[at.part.key] = at.part.required ? data : (data ?? {});
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
  const at = partOf(d.file);
  const base = !at ? [] : at.id !== undefined ? [at.part.key, at.id] : [at.part.key];
  const parts = [...base, ...segments(d.path === "." ? "" : d.path)];
  return parts.length ? `/${parts.join("/")}` : "";
}

export function toDraftDiagnostics(list: readonly Diagnostic[]): DraftDiagnostic[] {
  return list.map((d) => ({ pointer: draftPointer(d), severity: "error", code: d.check, message: d.message }));
}
