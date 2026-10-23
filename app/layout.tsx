import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cadmium",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-page font-prose text-prose text-ink">
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
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
                <UserButton />
              </Show>
            </nav>
          </header>
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
