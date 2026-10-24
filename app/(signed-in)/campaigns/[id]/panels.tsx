// Campaign panels shared by the campaign page and the campaign editor (app-flow.md, Campaign editor:
// Members, Invitations; docs/design/README.md, Campaign): members with Remove for the author, and
// invitations (create, pending with Revoke, the invite link with Copy, Rotate, Disable).
import { Link2, Link2Off, RefreshCw, UserMinus } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { CopyButton, InviteForm } from "@/components/invite-form";
import { listInvitations } from "@/lib/api/invitations";
import { disableInviteLinkAction, removeMemberAction, revokeInvitationAction, rotateInviteLinkAction } from "@/lib/server/campaign-actions";
import { serverStore } from "@/lib/server/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { List, ListRow } from "@/components/ui/list";
import { Notice } from "@/components/ui/notice";
import { Section } from "@/components/ui/page";

interface Member {
  user_id: string;
  display_name: string;
  role: string;
}

/** The members, with Remove beside each player when the viewer is the author. */
export function MembersPanel({ campaignId, members, author }: { campaignId: string; members: Member[]; author: boolean }) {
  return (
    <Section id="members" title="Members" description={`${members.length} member${members.length === 1 ? "" : "s"}`}>
      <List>
        {members.map((m) => (
          <ListRow
            key={m.user_id}
            title={m.display_name}
            badge={<Badge tone={m.role === "author" ? "accent" : "neutral"}>{m.role}</Badge>}
            actions={
              author &&
              m.role === "player" && (
                <ActionForm action={removeMemberAction}>
                  <input type="hidden" name="campaign_id" value={campaignId} />
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <Button type="submit" variant="danger" size="sm" icon={<UserMinus {...ICON_DENSE} />}>
                    Remove<span className="sr-only"> {m.display_name}</span>
                  </Button>
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
export function InvitationsPanel({ campaignId, userId, archived, linkCode, origin }: { campaignId: string; userId: string; archived: boolean; linkCode: string | null; origin: string }) {
  return (
    <>
      <Section id="new-invitation" title="New invitation" description="A code for one player. It is shown once, when you create it.">
        {archived ? (
          <Notice>The campaign is archived.</Notice>
        ) : (
          <Card className="sm:p-6">
            <InviteForm campaignId={campaignId} origin={origin} />
          </Card>
        )}
      </Section>
      <Section id="pending-invitations" title="Pending invitations">
        <PendingInvitations campaignId={campaignId} userId={userId} />
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
              <LinkAction action={rotateInviteLinkAction} campaignId={campaignId} label="Rotate" icon={<RefreshCw {...ICON_DENSE} />} />
              <LinkAction action={disableInviteLinkAction} campaignId={campaignId} label="Disable" icon={<Link2Off {...ICON_DENSE} />} danger />
            </div>
            <p className="text-caption text-muted">Rotate replaces the link, so the old one stops working.</p>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Off</Badge>
              <span className="text-muted">Link joining is off.</span>
            </div>
            {!archived && <LinkAction action={rotateInviteLinkAction} campaignId={campaignId} label="Enable invite link" icon={<Link2 {...ICON_DENSE} />} />}
          </Card>
        )}
      </Section>
    </>
  );
}

function LinkAction({ action, campaignId, label, icon, danger }: { action: typeof rotateInviteLinkAction; campaignId: string; label: string; icon: ReactNode; danger?: boolean }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="campaign_id" value={campaignId} />
      <Button type="submit" size="sm" variant={danger ? "danger" : "secondary"} icon={icon}>
        {label}
      </Button>
    </ActionForm>
  );
}

async function PendingInvitations({ campaignId, userId }: { campaignId: string; userId: string }) {
  const pending = await listInvitations(serverStore(), userId, { campaign_id: campaignId, status: "pending" });
  if (pending.length === 0) return <EmptyState>No pending invitations.</EmptyState>;
  return (
    <List>
      {pending.map((i) => (
        <ListRow
          key={i.id}
          title={i.note || "No note"}
          badge={<Badge tone="warning">pending</Badge>}
          meta={`By ${i.inviter.display_name}, expires ${new Date(i.expires_at).toUTCString().slice(5, 16)}`}
          actions={
            <ActionForm action={revokeInvitationAction}>
              <input type="hidden" name="campaign_id" value={campaignId} />
              <input type="hidden" name="invitation_id" value={i.id} />
              <Button type="submit" variant="danger" size="sm">
                Revoke<span className="sr-only"> {i.note || "invitation"}</span>
              </Button>
            </ActionForm>
          }
        />
      ))}
    </List>
  );
}
