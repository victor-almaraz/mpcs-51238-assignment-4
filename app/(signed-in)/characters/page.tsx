// Characters hub (docs/design/README.md, Page layouts: Hub): every character the user owns, grouped
// by whether it can join a game, with New character; then archived characters, with Unarchive, and
// recently deleted ones, with Restore (SPEC_ISSUES.md#character-draft-archive).
import { Archive, Plus, Trash2, Users } from "lucide-react";
import { RestoreForm, UnarchiveForm } from "@/components/character-lifecycle";
import { CharacterCard, gamesOf, type CharacterItem } from "@/components/dashboard/hub";
import { formatWhen } from "@/components/when";
import { List, ListRow } from "@/components/ui/list";
import { ButtonLink } from "@/components/ui/button";
import { CardGrid } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { listCampaigns } from "@/lib/api/campaigns";
import { listCharacters, listDeletedCharacters } from "@/lib/api/characters";
import { systemView } from "@/lib/api/systems";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const GROUPS: { id: string; title: string; has: (c: CharacterItem) => boolean }[] = [
  { id: "available", title: "Available", has: (c) => c.status === "available" },
  { id: "in-games", title: "In games", has: (c) => c.status === "in_instance" },
  { id: "retired", title: "Retired and fallen", has: (c) => c.status === "retired" || c.status === "dead" },
];

export default async function Characters() {
  const user = await pageUser();
  const store = serverStore();
  const [characters, archived, deleted, campaigns] = await Promise.all([
    listCharacters(store, user.id, { archived: false, limit: 100 }),
    listCharacters(store, user.id, { archived: true, limit: 100 }),
    listDeletedCharacters(store, user.id),
    listCampaigns(store, user.id, { archived: false, limit: 100 }),
  ]);
  const where = new Map((await gamesOf(store, user.id, campaigns.items)).map((i) => [i.id, i.name]));
  const newCharacter = (
    <ButtonLink href="/characters/new" variant="primary" icon={<Plus {...ICON_DENSE} />}>
      New character
    </ButtonLink>
  );

  return (
    <Page>
      <PageHeader title="Characters" actions={characters.items.length > 0 ? newCharacter : undefined} />
      {characters.items.length === 0 ? (
        <EmptyState icon={<Users {...ICON} />} action={newCharacter}>
          {archived.items.length > 0 ? "Every character you have is archived. Unarchive one below, or make a new one." : <>No characters yet. Make one to bring to a campaign&rsquo;s games.</>}
        </EmptyState>
      ) : (
        GROUPS.map((g) => {
          const list = characters.items.filter(g.has);
          if (list.length === 0) return null;
          return (
            <Section key={g.id} id={g.id} title={`${g.title} (${list.length})`}>
              <CardGrid>
                {list.map((c) => (
                  <CharacterCard key={c.id} character={c} where={where} />
                ))}
              </CardGrid>
            </Section>
          );
        })
      )}
      <Section id="archived" title={`Archived (${archived.items.length})`} description="Archived characters keep their sheets and portraits, and cannot join games.">
        {archived.items.length === 0 ? (
          <EmptyState icon={<Archive {...ICON} />}>No archived characters. Archive a character from its page; you can unarchive it here.</EmptyState>
        ) : (
          <List>
            {archived.items.map((c) => (
              <ListRow
                key={c.id}
                icon={<Archive {...ICON_DENSE} />}
                title={c.name}
                href={`/characters/${c.id}`}
                meta={`${systemView(c.system).title} · ${c.summary.health}`}
                actions={<UnarchiveForm characterId={c.id} name={c.name} />}
              />
            ))}
          </List>
        )}
      </Section>
      {deleted.length > 0 && (
        <Section id="deleted" title={`Recently deleted (${deleted.length})`} description="Deleted characters are hidden. You can restore one for 30 days; within 90 days it is erased with its portrait.">
          <List>
            {deleted.map((c) => (
              <ListRow
                key={c.id}
                icon={<Trash2 {...ICON_DENSE} />}
                title={c.name}
                meta={`Deleted ${formatWhen(c.deleted_at, user.timezone)} · restore until ${formatWhen(c.restorable_until, user.timezone)}`}
                actions={<RestoreForm characterId={c.id} name={c.name} />}
              />
            ))}
          </List>
        </Section>
      )}
    </Page>
  );
}
