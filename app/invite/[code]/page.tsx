// Invitation (app-flow.md, Route map: campaign title, inviter, message; Accept and Decline after
// sign-in; Redirect rules: an expired, revoked, or used code shows the reason and a link to /dashboard).
import { Check, LayoutDashboard, LogIn, MailOpen, X } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { Standalone } from "@/components/ui/standalone";
import { invitationContext, previewInvitation } from "@/lib/api/invitations";
import { formatWhen } from "@/components/when";
import { sessionUser } from "@/lib/server/session";
import { acceptInvitationAction, declineInvitationAction } from "@/lib/server/campaign-actions";
import { decoded, orNotFound } from "@/lib/server/pages";
import { serverStore } from "@/lib/server/supabase";
import { nextStep } from "@/lib/server/visitor";

const REASONS: Record<string, string> = {
  accepted: "This invitation has already been used.",
  declined: "This invitation was declined.",
  revoked: "This invitation was revoked.",
  expired: "This invitation has expired.",
};

export default async function Invitation({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const store = serverStore();
  const invitation = await orNotFound(previewInvitation(store, decoded(code)));
  const step = invitation.status === "pending" ? await nextStep(`/invite/${code}`) : null;
  const viewer = await sessionUser();
  const context = await invitationContext(store, viewer?.id ?? null, decoded(code));
  const expires = formatWhen(invitation.expires_at, viewer?.timezone ?? "UTC");
  return (
    <Standalone
      icon={<MailOpen {...ICON} />}
      eyebrow="Invitation"
      title={invitation.campaign_title}
      description={`${invitation.inviter_display_name} invites you to play.`}
      footer={invitation.status === "pending" ? `Expires ${expires}.` : undefined}
    >
      {invitation.message && (
        <figure className="rounded-card border-l-2 border-accent-line bg-desk px-4 py-3">
          <blockquote className="font-prose text-prose italic text-ink">{invitation.message}</blockquote>
          <figcaption className="mt-1 text-caption text-muted">{invitation.inviter_display_name}</figcaption>
        </figure>
      )}
      {invitation.status !== "pending" ? (
        <>
          <Notice tone="warning">{REASONS[invitation.status]}</Notice>
          <div>
            <ButtonLink href="/dashboard" icon={<LayoutDashboard {...ICON_DENSE} />}>
              Go to the dashboard
            </ButtonLink>
          </div>
        </>
      ) : context?.member ? (
        <>
          <Notice>You are already in this campaign.</Notice>
          <div>
            <ButtonLink href={`/campaigns/${context.campaignId}`} icon={<LayoutDashboard {...ICON_DENSE} />}>
              Open the campaign
            </ButtonLink>
          </div>
        </>
      ) : context?.archived ? (
        <>
          <Notice tone="warning">The campaign is archived, so it takes no new players. Ask {invitation.inviter_display_name} to unarchive it.</Notice>
          <div>
            <ButtonLink href="/dashboard" icon={<LayoutDashboard {...ICON_DENSE} />}>
              Go to the dashboard
            </ButtonLink>
          </div>
        </>
      ) : step ? (
        <div>
          <ButtonLink href={step.href} variant="primary" icon={<LogIn {...ICON_DENSE} />}>
            {step.label}
          </ButtonLink>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <ActionForm action={acceptInvitationAction}>
            <input type="hidden" name="code" value={decodeURIComponent(code)} />
            <Button type="submit" variant="primary" icon={<Check {...ICON_DENSE} />}>
              Accept
            </Button>
          </ActionForm>
          <ActionForm action={declineInvitationAction}>
            <input type="hidden" name="code" value={decodeURIComponent(code)} />
            <Button type="submit" icon={<X {...ICON_DENSE} />}>
              Decline
            </Button>
          </ActionForm>
        </div>
      )}
    </Standalone>
  );
}
