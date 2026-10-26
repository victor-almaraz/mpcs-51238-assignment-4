// Archiving, unarchiving, deleting, and restoring a campaign (api.md, Campaigns; SPEC_ISSUES.md#campaign-unarchive).
// Archiving keeps everything and stops new games, members, and invitations. Deleting ends the campaign's
// games and hides it from every member at once; its author can restore it for 30 days, and it is
// erased with its games within 90 days, or with the author's account.
import * as lifecycle from "@/components/lifecycle";
import { archiveCampaignAction, deleteCampaignAction, restoreCampaignAction, unarchiveCampaignAction } from "@/lib/server/campaign-actions";

export const ARCHIVE_NOTE = "An archived campaign keeps its games and members, and accepts no new games, members, or invitations.";

export function ArchiveForm({ campaignId }: { campaignId: string }) {
  return <lifecycle.ArchiveForm action={archiveCampaignAction} field="campaign_id" id={campaignId} note={ARCHIVE_NOTE} label="Archive campaign" />;
}

export function UnarchiveForm({ campaignId, title }: { campaignId: string; title?: string }) {
  return <lifecycle.UnarchiveForm action={unarchiveCampaignAction} field="campaign_id" id={campaignId} title={title} />;
}

export function RestoreForm({ campaignId, title }: { campaignId: string; title: string }) {
  return <lifecycle.RestoreForm action={restoreCampaignAction} field="campaign_id" id={campaignId} title={title} />;
}

/** The archived state, with Unarchive for the author. */
export function ArchivedNotice({ campaignId, author, className }: { campaignId: string; author: boolean; className?: string }) {
  return <lifecycle.ArchivedNotice title="This campaign is archived" note={ARCHIVE_NOTE} unarchive={author ? <UnarchiveForm campaignId={campaignId} /> : undefined} className={className} />;
}

/** Delete campaign, confirmed by typing its title (api.md, delete_campaign: `confirm`). */
export function DeleteCampaignForm({ campaignId, title }: { campaignId: string; title: string }) {
  return (
    <lifecycle.DeleteForm
      action={deleteCampaignAction}
      field="campaign_id"
      id={campaignId}
      noun="campaign"
      name={title}
      by="title"
      consequence="Its games end, and every member loses access at once. You can restore it from the Campaigns page for 30 days. Within 90 days it is erased with its games and invitations."
    />
  );
}
