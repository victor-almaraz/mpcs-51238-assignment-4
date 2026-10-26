// Archiving, unarchiving, deleting, and restoring an adventure draft (api.md, Adventure drafts;
// SPEC_ISSUES.md#character-draft-archive). Archiving keeps the draft and its published versions and
// stops publishing. Deleting hides the draft at once and keeps its published versions; its owner can
// restore it for 30 days, and it is erased within 90 days, or with the owner's account.
import { Archive, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import * as lifecycle from "@/components/lifecycle";
import { ICON, IconButton } from "@/components/ui/icon-button";
import { archiveDraftAction, deleteDraftAction, restoreDraftAction, unarchiveDraftAction } from "@/lib/server/draft-actions";

export const ARCHIVE_NOTE = "An archived draft keeps its content and published versions, and cannot be published.";

/**
 * A draft row's Archive and Delete. Stacked under the title on compact screens, the row pulls them back
 * by the icon buttons' 8 px inset so the icons, not the buttons' edges, line up with the title.
 */
export function DraftActions({ draftId, title }: { draftId: string; title: string }) {
  return (
    <div className="flex items-center gap-1 max-sm:-ml-2">
      <ActionForm action={archiveDraftAction}>
        <input type="hidden" name="draft_id" value={draftId} />
        <IconButton type="submit" tip="end" label={`Archive ${title}`} icon={<Archive {...ICON} />} />
      </ActionForm>
      <ActionForm action={deleteDraftAction}>
        <input type="hidden" name="draft_id" value={draftId} />
        <IconButton type="submit" tone="danger" tip="end" label={`Delete ${title}`} icon={<Trash2 {...ICON} />} />
      </ActionForm>
    </div>
  );
}

export function UnarchiveForm({ draftId, title }: { draftId: string; title?: string }) {
  return <lifecycle.UnarchiveForm action={unarchiveDraftAction} field="draft_id" id={draftId} title={title} />;
}

export function RestoreForm({ draftId, title }: { draftId: string; title: string }) {
  return <lifecycle.RestoreForm action={restoreDraftAction} field="draft_id" id={draftId} title={title} />;
}

export function ArchivedNotice({ draftId, className }: { draftId: string; className?: string }) {
  return <lifecycle.ArchivedNotice title="This draft is archived" note={`${ARCHIVE_NOTE} Unarchive it to publish.`} unarchive={<UnarchiveForm draftId={draftId} />} className={className} />;
}
