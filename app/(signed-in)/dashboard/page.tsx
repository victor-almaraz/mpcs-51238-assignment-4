// Dashboard (app-flow.md, "Dashboard"; design/screens.md, Dashboard): titled lists, one line per row.
// Sections fill in as their operations land: sessions (sprint 18), instances and campaigns (sprint 12).
import Link from "next/link";
import { listCharacters } from "@/lib/api/characters";
import { systemView } from "@/lib/api/systems";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const PENDING = [
  { title: "Upcoming sessions", empty: "No sessions scheduled." },
  { title: "Active instances", empty: "No instances in progress." },
  { title: "Campaigns", empty: "No campaigns yet." },
];

export default async function Dashboard() {
  const user = await pageUser();
  const characters = await listCharacters(serverStore(), user.id, { limit: 100 });
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">{user.display_name}&rsquo;s dashboard</h1>
      {PENDING.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="font-display text-heading">{s.title}</h2>
          <p className="mt-2 text-muted">{s.empty}</p>
        </section>
      ))}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-heading">Characters</h2>
          {characters.items.length > 0 && (
            <Link href="/characters/new" className="font-ui text-control text-accent">
              New character
            </Link>
          )}
        </div>
        {characters.items.length === 0 ? (
          <p className="mt-2 text-muted">
            No characters yet. <Link href="/characters/new" className="text-accent underline">Create a character</Link>.
          </p>
        ) : (
          <ul className="mt-2">
            {characters.items.map((c) => (
              <li key={c.id} className="border-b border-rule py-1">
                <Link href={`/characters/${c.id}`} className="text-accent">
                  {c.name}
                </Link>
                <span className="ml-2 font-ui text-caption text-muted">
                  {systemView(c.system).title} {String(c.sheet.role)} · {c.status === "in_instance" ? "in an instance" : c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
