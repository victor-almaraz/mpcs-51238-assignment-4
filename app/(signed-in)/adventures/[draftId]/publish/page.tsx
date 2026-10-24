// Publish (app-flow.md, Adventure editor: Publishing): a version, the diagnostics, and the changes
// since the last published version with the suggested increment (runbooks/content-publishing.md).
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getDraft, validateDraft } from "@/lib/api/drafts";
import { publishDraftAction } from "@/lib/server/draft-actions";
import { orNotFound } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import type { AdventureBundle } from "@/lib/bundle/adventure";

type Doc = { adventure?: { endings?: Record<string, unknown> }; arcs?: object; locations?: object; npcs?: object; entities?: object; flags?: object };

/** The increment content-publishing.md asks for: major on a removed ending, minor on added records. */
function suggest(previous: AdventureBundle | undefined, d: Doc): { increment: "major" | "minor" | "patch"; why: string } {
  if (!previous) return { increment: "major", why: "first version" };
  const removed = Object.keys(previous.manifest.endings).filter((k) => !(k in (d.adventure?.endings ?? {})));
  if (removed.length) return { increment: "major", why: `removed ending ${removed.join(", ")}` };
  const count = (o: object | undefined) => Object.keys(o ?? {}).length;
  const before = (previous.arcs?.length ?? 0) + count(previous.locations) + count(previous.npcs) + Object.keys(previous.manifest.endings).length;
  const after = count(d.arcs) + count(d.locations) + count(d.npcs) + count(d.adventure?.endings);
  if (after > before) return { increment: "minor", why: "added arcs, locations, NPCs, or endings" };
  return { increment: "patch", why: "text, balance, or trigger changes" };
}

function next(version: string | null, increment: "major" | "minor" | "patch"): string {
  if (!version) return "1.0.0";
  const [a, b, c] = version.split(".").map(Number) as [number, number, number];
  return increment === "major" ? `${a + 1}.0.0` : increment === "minor" ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}

export default async function Publish({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const user = await pageUser();
  const store = serverStore();
  const draft = await orNotFound(getDraft(store, user.id, draftId));
  const diagnostics = await validateDraft(store, user.id, draftId);
  const previous = draft.last_published_version ? ((await store.getBundle("adventure", draft.material_id, draft.last_published_version)) as AdventureBundle | undefined) : undefined;
  const s = suggest(previous, draft.document as Doc);
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <Link href={`/adventures/${draftId}/edit`} className="font-ui text-caption text-muted">
        {draft.title}
      </Link>
      <h1 className="font-display text-title">Publish</h1>
      <p className="mt-2">
        {draft.last_published_version ? `Last published: ${draft.last_published_version}.` : "Not published yet."} Suggested: a {s.increment} version ({s.why}).
      </p>
      {errors.length > 0 ? (
        <div className="mt-4">
          <p className="text-danger">
            Fix {errors.length} problem{errors.length === 1 ? "" : "s"} to publish.
          </p>
          <ul className="mt-2 font-ui text-caption">
            {errors.slice(0, 20).map((d, i) => (
              <li key={i}>
                <span className="font-mono">{d.pointer || "/"}</span> {d.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ActionForm action={publishDraftAction} className="mt-6 flex items-end gap-2">
          <input type="hidden" name="draft_id" value={draftId} />
          <label className="flex flex-col gap-1">
            <span className="font-ui text-label">Version</span>
            <input name="version" required defaultValue={next(draft.last_published_version, s.increment)} pattern="\d+\.\d+\.\d+" className="w-32 rounded-control border border-border bg-page px-2 py-1 font-mono text-code" />
          </label>
          <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
            Publish
          </button>
        </ActionForm>
      )}
      {warnings.length > 0 && (
        <div className="mt-6">
          <p className="text-warning">
            {warnings.length} warning{warnings.length === 1 ? "" : "s"}; publishing is allowed.
          </p>
          <ul className="mt-2 font-ui text-caption">
            {warnings.map((d, i) => (
              <li key={i}>
                <span className="font-mono">{d.pointer || "/"}</span> {d.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-6 font-ui text-caption text-muted">A published adventure is usable only in campaigns you create; players reach it by invitation.</p>
    </div>
  );
}
