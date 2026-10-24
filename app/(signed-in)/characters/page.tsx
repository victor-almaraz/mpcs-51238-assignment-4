// Characters hub (docs/design/README.md, Page layouts: Hub): every character the user owns, grouped
// by whether it can join a game, with New character.
import { Plus, Users } from "lucide-react";
import { CharacterCard, gamesOf, type CharacterItem } from "@/components/dashboard/hub";
import { ButtonLink } from "@/components/ui/button";
import { CardGrid } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { listCampaigns } from "@/lib/api/campaigns";
import { listCharacters } from "@/lib/api/characters";
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
  const [characters, campaigns] = await Promise.all([listCharacters(store, user.id, { limit: 100 }), listCampaigns(store, user.id, { archived: false, limit: 100 })]);
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
          No characters yet. Make one to bring to a campaign&rsquo;s games.
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
    </Page>
  );
}
