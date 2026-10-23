// Dashboard (app-flow.md, "Dashboard"; design/screens.md, Dashboard): titled lists, one line per row.
// Adventures arrive with the editor (sprint 16).
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { listCampaigns } from "@/lib/api/campaigns";
import { listCharacters } from "@/lib/api/characters";
import { listInstances } from "@/lib/api/instances";
import { listOccurrences } from "@/lib/api/schedules";
import { formatWhen } from "@/components/when";
import { rsvpAction } from "@/lib/server/schedule-actions";
import { systemView } from "@/lib/api/systems";
import { enterCodeAction } from "@/lib/server/campaign-actions";
import { requestTime } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const row = "border-b border-rule py-1";
const meta = "ml-2 font-ui text-caption text-muted";

function Heading({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-display text-heading">{title}</h2>
      {href && (
        <Link href={href} className="font-ui text-control text-accent">
          {action}
        </Link>
      )}
    </div>
  );
}

export default async function Dashboard() {
  const user = await pageUser();
  const store = serverStore();
  const [characters, campaigns] = await Promise.all([listCharacters(store, user.id, { limit: 100 }), listCampaigns(store, user.id, { archived: false, limit: 100 })]);
  const instances = (await Promise.all(campaigns.items.map((c) => listInstances(store, user.id, c.id).then((list) => list.map((i) => ({ ...i, campaign: c.title })))))).flat();
  const active = instances.filter((i) => i.status !== "ended");
  const finished = instances.filter((i) => i.status === "ended");
  const where = new Map(instances.map((i) => [i.id, i.name]));
  const authored = campaigns.items.filter((c) => c.author_id === user.id);
  // The next 7 days across all instances (app-flow.md, Dashboard: Upcoming sessions).
  const now = requestTime();
  const window = { from: new Date(now).toISOString(), to: new Date(now + 7 * 86_400_000).toISOString() };
  const sessions = await Promise.all(active.map((i) => listOccurrences(store, user.id, { instance_id: i.id, ...window }).then((list) => list.map((o) => ({ ...o, instance: i })))));
  const upcoming = sessions.flat().filter((o) => o.status !== "cancelled").sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const joined = campaigns.items.filter((c) => c.author_id !== user.id);

  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">{user.display_name}&rsquo;s dashboard</h1>

      <section className="mt-8">
        <Heading title="Upcoming sessions" />
        {upcoming.length === 0 ? (
          <p className="mt-2 text-muted">No sessions in the next 7 days.</p>
        ) : (
          <ul className="mt-2">
            {upcoming.map((o) => {
              const mine = (["yes", "no", "maybe"] as const).find((r) => o.rsvps[r].includes(user.id));
              return (
                <li key={`${o.session_id}:${o.occurrence_start}`} className={`${row} flex flex-wrap items-baseline justify-between gap-2`}>
                  <span>
                    {formatWhen(o.starts_at, user.timezone)}{" "}
                    <Link href={`/instances/${o.instance.id}/schedule`} className="text-accent">
                      {o.instance.name}
                    </Link>
                    <span className={meta}>
                      {o.instance.campaign}
                      {o.status === "moved" ? " · moved" : ""}
                    </span>
                  </span>
                  <span className="flex gap-3">
                    {(["yes", "maybe", "no"] as const).map((r) => (
                      <ActionForm key={r} action={rsvpAction}>
                        <input type="hidden" name="instance_id" value={o.instance.id} />
                        <input type="hidden" name="session_id" value={o.session_id} />
                        <input type="hidden" name="occurrence_start" value={o.occurrence_start} />
                        <input type="hidden" name="response" value={r} />
                        <button type="submit" aria-pressed={mine === r} className={`font-ui text-caption ${mine === r ? "text-accent underline" : "text-accent"}`}>
                          {r[0]!.toUpperCase() + r.slice(1)}
                        </button>
                      </ActionForm>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <Heading title="Active instances" />
        {active.length === 0 ? (
          <p className="mt-2 text-muted">No instances in progress.</p>
        ) : (
          <ul className="mt-2">
            {active.map((i) => {
              const mine = i.characters.filter((c) => c.user_id === user.id).map((c) => c.name);
              return (
                <li key={i.id} className={row}>
                  <Link href={`/instances/${i.id}`} className="text-accent">
                    {i.name}
                  </Link>
                  <span className={meta}>
                    {i.campaign} · {i.status}
                    {mine.length > 0 && ` · ${mine.join(", ")}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {finished.length > 0 && (
        <section className="mt-8">
          <Heading title="Finished" />
          <ul className="mt-2">
            {finished.map((i) => (
              <li key={i.id} className={row}>
                <Link href={`/instances/${i.id}/history`} className="text-accent">
                  {i.name}
                </Link>
                <span className={meta}>{i.campaign}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <Heading title="Campaigns" href="/campaigns/new" action="New campaign" />
        {campaigns.items.length === 0 && (
          <p className="mt-2 text-muted">
            No campaigns yet.{" "}
            <Link href="/campaigns/new" className="text-accent underline">
              Create a campaign
            </Link>
            , or enter a code you were given.
          </p>
        )}
        {[
          { title: "You run", list: authored },
          { title: "You play", list: joined },
        ].map(
          (group) =>
            group.list.length > 0 && (
              <div key={group.title} className="mt-3">
                <h3 className="font-ui text-label">{group.title}</h3>
                <ul>
                  {group.list.map((c) => (
                    <li key={c.id} className={row}>
                      <Link href={`/campaigns/${c.id}`} className="text-accent">
                        {c.title}
                      </Link>
                      <span className={meta}>
                        {c.instance_ids.length} instance{c.instance_ids.length === 1 ? "" : "s"} · {c.members.length - 1} player{c.members.length === 2 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
        <ActionForm action={enterCodeAction} className="mt-4 flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-ui text-label">Invitation or invite link code</span>
            <input name="code" required className="rounded-control border border-border bg-page px-2 py-1 font-mono text-code" />
          </label>
          <button type="submit" className="rounded-control border border-border px-4 py-2 font-ui text-control">
            Open
          </button>
        </ActionForm>
      </section>

      <section className="mt-8">
        <Heading title="Characters" href={characters.items.length > 0 ? "/characters/new" : undefined} action="New character" />
        {characters.items.length === 0 ? (
          <p className="mt-2 text-muted">
            No characters yet.{" "}
            <Link href="/characters/new" className="text-accent underline">
              Create a character
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-2">
            {characters.items.map((c) => (
              <li key={c.id} className={row}>
                <Link href={`/characters/${c.id}`} className="text-accent">
                  {c.name}
                </Link>
                <span className={meta}>
                  {systemView(c.system).title} {String(c.sheet.role)} · {c.instance_id ? `in ${where.get(c.instance_id) ?? "an instance"}` : c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
