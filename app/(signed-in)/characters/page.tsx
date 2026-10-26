// Characters hub (docs/design/README.md, Page layouts: Hub): every character the user owns, grouped
// by whether it can join a game, with New character; then archived characters, with Unarchive, and
// recently deleted ones, with Restore (SPEC_ISSUES.md#character-draft-archive).
import { Plus, Users } from "lucide-react";
import { CharacterCard, gamesOf, type CharacterItem } from "@/components/dashboard/hub";
import { ArchivedSection, DeletedSection } from "@/components/lifecycle";
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
    listCampaigns(store, user.id, { limit: 100 }),
  ]);
  // Every campaign's games, archived campaigns' included, so a character in any game is shown in it by name.
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
      <ArchivedSection kind="character" items={archived.items.map((c) => ({ id: c.id, title: c.name, href: `/characters/${c.id}`, meta: `${systemView(c.system).title} · ${c.summary.health}` }))} />
      <DeletedSection kind="character" items={deleted.map((c) => ({ ...c, title: c.name }))} timezone={user.timezone} />
    </Page>
  );
}
