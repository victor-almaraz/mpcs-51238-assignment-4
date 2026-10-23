// Join by link (app-flow.md, Route map: campaign title and author; Join).
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { previewInviteLink } from "@/lib/api/campaigns";
import { joinByLinkAction } from "@/lib/server/campaign-actions";
import { orNotFound } from "@/lib/server/pages";
import { serverStore } from "@/lib/server/supabase";
import { nextStep } from "@/lib/server/visitor";

export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await orNotFound(previewInviteLink(serverStore(), decodeURIComponent(code)));
  const step = await nextStep(`/join/${code}`);
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">{link.campaign_title}</h1>
      <p className="mt-2">A campaign by {link.author_display_name}.</p>
      {step ? (
        <p className="mt-6">
          <Link href={step.href} className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
            {step.label}
          </Link>
        </p>
      ) : (
        <ActionForm action={joinByLinkAction} className="mt-6">
          <input type="hidden" name="code" value={decodeURIComponent(code)} />
          <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
            Join
          </button>
        </ActionForm>
      )}
    </div>
  );
}
