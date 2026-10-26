// The terms gate (api.md, Conventions; app-flow.md, Route map): until the user accepts the current
// Terms of Service and Privacy Policy, signed-in pages send them here.
import Link from "next/link";
import { Check, FileText, RotateCcw, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { TERMS_VERSION } from "@/lib/api/terms";
import { CONTACT } from "@/lib/legal";
import { termsCurrent } from "@/lib/api/users";
import { ActionForm } from "@/components/action-form";
import { ExportData } from "@/components/settings/export";
import { formatWhen } from "@/components/when";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { Page, PageHeader } from "@/components/ui/page";
import { acceptTermsAction } from "@/lib/server/actions";
import { restoreAccountAction } from "@/lib/server/account-actions";
import { safeNext } from "@/lib/server/forms";
import { requestTime } from "@/lib/server/pages";
import { sessionUser } from "@/lib/server/session";

export default async function AcceptTerms({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const user = await sessionUser();
  if (user?.status === "closing") {
    const requested = Date.parse(user.deletion_requested_at!);
    const until = new Date(requested + 30 * 86_400_000).toISOString();
    const erased = new Date(requested + 90 * 86_400_000).toISOString();
    const restorable = requestTime() < Date.parse(until);
    return (
      <Page width="form">
        <PageHeader title="Your account is being deleted" status={<Badge tone="warning">Closing</Badge>} />
        <Card className="flex flex-col gap-4">
          {restorable ? (
            <p>
              You can restore it until {formatWhen(until, user.timezone)}. It is erased by {formatWhen(erased, user.timezone)}.
            </p>
          ) : (
            <p>It can no longer be restored. It is erased by {formatWhen(erased, user.timezone)}; until then you can export your data.</p>
          )}
          <div className="flex flex-wrap items-start gap-3">
            {restorable && (
              <ActionForm action={restoreAccountAction}>
                <Button type="submit" variant="primary" icon={<RotateCcw {...ICON_DENSE} />}>
                  Restore my account
                </Button>
              </ActionForm>
            )}
            <ExportData />
          </div>
        </Card>
      </Page>
    );
  }
  if (user?.status === "active" && user.suspended_at) {
    const contact = process.env.CONTACT_EMAIL || CONTACT;
    return (
      <Page width="form">
        <PageHeader title="Your account is suspended" status={<Badge tone="danger">Suspended</Badge>} />
        <Card className="flex flex-col gap-4">
          <p>
            The operators suspended this account. You can still export your data. To ask about the suspension, write to{" "}
            <a href={`mailto:${contact}`} className="font-medium text-accent underline">
              {contact}
            </a>
            .
          </p>
          <div>
            <ExportData />
          </div>
        </Card>
      </Page>
    );
  }
  if (!user || user.status !== "active") {
    return (
      <Page width="form">
        <PageHeader title="Account closed" />
        <Notice tone="warning">This account has been deleted.</Notice>
      </Page>
    );
  }
  if (termsCurrent(user)) redirect(next);
  const changed = Boolean(user.terms_accepted_at);
  return (
    <Page width="form">
      <PageHeader title={changed ? "The terms have changed" : "Before you play"} description={changed ? "New versions of the Terms of Service and Privacy Policy are in effect." : undefined} />
      <Card className="flex flex-col gap-5">
        <p>Read the Terms of Service and the Privacy Policy. Accept them to continue.</p>
        <ul className="flex flex-col gap-2">
          <li>
            <Link href="/terms" className="inline-flex items-center gap-2 font-medium text-accent underline">
              <FileText {...ICON_DENSE} />
              Terms of Service
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="inline-flex items-center gap-2 font-medium text-accent underline">
              <ShieldCheck {...ICON_DENSE} />
              Privacy Policy
            </Link>
          </li>
        </ul>
        <ActionForm action={acceptTermsAction} className="border-t border-rule pt-5">
          <input type="hidden" name="version" value={TERMS_VERSION} />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="primary" icon={<Check {...ICON_DENSE} />}>
            Accept and continue
          </Button>
        </ActionForm>
      </Card>
    </Page>
  );
}
