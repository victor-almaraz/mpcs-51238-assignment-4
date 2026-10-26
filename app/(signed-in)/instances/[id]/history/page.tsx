// History (app-flow.md, History): commits in ascending version order with narration, grouped by round;
// event details expand per commit; pages with after_version. A detail page (docs/design/README.md,
// Game lobby, schedule, history): a filterable log, newest last, with version numbers, in the main
// column; the game's facts and the characters that played in the aside.
import { CalendarClock, ChevronLeft, ChevronRight, DoorOpen, ScrollText } from "lucide-react";
import type { AdventureBundle } from "@/lib/bundle/adventure";
import { getHistory, getInstance, instanceRoster } from "@/lib/api/instances";
import { serverDeps } from "@/lib/server/coordinator";
import { orNotFound } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/card";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { DescriptionList } from "@/components/ui/list";
import { Page, PageHeader, WithAside } from "@/components/ui/page";
import { HistoryFilter } from "./filter";
import { plural } from "@/lib/text";

export default async function History({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ after?: string }> }) {
  const { id } = await params;
  // A whole version: ?after=1.5 or a huge number would fail get_history's validation.
  const after = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number((await searchParams).after ?? 0) || 0)));
  const user = await pageUser();
  const deps = serverDeps();
  const { instance } = await orNotFound(getInstance(deps, user.id, { instance_id: id }));
  const page = await getHistory(deps.store, user.id, { instance_id: id, after_version: after, limit: 50 });
  // Every character that played, including those that have left; an erased account's are "Former player".
  const roster = await instanceRoster(deps.store, user.id, id);
  const names = new Map(roster.map((c) => [c.id, c.name]));
  const adventure = instance.materials.find((m) => m.kind === "adventure")!;
  const bundle = (await deps.store.getBundle("adventure", adventure.id, adventure.version)) as AdventureBundle | undefined;
  const ending = instance.ending ? bundle?.manifest.endings[instance.ending]?.label : undefined;
  // Group by round: a commit that starts a round opens a new group.
  const groups: { round: number | null; items: typeof page.items }[] = [];
  for (const item of page.items) {
    const started = item.events.find((e) => e.type === "round_started") as { number?: number } | undefined;
    if (!groups.length || started) groups.push({ round: started?.number ?? null, items: [] });
    groups.at(-1)!.items.push(item);
  }
  const pager = (after > 0 || page.next_after_version !== null) && (
    <nav aria-label="History pages" className="mt-8 flex flex-wrap gap-2">
      {after > 0 && (
        <ButtonLink href={`?after=${Math.max(0, after - 50)}`} size="sm" icon={<ChevronLeft {...ICON_DENSE} />}>
          Earlier
        </ButtonLink>
      )}
      {page.next_after_version !== null && (
        <ButtonLink href={`?after=${page.next_after_version}`} size="sm">
          Later
          <ChevronRight {...ICON_DENSE} />
        </ButtonLink>
      )}
    </nav>
  );
  return (
    <Page>
      <PageHeader
        crumbs={[
          { label: "Campaigns", href: "/campaigns" },
          { label: instance.name, href: `/instances/${id}` },
        ]}
        title="History"
        status={<StatusBadge status={instance.status} />}
        description="Oldest first."
      />
      <WithAside
        aside={
          <Panel title="Game">
            <DescriptionList
              items={[
                ["Version", <span key="v" className="tabular">{instance.version}</span>],
                ...(ending ? [["Ending", ending] as [string, string]] : []),
                ["Characters", roster.length > 0 ? roster.map((c) => c.name).join(", ") : "No one yet"],
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/instances/${id}`} size="sm" icon={<DoorOpen {...ICON_DENSE} />}>
                Lobby
              </ButtonLink>
              <ButtonLink href={`/instances/${id}/schedule`} size="sm" icon={<CalendarClock {...ICON_DENSE} />}>
                Schedule
              </ButtonLink>
            </div>
          </Panel>
        }
      >
        {page.items.length === 0 ? (
          <EmptyState icon={<ScrollText {...ICON} />}>Nothing has happened yet.</EmptyState>
        ) : (
          <HistoryFilter>
            {groups.map((g, n) => (
              <section key={n} aria-labelledby={g.round !== null ? `round-${n}` : undefined} aria-label={g.round === null ? "Before the first round" : undefined} className="mb-8">
                {g.round !== null && (
                  <h2 id={`round-${n}`} className="sticky top-[var(--size-topbar)] z-10 -mx-2 mb-3 border-b border-rule bg-desk px-2 py-2 text-label font-semibold text-ink">
                    Round {g.round}
                  </h2>
                )}
                <ol className="flex flex-col gap-3">
                  {g.items.map((item) => (
                    <li key={item.version} data-narration={item.narration ? "true" : "false"} data-actor={item.actor_id ? "true" : "false"} className="grid grid-cols-[3.5rem_1fr] gap-3 rounded-card border border-rule bg-page p-4">
                      <span className="pt-0.5 font-mono text-caption text-muted tabular">
                        <span className="sr-only">Version </span>v{item.version}
                      </span>
                      <article className="min-w-0">
                        {item.actor_id && <p className="mb-1 text-label font-semibold text-ink">{names.get(item.actor_id) ?? "Former player"}</p>}
                        {item.narration ? <p className="max-w-prose font-prose text-prose text-ink">{item.narration.text}</p> : <p className="text-caption text-muted">No narration.</p>}
                        <details className="mt-2">
                          <summary className="cursor-pointer text-caption text-muted hover:text-ink">
                            {plural(item.events.length, "event")}
                          </summary>
                          <pre className="mt-2 relative overflow-x-auto rounded-control bg-desk p-2 whitespace-pre-wrap font-mono text-code">{item.events.map((e) => JSON.stringify(e)).join("\n")}</pre>
                        </details>
                      </article>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </HistoryFilter>
        )}
        {pager}
      </WithAside>
    </Page>
  );
}
