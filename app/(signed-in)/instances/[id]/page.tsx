// Instance lobby (app-flow.md, Instance lobby): header, party with Add my character. Next session,
// author controls, and Enter game arrive with scheduling and the coordinator.
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getCampaign } from "@/lib/api/campaigns";
import { listCharacters } from "@/lib/api/characters";
import { getInstance } from "@/lib/api/instances";
import { accepted, systemView } from "@/lib/api/systems";
import { addCharacterAction, removeCharacterAction } from "@/lib/server/campaign-actions";
import { orNotFound } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

export default async function Lobby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const store = serverStore();
  const { instance } = await orNotFound(getInstance(store, user.id, { instance_id: id }));
  const campaign = await getCampaign(store, user.id, instance.campaign_id);
  const author = campaign.author_id === user.id;
  const names = new Map(campaign.members.map((m) => [m.user_id, m.display_name]));
  const mine = (await listCharacters(store, user.id, { status: "available", limit: 100 })).items.filter((c) => accepted(instance.system).includes(c.system));
  const open = instance.status === "lobby";
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <Link href={`/campaigns/${campaign.id}`} className="font-ui text-caption text-muted">
        {campaign.title}
      </Link>
      <h1 className="font-display text-title">{instance.name}</h1>
      <p className="mt-1 font-ui text-caption">
        <span className="rounded-control border border-border px-2 py-0.5">{instance.status}</span>{" "}
        <span className="text-muted">
          {systemView(instance.system).title} {instance.system_version}
        </span>
      </p>

      <section className="mt-8">
        <h2 className="font-display text-heading">Party</h2>
        {instance.characters.length === 0 ? (
          <p className="mt-2 text-muted">No characters yet.</p>
        ) : (
          <ul className="mt-2">
            {instance.characters.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between border-b border-rule py-1">
                <span>
                  {c.name} <span className="font-ui text-caption text-muted">{names.get(c.user_id) ?? ""}</span>
                </span>
                {open && (c.user_id === user.id || author) && (
                  <ActionForm action={removeCharacterAction}>
                    <input type="hidden" name="instance_id" value={instance.id} />
                    <input type="hidden" name="character_id" value={c.id} />
                    <button type="submit" className="font-ui text-control text-danger">
                      Remove
                    </button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {open &&
          (mine.length === 0 ? (
            <p className="mt-4 text-muted">
              You have no available {systemView(instance.system).title} character.{" "}
              <Link href={`/characters/new?system=${instance.system}`} className="text-accent underline">
                Create a character
              </Link>
              .
            </p>
          ) : (
            <ActionForm action={addCharacterAction} className="mt-4 flex items-end gap-2">
              <input type="hidden" name="instance_id" value={instance.id} />
              <label className="flex flex-col gap-1">
                <span className="font-ui text-label">Your character</span>
                <select name="character_id" className="rounded-control border border-border bg-page px-2 py-1">
                  {mine.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
                Add my character
              </button>
            </ActionForm>
          ))}
      </section>
    </div>
  );
}
