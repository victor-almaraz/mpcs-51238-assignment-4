import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { TriangleAlert } from "lucide-react";
import { MainNav, MobileMenu, UtilityLinks } from "@/components/app-nav";
import { buttonClass } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { demoMode } from "@/lib/server/demo";
import { THEME_SCRIPT } from "@/components/settings/theme-script";
import { shutdownPhase } from "@/lib/ops/shutdown";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cadmium",
  // Hidden from search engines until launch; see also app/robots.ts and next.config.ts.
  robots: { index: false, follow: false },
};

function ShutdownBanner() {
  // From 14 days before SHUTDOWN_AT, every page states the date and links to the export.
  const s = shutdownPhase(process.env.SHUTDOWN_AT, new Date());
  if (s.phase !== "notice") return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-warning bg-warning-soft px-4 py-2 text-body sm:px-6">
      <TriangleAlert size={18} aria-hidden="true" className="shrink-0 text-warning" />
      <p>
        Cadmium closes on {s.at.toUTCString().slice(0, 16)}.{" "}
        <a href="/v1/me/export.zip" className="font-medium text-accent underline">
          Export my data
        </a>
      </p>
    </div>
  );
}

/** The signed-in top bar: destinations, notifications, settings, and the account. */
function SignedInBar({ demo }: { demo?: boolean }) {
  return (
    <>
      <MainNav />
      <div className="ml-auto flex items-center gap-1">
        <UtilityLinks />
        {demo ? (
          <span title="Demo mode" className="ml-2 inline-flex size-8 items-center justify-center rounded-full bg-accent-soft text-caption font-semibold text-accent">
            VL
          </span>
        ) : (
          <span className="ml-2 inline-flex">
            <UserButton />
          </span>
        )}
        <MobileMenu />
      </div>
    </>
  );
}

/** Clerk around the page, except in demo mode, where no Clerk script loads. */
function Auth({ children }: { children: ReactNode }) {
  if (demoMode()) return <>{children}</>;
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" telemetry={false}>
      {children}
    </ClerkProvider>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-desk font-ui text-body text-ink">
        <Auth>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-control focus:bg-page focus:px-3 focus:py-2">
            Skip to content
          </a>
          <header className="sticky top-0 z-40 border-b border-rule bg-page">
            <div className="flex h-[var(--size-topbar)] items-center gap-4 px-4 sm:px-6">
              <Link href="/" aria-label="Cadmium home" className="rounded-control">
                <Logo />
              </Link>
              {demoMode() ? (
                <SignedInBar demo />
              ) : (
                <>
                  <Show when="signed-in">
                    <SignedInBar />
                  </Show>
                  <Show when="signed-out">
                    <div className="ml-auto flex items-center gap-2">
                      <SignInButton>
                        <button type="button" className={buttonClass("quiet")}>
                          Sign in
                        </button>
                      </SignInButton>
                      <SignUpButton>
                        <button type="button" className={buttonClass("primary")}>
                          Sign up
                        </button>
                      </SignUpButton>
                    </div>
                  </Show>
                </>
              )}
            </div>
          </header>
          <ShutdownBanner />
          <main id="main" className="flex-1">
            {children}
          </main>
          <footer className="border-t border-rule bg-page">
            <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-4 text-caption text-muted sm:px-6">
              <Link href="/terms" className="hover:text-ink">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-ink">
                Privacy
              </Link>
              <Link href="/attribution" className="hover:text-ink">
                Attribution
              </Link>
            </div>
          </footer>
        </Auth>
      </body>
    </html>
  );
}
