// Extracts YAML blocks from the specification's Markdown and names the pack file each one is
// (AGENTS.md, "Validation before finishing", item 3). A block is a complete pack file when the
// paragraph right before it names one in backticks ("Create `packs/x/tables.yaml`:"), or, failing
// that, when its nearest level-2 heading is a pack file name ("## entities/*.yaml"). Blocks named by
// one section heading are parts of one file, except in one-record-per-file directories.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface DocBlock {
  doc: string; // relative to the specification root
  line: number; // 1-based line of the opening fence
  file: string | undefined; // pack file the block is, e.g. "entities/creatures.yaml"; undefined for fragments
  section: string; // nearest level-2 heading
  fromSection: boolean; // file named by the section heading rather than the paragraph
  example: string | undefined; // file of spec/examples/ the block quotes, relative to the specification root
  excerpt: boolean; // the paragraph begins "Excerpt of": the block is part of `example`
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

/** The lines of the paragraph right before the fence at `fence`, top first. */
function paragraph(lines: string[], fence: number): string[] {
  let i = fence - 1;
  while (i >= 0 && lines[i]!.trim() === "") i--;
  const end = i;
  for (; i >= 0 && lines[i]!.trim() !== "" && !lines[i]!.startsWith("#"); i--);
  return lines.slice(i + 1, end + 1);
}

function paragraphFile(text: string[]): string | undefined {
  const found = new Set<string>();
  for (const line of text) {
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const file = packFile(m[1]!);
      if (file) found.add(file);
    }
  }
  return found.size === 1 ? [...found][0] : undefined;
}

// AGENTS.md, "Validation before finishing", items 3 and 4: a block that names a file of
// spec/examples/ quotes it whole, or, after "Excerpt of", in part.
function quoted(text: string[]): { example: string | undefined; excerpt: boolean } {
  const example = text.join(" ").match(/`(spec\/examples\/[^`]+\.yaml)`/)?.[1];
  return { example, excerpt: example !== undefined && /^Excerpt of /.test(text[0] ?? "") };
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
      const before = paragraph(lines, fence);
      const named = paragraphFile(before);
      blocks.push({
        doc: relative(specRoot, path),
        line: fence + 1,
        file: named ?? sectionFile,
        section,
        fromSection: named === undefined && sectionFile !== undefined,
        ...quoted(before),
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
