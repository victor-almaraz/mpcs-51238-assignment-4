// Adventure editor (app-flow.md, Route map: /adventures/[draftId]/edit; draft owner only).
import { Editor } from "@/components/editor/editor";
import type { Doc } from "@/components/editor/doc";
import { getDraft, requiredSettings } from "@/lib/api/drafts";
import { editorReferences } from "@/lib/api/editor";
import { orNotFound } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

export default async function Edit({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const user = await pageUser();
  const store = serverStore();
  const draft = await orNotFound(getDraft(store, user.id, draftId));
  const refs = await editorReferences(store, user.id, draftId);
  const settings = await requiredSettings(store, draft.document);
  return <Editor draftId={draft.id} revision={draft.revision} document={draft.document as unknown as Doc} diagnostics={draft.diagnostics} refs={refs} settings={settings} />;
}
