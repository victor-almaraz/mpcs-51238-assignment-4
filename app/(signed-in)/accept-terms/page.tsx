// The terms gate (api.md, Conventions; app-flow.md, Route map): until the user accepts the current
// Terms of Service and Privacy Policy, signed-in pages send them here.
import Link from "next/link";
import { redirect } from "next/navigation";
import { TERMS_VERSION } from "@/lib/api/terms";
import { termsCurrent } from "@/lib/api/users";
import { ActionForm } from "@/components/action-form";
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
      <div className="mx-auto max-w-page px-6 py-10">
        <h1 className="font-display text-title">Your account is being deleted</h1>
        <p className="mt-4">
          You can restore it until {until.toUTCString().slice(0, 16)}. It is erased within 90 days of the deletion.{" "}
          <a href="/v1/me/export.zip" className="text-accent underline">
            Export my data
          </a>
        </p>
        <ActionForm action={restoreAccountAction} className="mt-6">
          <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
            Restore my account
          </button>
        </ActionForm>
      </div>
    );
  }
  if (!user || user.status !== "active") {
    return (
      <div className="mx-auto max-w-page px-6 py-10">
        <h1 className="font-display text-title">Account closed</h1>
        <p className="mt-4">This account has been deleted.</p>
      </div>
    );
  }
  if (termsCurrent(user)) redirect(next);
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">{user.terms_accepted_at ? "The terms have changed" : "Before you play"}</h1>
      <p className="mt-4">
        Read the{" "}
        <Link href="/terms" className="text-accent underline">
          Terms of Service
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="text-accent underline">
          Privacy Policy
        </Link>
        . Accept them to continue.
      </p>
      <form action={acceptTermsAction} className="mt-6">
        <input type="hidden" name="version" value={TERMS_VERSION} />
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
          Accept and continue
        </button>
      </form>
    </div>
  );
}
