// The hub pages' shared parts (docs/design/README.md, Page layouts: Hub): the user's games across
// their campaigns, the code form that opens an invitation or invite link, and the cards for
// characters, campaigns, and adventures. Used by /dashboard, /characters, and /campaigns.
import { KeyRound } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardLink } from "@/components/ui/card";
import { ElementTile, elementSymbol } from "@/components/ui/tile";
import { described, Field, TextInput } from "@/components/ui/field";
import { ICON } from "@/components/ui/icon-button";
import type { listCampaigns } from "@/lib/api/campaigns";
import type { listCharacters } from "@/lib/api/characters";
import type { listDrafts } from "@/lib/api/drafts";
import { listInstances } from "@/lib/api/instances";
import { systemView } from "@/lib/api/systems";
import { enterCodeAction } from "@/lib/server/campaign-actions";
import type { serverStore } from "@/lib/server/supabase";

export type CampaignItem = Awaited<ReturnType<typeof listCampaigns>>["items"][number];
export type CharacterItem = Awaited<ReturnType<typeof listCharacters>>["items"][number];
export type DraftItem = Awaited<ReturnType<typeof listDrafts>>["items"][number];
export type GameItem = Awaited<ReturnType<typeof listInstances>>[number] & { campaign: string };

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Every game (instance) of the given campaigns, with its campaign's title. */
export async function gamesOf(store: ReturnType<typeof serverStore>, userId: string, campaigns: CampaignItem[]): Promise<GameItem[]> {
  return (await Promise.all(campaigns.map((c) => listInstances(store, userId, c.id).then((list) => list.map((i) => ({ ...i, campaign: c.title })))))).flat();
}

/** Opens an invitation or invite-link code (or a pasted link) on its own page. */
export function EnterCode({ id = "code" }: { id?: string }) {
  const hint = "Paste the code or link from an invitation.";
  return (
    <ActionForm action={enterCodeAction} className="flex flex-col gap-3 rounded-card border border-rule bg-page p-4">
      <div className="flex items-center gap-2 text-heading font-semibold text-ink">
        <KeyRound {...ICON} className="text-muted" />
        Have a code?
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field id={id} label="Invitation or invite link code" hint={hint} className="min-w-0 flex-1">
          <TextInput name="code" required autoComplete="off" spellCheck={false} className="font-mono text-code" {...described(id, { hint })} />
        </Field>
        <Button type="submit" className="h-10">
          Open
        </Button>
      </div>
    </ActionForm>
  );
}

export function CampaignCard({ campaign: c, userId }: { campaign: CampaignItem; userId: string }) {
  const runs = c.author_id === userId;
  const players = c.members.length - 1;
  return (
    <CardLink
      href={`/campaigns/${c.id}`}
      title={c.title}
      tile={<ElementTile symbol={elementSymbol(c.title)} tone="neutral" size="sm" />}
      badge={runs ? <Badge tone="accent">You run</Badge> : undefined}
      meta={`${plural(c.instance_ids.length, "game")} · ${plural(players, "player")}`}
    >
      {c.description && <p className="line-clamp-2 text-caption text-muted">{c.description}</p>}
    </CardLink>
  );
}

export function CharacterCard({ character: c, where }: { character: CharacterItem; where: Map<string, string> }) {
  const game = c.instance_id ? (where.get(c.instance_id) ?? "a game") : null;
  return (
    <CardLink
      href={`/characters/${c.id}`}
      title={c.name}
      tile={<ElementTile symbol={elementSymbol(c.name)} tone={c.status === "available" || c.status === "in_instance" ? "accent" : "neutral"} size="sm" />}
      badge={game ? <Badge tone="warning">In {game}</Badge> : c.status === "available" ? undefined : <StatusBadge status={c.status} />}
      meta={`${systemView(c.system).title} ${String(c.sheet.role)}`}
    />
  );
}

export function DraftCard({ draft: d }: { draft: DraftItem }) {
  return (
    <CardLink
      href={`/adventures/${d.id}/edit`}
      title={d.title}
      tile={<ElementTile symbol={elementSymbol(d.title)} tone="neutral" size="sm" />}
      badge={d.problems > 0 ? <Badge tone="danger">{plural(d.problems, "problem")}</Badge> : undefined}
      meta={d.last_published_version ? `Published ${d.last_published_version}` : "Not published"}
    />
  );
}
