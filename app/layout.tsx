import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
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
    <p className="border-b border-warning bg-warning-soft px-6 py-2 font-ui text-control">
      Cadmium closes on {s.at.toUTCString().slice(0, 16)}.{" "}
      <a href="/v1/me/export.zip" className="underline">
        Export my data
      </a>
    </p>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col bg-page font-prose text-prose text-ink">
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" telemetry={false}>
          <header className="flex items-center justify-between border-b border-rule px-6 py-3 font-ui text-control">
            <Link href="/" className="font-display text-heading">
              Cadmium
            </Link>
            <nav className="flex items-center gap-4">
              <Show when="signed-out">
                <SignInButton />
                <SignUpButton />
              </Show>
              <Show when="signed-in">
                <Link href="/dashboard">Dashboard</Link>
                <Link href="/settings">Settings</Link>
                <UserButton />
              </Show>
            </nav>
          </header>
          <ShutdownBanner />
          <main className="flex-1">{children}</main>
          <footer className="flex gap-4 border-t border-rule px-6 py-3 font-ui text-caption text-muted">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/attribution">Attribution</Link>
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}
