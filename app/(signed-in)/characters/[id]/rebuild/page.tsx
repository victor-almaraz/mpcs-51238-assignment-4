// Change role and abilities (SPEC_ISSUES.md#character-rebuild): the system's creation form, filled with
// the character's choices, for a character that is available and has never joined a game.
import { notFound } from "next/navigation";
import { characterRebuildable, getCharacter } from "@/lib/api/characters";
import { systemView } from "@/lib/api/systems";
import { creationData } from "@/lib/server/creation-data";
import { orNotFound } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { systemUi } from "@/components/systems";
import { Page, PageHeader } from "@/components/ui/page";

export default async function RebuildCharacter({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const store = serverStore();
  const character = await orNotFound(getCharacter(store, user.id, id));
  const ui = systemUi(character.system);
  if (!ui || !(await characterRebuildable(store, user.id, id))) notFound();
  const system = systemView(character.system);
  const data = await creationData(store, user.id, character.system);
  const sheet = character.sheet as unknown as { role: string; abilities: string[]; profile?: { manner?: string; look?: string } };
  return (
    <Page>
      <PageHeader
        crumbs={[
          { label: "Characters", href: "/characters" },
          { label: character.name, href: `/characters/${character.id}` },
        ]}
        title="Change role and abilities"
        description="Until the character first joins a game, you can choose again. The sheet is built anew from these choices."
      />
      <ui.CreationForm
        {...data}
        systemTitle={system.title}
        systemCredit={system.credit}
        rebuild={{ id: character.id, name: character.name, role: sheet.role, abilities: sheet.abilities, manner: sheet.profile?.manner, look: sheet.profile?.look }}
      />
    </Page>
  );
}
