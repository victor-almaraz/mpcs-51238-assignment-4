// The demo index (lib/server/demo.ts): every screen, with the seeded world's ids, for screenshots and
// design review. Served at / in demo mode only.
import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, Castle, Gamepad2, Globe, House, Mail, ShieldCheck, Users } from "lucide-react";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { Page, PageHeader } from "@/components/ui/page";
import { demoWorld } from "@/lib/server/demo-store";

const ICONS: Record<string, ReactNode> = {
  Home: <House {...ICON_DENSE} />,
  Characters: <Users {...ICON_DENSE} />,
  Campaigns: <Castle {...ICON_DENSE} />,
  Games: <Gamepad2 {...ICON_DENSE} />,
  Adventures: <BookOpen {...ICON_DENSE} />,
  Invitations: <Mail {...ICON_DENSE} />,
  Operator: <ShieldCheck {...ICON_DENSE} />,
  Public: <Globe {...ICON_DENSE} />,
};

export async function DemoIndex() {
  const w = await demoWorld();
  const groups: [string, [string, string][]][] = [
    ["Home", [["Dashboard", "/dashboard"], ["Notifications", "/notifications"], ["Settings", "/settings"], ["Accept terms", "/accept-terms"]]],
    ["Characters", [["Characters", "/characters"], ["New character", "/characters/new"], ["New character, Cadmium for a campaign", `/characters/new?system=cadmium&campaign=${w.campaign}`], ["Character: Wren Halloway", `/characters/${w.character}`]]],
    ["Campaigns", [["Campaigns", "/campaigns"], ["New campaign", "/campaigns/new"], ["Campaign: The Sunken Archive", `/campaigns/${w.campaign}`], ["Campaign editor", `/campaigns/${w.campaign}/edit`]]],
    [
      "Games",
      [
        ["Lobby: Sunday one-shot", `/instances/${w.lobby}`],
        ["Game: Thursday table", `/instances/${w.game}`],
        ["Play", `/instances/${w.game}/play`],
        ["Schedule", `/instances/${w.game}/schedule`],
        ["History", `/instances/${w.game}/history`],
      ],
    ],
    ["Adventures", [["Adventures", "/adventures"], ["New adventure", "/adventures/new"], ...(w.draft ? ([["Editor: The Sunken Archive", `/adventures/${w.draft}/edit`], ["Publish", `/adventures/${w.draft}/publish`]] as [string, string][]) : [])]],
    ["Invitations", [["Invitation", `/invite/${w.invitation}`], ["Invite link", `/join/${w.link}`]]],
    ["Operator", [["Operator console", "/admin"]]],
    ["Public", [["Terms", "/terms"], ["Privacy", "/privacy"], ["Attribution", "/attribution"], ["Closed notice", "/closed"], ["Sign in", "/sign-in"], ["Sign up", "/sign-up"]]],
  ];
  return (
    <Page>
      <PageHeader title="Demo screens" description="Signed in as the demo user against an in-memory database. Nothing here reaches Supabase, Realtime, or Groq." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(([title, links]) => (
          <section key={title} aria-labelledby={`demo-${title}`} className="rounded-card border border-rule bg-page">
            <h2 id={`demo-${title}`} className="flex items-center gap-2 border-b border-rule px-4 py-3 text-heading font-semibold text-ink">
              <span className="text-muted">{ICONS[title]}</span>
              {title}
            </h2>
            <ul className="flex flex-col py-1">
              {links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="group flex flex-col px-4 py-2 hover:bg-accent-soft/50">
                    <span className="font-medium text-accent group-hover:underline">{label}</span>
                    <span className="truncate font-mono text-caption text-muted">{href}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  );
}
