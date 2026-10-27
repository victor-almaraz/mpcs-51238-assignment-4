// The 404 page (app-flow.md, Redirect rules): for a route that does not exist, and for a campaign,
// game, draft, or the operator console that the visitor may not open, so it never tells the two apart.
// Signed in, it leads to the dashboard and the campaigns; signed out, to sign-in and the home page.
import { Castle, Home, LayoutDashboard, LogIn, MapPinOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Standalone } from "@/components/ui/standalone";
import { signedInId } from "@/lib/server/auth";

export default async function NotFound() {
  const signedIn = (await signedInId()) !== null;
  return (
    <Standalone
      icon={<MapPinOff {...ICON} />}
      eyebrow="Error 404"
      title="Page not found"
      description="The link may be mistyped or out of date, or the page is one you can't open from this account."
      footer={signedIn ? "If someone sent you this link for a campaign, ask them for an invitation or the invite link." : "If the page belongs to a campaign you play in, sign in to open it."}
    >
      <div className="flex flex-wrap gap-3">
        {signedIn ? (
          <>
            <ButtonLink href="/dashboard" variant="primary" icon={<LayoutDashboard {...ICON_DENSE} />}>
              Go to the dashboard
            </ButtonLink>
            <ButtonLink href="/campaigns" icon={<Castle {...ICON_DENSE} />}>
              Campaigns
            </ButtonLink>
          </>
        ) : (
          <>
            <ButtonLink href="/sign-in" variant="primary" icon={<LogIn {...ICON_DENSE} />}>
              Sign in
            </ButtonLink>
            <ButtonLink href="/" icon={<Home {...ICON_DENSE} />}>
              Home
            </ButtonLink>
          </>
        )}
      </div>
    </Standalone>
  );
}
