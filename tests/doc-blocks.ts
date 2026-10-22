// Extracts YAML blocks from the specification's Markdown and names the pack file each one is
// (AGENTS.md, "Validation before finishing", item 3). A block is a complete pack file when the
// paragraph right before it names one in backticks ("Create `packs/x/tables.yaml`:"), or, failing
// that, when its nearest level-2 heading is a pack file name ("## entities/*.yaml"). Blocks named by
// one section heading are parts of one file, except in one-record-per-file directories.
// SPEC_ISSUES.md#complete-doc-yaml-blocks: the specification does not say how to tell a complete
// pack file from a fragment; these rules are the smallest reading that covers the current documents.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface DocBlock {
  doc: string; // relative to the specification root
  line: number; // 1-based line of the opening fence
  file: string | undefined; // pack file the block is, e.g. "entities/creatures.yaml"; undefined for fragments
  section: string; // nearest level-2 heading
  fromSection: boolean; // file named by the section heading rather than the paragraph
  source: string;
}

const PACK_FILE =
  /(?:^|\/)((?:abilities|entities|rooms|plot|locations|npcs)\/[\w*]+\.yaml|(?:manifest|conditions|tables|parser|assets|adventure|flags)\.yaml)$/;

/** The pack-relative path of `path` when it names a pack file, e.g. `adventures/a/plot/x.yaml` → `plot/x.yaml`. */
export function packFile(path: string): string | undefined {
  return PACK_FILE.exec(path)?.[1];
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return markdownFiles(path);
      return name.endsWith(".md") ? [path] : [];
    });
}

function paragraphFile(lines: string[], fence: number): string | undefined {
  let i = fence - 1;
  while (i >= 0 && lines[i]!.trim() === "") i--;
  const found = new Set<string>();
  for (; i >= 0 && lines[i]!.trim() !== "" && !lines[i]!.startsWith("#"); i--) {
    for (const m of lines[i]!.matchAll(/`([^`]+)`/g)) {
      const file = packFile(m[1]!);
      if (file) found.add(file);
    }
  }
  return found.size === 1 ? [...found][0] : undefined;
}

export function docBlocks(specRoot: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const path of [...markdownFiles(join(specRoot, "docs")), ...markdownFiles(join(specRoot, "briefs"))]) {
    const lines = readFileSync(path, "utf8").split("\n");
    let section = "";
    let sectionFile: string | undefined;
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i]!;
      const h2 = /^##\s+(.*)$/.exec(text);
      if (h2) section = h2[1]!.trim();
      if (h2) sectionFile = packFile(h2[1]!.trim()) === h2[1]!.trim() ? h2[1]!.trim() : undefined;
      if (!text.startsWith("```yaml")) continue;
      const fence = i;
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith("```"); i++) body.push(lines[i]!);
      const named = paragraphFile(lines, fence);
      blocks.push({
        doc: relative(specRoot, path),
        line: fence + 1,
        file: named ?? sectionFile,
        section,
        fromSection: named === undefined && sectionFile !== undefined,
        source: body.join("\n"),
      });
    }
  }
  return blocks;
}

const ONE_PER_FILE = /^(plot|locations|npcs)\//;

/** Complete pack files: section blocks of a merged file are joined into one document, at the first block's line. */
export function docPackFiles(specRoot: string): DocBlock[] {
  const out: DocBlock[] = [];
  for (const block of docBlocks(specRoot)) {
    if (block.file === undefined) continue;
    const prev = out[out.length - 1];
    const joinable = (b: DocBlock): boolean => b.fromSection && !ONE_PER_FILE.test(b.file!);
    if (prev && joinable(prev) && joinable(block) && prev.doc === block.doc && prev.section === block.section) {
      prev.source += "\n" + block.source;
    } else out.push({ ...block });
  }
  return out;
}
