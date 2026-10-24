// The demo index (lib/server/demo.ts): every screen, with the seeded world's ids, for screenshots and
// design review. Served at / in demo mode only.
import Link from "next/link";
import { demoWorld } from "@/lib/server/demo-store";

export async function DemoIndex() {
  const w = await demoWorld();
  const groups: [string, [string, string][]][] = [
    ["Home", [["Dashboard", "/dashboard"], ["Notifications", "/notifications"], ["Settings", "/settings"], ["Accept terms", "/accept-terms"]]],
    ["Characters", [["New character", "/characters/new"], ["New character, Cadmium for a campaign", `/characters/new?system=cadmium&campaign=${w.campaign}`], ["Character: Wren Halloway", `/characters/${w.character}`]]],
    ["Campaigns", [["New campaign", "/campaigns/new"], ["Campaign: The Sunken Archive", `/campaigns/${w.campaign}`], ["Campaign editor", `/campaigns/${w.campaign}/edit`]]],
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
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">Demo screens</h1>
      <p className="mt-2 font-ui text-caption text-muted">Signed in as the demo user against an in-memory database. Nothing here reaches Supabase, Realtime, or Groq.</p>
      {groups.map(([title, links]) => (
        <section key={title} className="mt-6">
          <h2 className="font-ui text-label">{title}</h2>
          <ul className="mt-1 flex flex-col gap-1">
            {links.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="text-accent underline">
                  {label}
                </Link>{" "}
                <span className="font-mono text-caption text-muted">{href}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
