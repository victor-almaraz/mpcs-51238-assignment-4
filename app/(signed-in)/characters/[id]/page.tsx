// Character editor (app-flow.md, Character creation and editor): the sheet read-only; name and profile
// editable; Upload portrait and Remove portrait; Archive or Unarchive, Retire when available or dead,
// and Delete, none while the character is in a game (SPEC_ISSUES.md#character-draft-archive). A detail page
// (docs/design/README.md, Page layouts): the sheet and details in the main column, the portrait and
// summary facts in the aside.
import { notFound } from "next/navigation";
import { abilityOptions, getCharacter } from "@/lib/api/characters";
import { withDescriptions } from "@/lib/server/ability-descriptions";
import { ApiError } from "@/lib/api/errors";
import { systemView } from "@/lib/api/systems";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { systemUi } from "@/components/systems";
import { StatusBadge } from "@/components/ui/badge";
import { ArchivedNotice, ArchiveForm, DeleteCharacterForm, RetireForm } from "@/components/character-lifecycle";
import { Card, DangerZone, Panel } from "@/components/ui/card";
import { elementSymbol } from "@/components/ui/tile";
import { Page, PageHeader, Section, WithAside } from "@/components/ui/page";
import { CharacterEditor } from "./editor";
import { PortraitForm } from "./portrait";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const store = serverStore();
  let character;
  try {
    character = await getCharacter(store, user.id, id);
  } catch (e) {
    if (e instanceof ApiError && e.code === "not_found") notFound();
    throw e;
  }
  const ui = systemUi(character.system);
  const options = withDescriptions(await abilityOptions(store, character.system));
  const labels = Object.fromEntries(options.map((a) => [a.ref, a.label]));
  const profile = (character.sheet.profile ?? {}) as Record<string, string>;
  const portrait = character.portrait ? await store.assetMeta(character.portrait) : undefined;
  const system = systemView(character.system);
  const inGame = character.status === "in_instance";
  return (
    <Page>
      <PageHeader crumbs={[{ label: "Characters", href: "/characters" }]} title={character.name} status={<StatusBadge status={character.archived ? "archived" : character.status} />} description={`${system.title} · ${character.summary.health}`} />
      {character.archived && <ArchivedNotice characterId={character.id} className="mb-6" />}
      <WithAside
        aside={
          <Panel title="Portrait" className="gap-4">
            {portrait && !portrait.removed_at ? (
              // eslint-disable-next-line @next/next/no-img-element -- assets are served by hash with long-lived caching.
              <img src={`/v1/assets/${portrait.hash}`} alt={portrait.alt} width={288} height={288} className="aspect-square w-full max-w-72 rounded-card border border-rule object-cover" />
            ) : (
              <span aria-hidden="true" className="flex size-32 items-center justify-center rounded-card border border-dashed border-rule bg-desk text-display font-semibold text-muted">
                {elementSymbol(character.name)}
              </span>
            )}
            <PortraitForm id={character.id} has={!!character.portrait} />
          </Panel>
        }
      >
        {ui && (
          <Section id="sheet" title="Sheet" description="Read-only; it changes in play.">
            <Card>
              <ui.SheetView sheet={character.sheet} labels={labels} abilities={options} />
            </Card>
          </Section>
        )}
        <CharacterEditor id={character.id} name={character.name} profile={profile} editable={!inGame} />
        <div className="mt-10 flex flex-col gap-6">
          {!character.archived && !inGame && (
            <Panel title="Archive character">
              <ArchiveForm characterId={character.id} />
            </Panel>
          )}
          {(character.status === "available" || character.status === "dead") && (
            <DangerZone id="retire" title="Retire character">
              <RetireForm characterId={character.id} />
            </DangerZone>
          )}
          <DangerZone id="danger-zone" title="Delete character">
            {inGame ? <p className="text-muted">The character is in a game. Take it out of the game to delete it.</p> : <DeleteCharacterForm characterId={character.id} name={character.name} />}
          </DangerZone>
        </div>
      </WithAside>
    </Page>
  );
}
