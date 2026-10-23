// Character editor (app-flow.md, Character creation and editor): the sheet read-only; name and profile
// editable; Retire when available or dead. Portraits arrive with assets.
import { notFound } from "next/navigation";
import { abilityOptions, getCharacter } from "@/lib/api/characters";
import { ApiError } from "@/lib/api/errors";
import { systemView } from "@/lib/api/systems";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { systemUi } from "@/components/systems";
import { CharacterEditor } from "./editor";

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
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">{character.name}</h1>
      <p className="mt-1 font-ui text-caption text-muted">
        {systemView(character.system).title} · {character.status.replace("_", " ")} · {character.summary.health}
      </p>
      {ui && <ui.SheetView sheet={character.sheet} labels={labels} />}
      <CharacterEditor id={character.id} name={character.name} profile={profile} editable={character.status !== "in_instance"} retirable={character.status === "available" || character.status === "dead"} />
    </div>
  );
}
