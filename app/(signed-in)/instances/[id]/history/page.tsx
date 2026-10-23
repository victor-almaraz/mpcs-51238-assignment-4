// History (app-flow.md, History): commits in ascending version order with narration, grouped by round;
// event details expand per commit; pages with after_version.
import Link from "next/link";
import { getHistory, getInstance } from "@/lib/api/instances";
import { serverDeps } from "@/lib/server/coordinator";
import { orNotFound } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";

export default async function History({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ after?: string }> }) {
  const { id } = await params;
  const after = Math.max(0, Number((await searchParams).after ?? 0) || 0);
  const user = await pageUser();
  const deps = serverDeps();
  const { instance } = await orNotFound(getInstance(deps, user.id, { instance_id: id }));
  const page = await getHistory(deps.store, user.id, { instance_id: id, after_version: after, limit: 50 });
  const names = new Map(instance.characters.map((c) => [c.id, c.name]));
  // Group by round: a commit that starts a round opens a new group.
  const groups: { round: number | null; items: typeof page.items }[] = [];
  for (const item of page.items) {
    const started = item.events.find((e) => e.type === "round_started") as { number?: number } | undefined;
    if (!groups.length || started) groups.push({ round: started?.number ?? null, items: [] });
    groups.at(-1)!.items.push(item);
  }
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <Link href={`/instances/${id}`} className="font-ui text-caption text-muted">
        {instance.name}
      </Link>
      <h1 className="font-display text-title">History</h1>
      <p className="mt-1 font-ui text-caption text-muted">
        {instance.status}
        {instance.ending ? ` · ${instance.ending}` : ""} · version {instance.version}
      </p>
      {page.items.length === 0 && <p className="mt-6 text-muted">Nothing has happened yet.</p>}
      {groups.map((g, n) => (
        <section key={n} className="mt-6">
          {g.round !== null && <h2 className="font-ui text-label">Round {g.round}</h2>}
          {g.items.map((item) => (
            <article key={item.version} className="mt-3">
              {item.actor_id && <p className="pl-4 font-ui text-label text-muted">{names.get(item.actor_id) ?? "Former player"}</p>}
              {item.narration ? <p>{item.narration.text}</p> : <p className="font-ui text-caption text-muted">No narration.</p>}
              <details className="mt-1 font-ui text-caption">
                <summary className="cursor-pointer text-muted">Version {item.version}: {item.events.length} events</summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-code">{item.events.map((e) => JSON.stringify(e)).join("\n")}</pre>
              </details>
            </article>
          ))}
        </section>
      ))}
      <nav className="mt-8 flex gap-4 font-ui text-control">
        {after > 0 && (
          <Link href={`?after=${Math.max(0, after - 50)}`} className="text-accent">
            Earlier
          </Link>
        )}
        {page.next_after_version !== null && (
          <Link href={`?after=${page.next_after_version}`} className="text-accent">
            Later
          </Link>
        )}
      </nav>
    </div>
  );
}
