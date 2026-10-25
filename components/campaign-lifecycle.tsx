// Archiving, unarchiving, deleting, and restoring a campaign (api.md, Campaigns; SPEC_ISSUES.md#campaign-unarchive).
// Archiving keeps everything and stops new games, members, and invitations. Deleting ends the campaign's
// games and hides it from every member at once; its author can restore it for 30 days, and it is
// erased with its games within 90 days, or with the author's account.
import { ArchiveRestore, RotateCcw, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, TextInput, described } from "@/components/ui/field";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { archiveCampaignAction, deleteCampaignAction, restoreCampaignAction, unarchiveCampaignAction } from "@/lib/server/campaign-actions";

export const ARCHIVE_NOTE = "An archived campaign keeps its games and members, and accepts no new games, members, or invitations.";

export function ArchiveForm({ campaignId }: { campaignId: string }) {
  return (
    <ActionForm action={archiveCampaignAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <p className="text-muted">{ARCHIVE_NOTE} You can unarchive it at any time.</p>
      <Button type="submit" variant="secondary" className="shrink-0">
        Archive campaign
      </Button>
    </ActionForm>
  );
}

export function UnarchiveForm({ campaignId, title }: { campaignId: string; title?: string }) {
  return (
    <ActionForm action={unarchiveCampaignAction}>
      <input type="hidden" name="campaign_id" value={campaignId} />
      <Button type="submit" size="sm" icon={<ArchiveRestore {...ICON_DENSE} />} aria-label={title ? `Unarchive ${title}` : undefined}>
        Unarchive
      </Button>
    </ActionForm>
  );
}

export function RestoreForm({ campaignId, title }: { campaignId: string; title: string }) {
  return (
    <ActionForm action={restoreCampaignAction}>
      <input type="hidden" name="campaign_id" value={campaignId} />
      <Button type="submit" size="sm" icon={<RotateCcw {...ICON_DENSE} />} aria-label={`Restore ${title}`}>
        Restore
      </Button>
    </ActionForm>
  );
}

/** The archived state, with Unarchive for the author. */
export function ArchivedNotice({ campaignId, author }: { campaignId: string; author: boolean }) {
  return (
    <Notice title="This campaign is archived">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{ARCHIVE_NOTE}</p>
        {author && <UnarchiveForm campaignId={campaignId} />}
      </div>
    </Notice>
  );
}

/** Delete campaign, confirmed by typing its title (api.md, delete_campaign: `confirm`). */
export function DeleteCampaignForm({ campaignId, title }: { campaignId: string; title: string }) {
  const id = "delete-campaign-confirm";
  return (
    <ActionForm action={deleteCampaignAction} className="flex flex-col gap-4">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <p className="text-ink">
        Its games end, and every member loses access at once. You can restore it from the Campaigns page for 30 days. Within 90 days it is erased with its games and invitations.
      </p>
      <Field id={id} label={`Type the campaign's title, ${title}, to confirm`}>
        <TextInput {...described(id)} name="confirm" required autoComplete="off" />
      </Field>
      <div>
        <Button type="submit" variant="danger" icon={<Trash2 {...ICON_DENSE} />}>
          Delete campaign
        </Button>
      </div>
    </ActionForm>
  );
}
