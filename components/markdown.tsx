// A small Markdown renderer for the specification's legal and licence documents: headings,
// paragraphs, lists, tables, inline code, emphasis, and links. Server-only; no dependency.
import type { ReactNode } from "react";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("`")) {
      out.push(
        <code key={k} className="font-mono text-code">
          {t.slice(1, -1)}
        </code>,
      );
    } else if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      // Links within the specification have no page here; only external links are kept.
      out.push(
        /^https?:/.test(href!) ? (
          <a key={k} href={href} className="text-accent underline">
            {label}
          </a>
        ) : (
          <span key={k}>{label}</span>
        ),
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LIST_ITEM = /^\s*([-*]|\d+\.)\s/;

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!;
    const k = `b${i}`;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const cls = level === 1 ? "mt-2 font-display text-title" : level === 2 ? "mt-8 font-display text-heading" : "mt-6 font-ui text-control font-bold";
      const Tag = (["h1", "h2", "h3", "h4"] as const)[level - 1]!;
      blocks.push(
        <Tag key={k} className={cls}>
          {inline(h[2]!, k)}
        </Tag>,
      );
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i]!.startsWith("|"); i++) {
        if (/^\|[\s:|-]+\|$/.test(lines[i]!)) continue;
        rows.push(
          lines[i]!.slice(1, -1)
            .split("|")
            .map((c) => c.trim()),
        );
      }
      const [head, ...body] = rows;
      blocks.push(
        <table key={k} className="mt-4 w-full border-collapse font-ui text-prose-sm">
          <thead>
            <tr>
              {head!.map((c, j) => (
                <th key={j} className="border-b border-rule py-1 pr-4 text-left">
                  {inline(c, `${k}h${j}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, n) => (
              <tr key={n}>
                {r.map((c, j) => (
                  <td key={j} className="border-b border-rule py-1 pr-4 align-top">
                    {inline(c, `${k}r${n}c${j}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      for (; i < lines.length && LIST_ITEM.test(lines[i]!); i++) items.push(lines[i]!.replace(LIST_ITEM, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={k} className={`mt-3 pl-6 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `${k}i${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && lines[i]!.trim() !== "" && !/^#|^\|/.test(lines[i]!) && !LIST_ITEM.test(lines[i]!); i++) para.push(lines[i]!);
    blocks.push(
      <p key={k} className="mt-3">
        {inline(para.join(" "), k)}
      </p>,
    );
  }
  return <article className="mx-auto max-w-page px-6 py-10">{blocks}</article>;
}
