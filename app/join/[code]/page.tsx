// Join by link (app-flow.md, Route map: campaign title and author; Join).
import { Check, Link2, LogIn } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Standalone } from "@/components/ui/standalone";
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
    <Standalone icon={<Link2 {...ICON} />} eyebrow="Invite link" title={link.campaign_title} description={`A campaign by ${link.author_display_name}.`} footer="Joining makes you a player in this campaign.">
      {step ? (
        <div>
          <ButtonLink href={step.href} variant="primary" icon={<LogIn {...ICON_DENSE} />}>
            {step.label}
          </ButtonLink>
        </div>
      ) : (
        <ActionForm action={joinByLinkAction}>
          <input type="hidden" name="code" value={decodeURIComponent(code)} />
          <Button type="submit" variant="primary" icon={<Check {...ICON_DENSE} />}>
            Join
          </Button>
        </ActionForm>
      )}
    </Standalone>
  );
}
