// Play (app-flow.md, Route map: members with a character in the instance; Redirect rules: an instance
// in the lobby, paused, or ended, or a user without a character, goes to the lobby).
import { redirect } from "next/navigation";
import { PlayClient } from "@/components/play/play-client";
import type { AdventureBundle } from "@/lib/bundle/adventure";
import { getCampaign } from "@/lib/api/campaigns";
import { getHistory, getInstance } from "@/lib/api/instances";
import { listOccurrences } from "@/lib/api/schedules";
import { serverDeps } from "@/lib/server/coordinator";
import { orNotFound, requestTime } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";

export default async function Play({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ character?: string }> }) {
  const { id } = await params;
  const { character } = await searchParams;
  const user = await pageUser();
  const deps = serverDeps();
  const lobby = `/instances/${id}`;
  const first = await orNotFound(getInstance(deps, user.id, { instance_id: id }));
  const mine = first.instance.characters.filter((c) => c.user_id === user.id);
  if (first.instance.status !== "active") redirect(lobby);
  if (mine.length === 0) redirect(`${lobby}?pick=1`);
  const characterId = mine.find((c) => c.id === character)?.id ?? mine[0]!.id;
  const { instance, view } = await getInstance(deps, user.id, { instance_id: id, character_id: characterId });
  if (!view) redirect(lobby);
  const history = await getHistory(deps.store, user.id, { instance_id: id, after_version: Math.max(0, instance.version - 50), limit: 50 });
  const campaign = await getCampaign(deps.store, user.id, instance.campaign_id);
  const adventure = instance.materials.find((m) => m.kind === "adventure")!;
  const bundle = (await deps.store.getBundle("adventure", adventure.id, adventure.version)) as AdventureBundle | undefined;
  const endings = Object.fromEntries(Object.entries(bundle?.manifest.endings ?? {}).map(([k, v]) => [k, v.label]));
  const portraits: Record<string, { hash: string; alt: string }> = {};
  for (const c of instance.characters) {
    const record = await deps.store.getCharacter(c.id);
    const meta = record?.portrait_asset ? await deps.store.assetMeta(record.portrait_asset) : undefined;
    if (meta && !meta.removed_at) portraits[c.id] = { hash: meta.hash, alt: meta.alt };
  }
  // The next session, for the Paused banner (app-flow.md, Play interface: Paused).
  const now = requestTime();
  const next = (await listOccurrences(deps.store, user.id, { instance_id: id, from: new Date(now).toISOString(), to: new Date(now + 92 * 86_400_000).toISOString() })).find((o) => o.status !== "cancelled");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return (
    <>
      {/* A workspace has no footer (docs/design/README.md, App frame), so it fills the window under the top bar. */}
      {/* Keyed by character: switching characters starts the client afresh, with that character's view. */}
      <PlayClient
        key={characterId}
        instance={instance}
        view={view}
        history={history.items}
        deadline={(await deps.store.deadline(id))?.toISOString() ?? null}
        author={campaign.author_id === user.id}
        userId={user.id}
        names={Object.fromEntries(instance.characters.map((c) => [c.id, c.name]))}
        endings={endings}
        realtime={url && key ? { url, key } : null}
        textInput={deps.parser !== undefined}
        portraits={portraits}
        nextSession={next?.starts_at ?? null}
        timezone={user.timezone}
      />
    </>
  );
}
