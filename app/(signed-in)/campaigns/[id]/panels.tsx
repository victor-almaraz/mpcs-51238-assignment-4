// Campaign panels shared by the campaign page and the campaign editor (app-flow.md, Campaign editor:
// Members, Invitations; docs/design/README.md, Campaign): members with Remove for the author, and
// invitations (create, pending with Revoke, the invite link with Copy, Rotate, Disable).
import { Ban, Link2, Link2Off, RefreshCw, UserMinus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/ui/confirm";
import { CopyButton, InviteForm } from "@/components/invite-form";
import { listInvitations } from "@/lib/api/invitations";
import { disableInviteLinkAction, removeMemberAction, revokeInvitationAction, rotateInviteLinkAction } from "@/lib/server/campaign-actions";
import { serverStore } from "@/lib/server/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { formatWhen } from "@/components/when";
import { List, ListRow } from "@/components/ui/list";
import { Notice } from "@/components/ui/notice";
import { Section } from "@/components/ui/page";
import { plural } from "@/lib/text";

interface Member {
  user_id: string;
  display_name: string;
  role: string;
}

/** The members, with Remove beside each player when the viewer is the author. */
export function MembersPanel({ campaignId, members, author }: { campaignId: string; members: Member[]; author: boolean }) {
  return (
    <Section id="members" title="Members" description={plural(members.length, "member")}>
      <List>
        {members.map((m) => (
          <ListRow
            key={m.user_id}
            title={m.display_name}
            badge={m.role === "author" ? <Badge tone="accent">Author</Badge> : undefined}
            actions={
              author &&
              m.role === "player" && (
                <ActionForm action={removeMemberAction}>
                  <input type="hidden" name="campaign_id" value={campaignId} />
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <ConfirmButton
                    as="icon"
                    tip="end"
                    label={`Remove ${m.display_name}`}
                    icon={<UserMinus {...ICON} />}
                    title={`Remove ${m.display_name} from the campaign?`}
                    description="Their characters leave the campaign's games. They can come back with a new invitation, or through the invite link while it is on."
                    confirm="Remove"
                  />
                </ActionForm>
              )
            }
          />
        ))}
      </List>
    </Section>
  );
}

/** The author's invitations: create one, the pending list, and the invite link. */
export function InvitationsPanel({ campaignId, userId, archived, linkCode, origin, timeZone }: { campaignId: string; userId: string; archived: boolean; linkCode: string | null; origin: string; timeZone: string }) {
  return (
    <>
      <Section id="new-invitation" title="New invitation" description="A code for one player. It is shown once, when you create it.">
        {archived ? (
          <Notice>The campaign is archived.</Notice>
        ) : (
          <Card>
            <InviteForm campaignId={campaignId} origin={origin} />
          </Card>
        )}
      </Section>
      <Section id="pending-invitations" title="Pending invitations">
        <PendingInvitations campaignId={campaignId} userId={userId} timeZone={timeZone} />
      </Section>
      <Section id="invite-link" title="Invite link" description="Anyone with an enabled link can join.">
        {linkCode ? (
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="success">On</Badge>
              <span className="min-w-0 break-all font-mono text-code">
                {origin}/join/{linkCode}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={`${origin}/join/${linkCode}`} label="Copy link" />
              <ActionForm action={rotateInviteLinkAction}>
                <input type="hidden" name="campaign_id" value={campaignId} />
                <ConfirmButton size="sm" label="Rotate" icon={<RefreshCw {...ICON_DENSE} />} title="Replace the invite link?" description="The link you shared stops working at once; only the new one lets people join." confirm="Rotate link" />
              </ActionForm>
              <ActionForm action={disableInviteLinkAction}>
                <input type="hidden" name="campaign_id" value={campaignId} />
                <ConfirmButton size="sm" label="Disable" icon={<Link2Off {...ICON_DENSE} />} title="Turn the invite link off?" description="Nobody can join through the link until you enable a new one; the old link never works again." confirm="Turn off" />
              </ActionForm>
            </div>
            <p className="text-caption text-muted">Rotate replaces the link, so the old one stops working.</p>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Off</Badge>
              <span className="text-muted">Link joining is off.</span>
            </div>
            {!archived && (
              <ActionForm action={rotateInviteLinkAction}>
                <input type="hidden" name="campaign_id" value={campaignId} />
                <Button type="submit" size="sm" icon={<Link2 {...ICON_DENSE} />}>
                  Enable invite link
                </Button>
              </ActionForm>
            )}
          </Card>
        )}
      </Section>
    </>
  );
}

async function PendingInvitations({ campaignId, userId, timeZone }: { campaignId: string; userId: string; timeZone: string }) {
  const pending = await listInvitations(serverStore(), userId, { campaign_id: campaignId, status: "pending" });
  if (pending.length === 0) return <EmptyState>No pending invitations.</EmptyState>;
  return (
    <List>
      {pending.map((i) => (
        <ListRow
          key={i.id}
          title={i.note || "No note"}
          badge={<Badge tone="warning">Pending</Badge>}
          meta={`By ${i.inviter.display_name}, expires ${formatWhen(i.expires_at, timeZone)}`}
          actions={
            <ActionForm action={revokeInvitationAction}>
              <input type="hidden" name="campaign_id" value={campaignId} />
              <input type="hidden" name="invitation_id" value={i.id} />
              <ConfirmButton
                as="icon"
                tip="end"
                label={`Revoke ${i.note ? `the invitation “${i.note}”` : "this invitation"}`}
                icon={<Ban {...ICON} />}
                title="Revoke this invitation?"
                description="Its code stops working at once. You can create a new invitation later."
                confirm="Revoke"
              />
            </ActionForm>
          }
        />
      ))}
    </List>
  );
}
