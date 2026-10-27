// A small Markdown renderer for the specification's legal and licence documents: headings,
// paragraphs, lists, tables, inline code, emphasis, and links, at prose width (docs/design/README.md,
// Page widths). Server-only; no dependency.
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
        <code key={k} className="rounded bg-desk px-1 font-mono text-code">
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

/** The document at prose width, with `children` (such as credits written in JSX) after it. */
export function Markdown({ source, children }: { source: string; children?: ReactNode }) {
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
      const cls = level === 1 ? "mb-6 font-display text-title font-semibold text-ink sm:text-display" : level === 2 ? "mt-10 border-t border-rule pt-6 font-display text-section font-semibold text-ink" : "mt-6 text-heading font-semibold text-ink";
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
      // A table on expanded screens; on compact ones each row stacks as its column names and values.
      blocks.push(
        <dl key={`${k}s`} className="mt-4 flex flex-col divide-y divide-rule rounded-card border border-rule bg-page text-caption sm:hidden">
          {body.map((r, n) => (
            <div key={n} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-3">
              {r.map((c, j) => (
                <div key={j} className="contents">
                  <dt className="text-label font-medium text-muted">{inline(head![j] ?? "", `${k}s${n}h${j}`)}</dt>
                  <dd className="min-w-0 break-words">{inline(c, `${k}s${n}c${j}`)}</dd>
                </div>
              ))}
            </div>
          ))}
        </dl>,
      );
      blocks.push(
        <div key={k} className="relative mt-4 hidden max-w-full overflow-x-auto rounded-card border border-rule bg-page sm:block">
          <table className="w-full border-collapse text-left text-caption">
          <thead>
            <tr>
              {head!.map((c, j) => (
                <th key={j} scope="col" className="border-b border-rule bg-desk px-3 py-2 text-label font-medium text-muted">
                  {inline(c, `${k}h${j}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {body.map((r, n) => (
              <tr key={n}>
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-2 align-top">
                    {inline(c, `${k}r${n}c${j}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      for (; i < lines.length && LIST_ITEM.test(lines[i]!); i++) items.push(lines[i]!.replace(LIST_ITEM, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={k} className={`mt-3 flex flex-col gap-1 pl-6 ${ordered ? "list-decimal" : "list-disc"}`}>
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
      <p key={k} className="mt-3 text-pretty">
        {inline(para.join(" "), k)}
      </p>,
    );
  }
  return (
    // A prose column, centred like every page.
    <article className="mx-auto w-full min-w-0 max-w-page px-4 pt-8 pb-12 text-body text-ink sm:px-6">
      <div className="mx-auto max-w-prose">
        {blocks}
        {children}
      </div>
    </article>
  );
}
