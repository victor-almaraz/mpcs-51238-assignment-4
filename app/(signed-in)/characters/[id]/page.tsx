// Character editor (app-flow.md, Character creation and editor): the sheet read-only; name and profile
// editable; Upload portrait and Remove portrait; Retire when available or dead.
import { notFound } from "next/navigation";
import { abilityOptions, getCharacter } from "@/lib/api/characters";
import { ApiError } from "@/lib/api/errors";
import { systemView } from "@/lib/api/systems";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { systemUi } from "@/components/systems";
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
  const labels = Object.fromEntries((await abilityOptions(store, character.system)).map((a) => [a.ref, a.label]));
  const profile = (character.sheet.profile ?? {}) as Record<string, string>;
  const portrait = character.portrait ? await store.assetMeta(character.portrait) : undefined;
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <div className="flex items-center gap-4">
        {portrait && !portrait.removed_at ? (
          // eslint-disable-next-line @next/next/no-img-element -- assets are served by hash with long-lived caching.
          <img src={`/v1/assets/${portrait.hash}`} alt={portrait.alt} width={96} height={96} className="h-24 w-24 rounded-control border border-rule object-cover" />
        ) : (
          <span aria-hidden className="flex h-24 w-24 items-center justify-center rounded-control border border-rule font-display text-display text-muted">
            {character.name.charAt(0).toUpperCase()}
          </span>
        )}
        <h1 className="font-display text-title">{character.name}</h1>
      </div>
      <p className="mt-1 font-ui text-caption text-muted">
        {systemView(character.system).title} · {character.status.replace("_", " ")} · {character.summary.health}
      </p>
      {ui && <ui.SheetView sheet={character.sheet} labels={labels} />}
      <PortraitForm id={character.id} has={!!character.portrait} />
      <CharacterEditor id={character.id} name={character.name} profile={profile} editable={character.status !== "in_instance"} retirable={character.status === "available" || character.status === "dead"} />
    </div>
  );
}
