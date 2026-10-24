// The terms gate (api.md, Conventions; app-flow.md, Route map): until the user accepts the current
// Terms of Service and Privacy Policy, signed-in pages send them here.
import Link from "next/link";
import { Check, Download, FileText, RotateCcw, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { TERMS_VERSION } from "@/lib/api/terms";
import { termsCurrent } from "@/lib/api/users";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { Page, PageHeader } from "@/components/ui/page";
import { acceptTermsAction } from "@/lib/server/actions";
import { restoreAccountAction } from "@/lib/server/account-actions";
import { safeNext } from "@/lib/server/forms";
import { sessionUser } from "@/lib/server/session";

export default async function AcceptTerms({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const user = await sessionUser();
  if (user?.status === "closing") {
    const until = new Date(Date.parse(user.deletion_requested_at!) + 30 * 86_400_000);
    return (
      <Page width="form">
        <PageHeader title="Your account is being deleted" status={<Badge tone="warning">Closing</Badge>} />
        <Card className="flex flex-col gap-4 sm:p-6">
          <p>You can restore it until {until.toUTCString().slice(0, 16)}. It is erased within 90 days of the deletion.</p>
          <ActionForm action={restoreAccountAction} className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" icon={<RotateCcw {...ICON_DENSE} />}>
              Restore my account
            </Button>
            <a href="/v1/me/export.zip" className={buttonClass("secondary")}>
              <Download {...ICON_DENSE} />
              Export my data
            </a>
          </ActionForm>
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
      <Card className="flex flex-col gap-5 sm:p-6">
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
        <form action={acceptTermsAction} className="border-t border-rule pt-5">
          <input type="hidden" name="version" value={TERMS_VERSION} />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="primary" icon={<Check {...ICON_DENSE} />}>
            Accept and continue
          </Button>
        </form>
      </Card>
    </Page>
  );
}
