// Invitation (app-flow.md, Route map: campaign title, inviter, message; Accept and Decline after
// sign-in; Redirect rules: an expired, revoked, or used code shows the reason and a link to /dashboard).
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { previewInvitation } from "@/lib/api/invitations";
import { acceptInvitationAction, declineInvitationAction } from "@/lib/server/campaign-actions";
import { orNotFound } from "@/lib/server/pages";
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
  const invitation = await orNotFound(previewInvitation(serverStore(), decodeURIComponent(code)));
  const step = invitation.status === "pending" ? await nextStep(`/invite/${code}`) : null;
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">{invitation.campaign_title}</h1>
      <p className="mt-2">{invitation.inviter_display_name} invites you to play.</p>
      {invitation.message && <blockquote className="mt-4 border-l-2 border-accent-line pl-4 italic">{invitation.message}</blockquote>}
      {invitation.status !== "pending" ? (
        <p className="mt-6">
          {REASONS[invitation.status]}{" "}
          <Link href="/dashboard" className="text-accent underline">
            Go to the dashboard
          </Link>
          .
        </p>
      ) : step ? (
        <p className="mt-6">
          <Link href={step.href} className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
            {step.label}
          </Link>
        </p>
      ) : (
        <div className="mt-6 flex gap-3">
          <ActionForm action={acceptInvitationAction}>
            <input type="hidden" name="code" value={decodeURIComponent(code)} />
            <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
              Accept
            </button>
          </ActionForm>
          <ActionForm action={declineInvitationAction}>
            <input type="hidden" name="code" value={decodeURIComponent(code)} />
            <button type="submit" className="rounded-control border border-border px-4 py-2 font-ui text-control">
              Decline
            </button>
          </ActionForm>
        </div>
      )}
      {invitation.status === "pending" && <p className="mt-4 font-ui text-caption text-muted">Expires {new Date(invitation.expires_at).toUTCString()}.</p>}
    </div>
  );
}
