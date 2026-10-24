// Publish (app-flow.md, Adventure editor: Publishing): a version, the diagnostics, and the changes
// since the last published version with the suggested increment (runbooks/content-publishing.md).
import { Upload } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { getDraft, validateDraft } from "@/lib/api/drafts";
import { publishDraftAction } from "@/lib/server/draft-actions";
import { orNotFound } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import type { AdventureBundle } from "@/lib/bundle/adventure";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FieldGroup, TextInput, described } from "@/components/ui/field";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { Page, PageHeader } from "@/components/ui/page";

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
  const problems = (list: typeof diagnostics) => (
    <ul className="mt-2 flex flex-col gap-1 text-caption">
      {list.map((d, i) => (
        <li key={i} className="flex flex-wrap gap-x-2">
          <span className="font-mono text-muted">{d.pointer || "/"}</span>
          <span>{d.message}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <Page width="form">
      <PageHeader
        crumbs={[
          { label: "Adventures", href: "/adventures" },
          { label: draft.title, href: `/adventures/${draftId}/edit` },
        ]}
        title="Publish"
        status={draft.last_published_version ? <Badge tone="success">{`Published ${draft.last_published_version}`}</Badge> : <Badge>Not published</Badge>}
        description={`${draft.last_published_version ? `Last published: ${draft.last_published_version}.` : "Not published yet."} Suggested: a ${s.increment} version (${s.why}).`}
      />
      <div className="flex flex-col gap-6">
        {errors.length > 0 ? (
          <Notice tone="danger" title={`Fix ${errors.length} problem${errors.length === 1 ? "" : "s"} to publish.`}>
            {problems(errors.slice(0, 20))}
            <ButtonLink href={`/adventures/${draftId}/edit`} size="sm" className="mt-3">
              Open the editor
            </ButtonLink>
          </Notice>
        ) : (
          <FieldGroup legend="New version">
            <ActionForm action={publishDraftAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="draft_id" value={draftId} />
              <Field id="publish-version" className="sm:max-w-xs" label="Version" hint="Major, minor, and patch, such as 1.2.0.">
                <TextInput {...described("publish-version", { hint: true })} name="version" required defaultValue={next(draft.last_published_version, s.increment)} pattern="\d+\.\d+\.\d+" className="max-w-40 font-mono text-code" />
              </Field>
              <Button type="submit" variant="primary" icon={<Upload {...ICON_DENSE} />} className="h-10">
                Publish
              </Button>
            </ActionForm>
          </FieldGroup>
        )}
        {warnings.length > 0 && (
          <Notice tone="warning" title={`${warnings.length} warning${warnings.length === 1 ? "" : "s"}; publishing is allowed.`}>
            {problems(warnings)}
          </Notice>
        )}
        <p className="text-caption text-muted">A published adventure is usable only in campaigns you create; players reach it by invitation.</p>
      </div>
    </Page>
  );
}
