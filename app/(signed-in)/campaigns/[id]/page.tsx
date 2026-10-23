// Campaign overview (app-flow.md, Route map: description, members, instances, materials; Instance
// lobby: Create instance lives here, author only).
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getCampaign } from "@/lib/api/campaigns";
import { listInstances } from "@/lib/api/instances";
import { systemView } from "@/lib/api/systems";
import { createInstanceAction } from "@/lib/server/campaign-actions";
import { orNotFound } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const store = serverStore();
  const campaign = await orNotFound(getCampaign(store, user.id, id));
  const instances = await listInstances(store, user.id, campaign.id);
  const author = campaign.author_id === user.id;
  const system = systemView(campaign.system);
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-title">{campaign.title}</h1>
        {author && (
          <Link href={`/campaigns/${campaign.id}/edit`} className="font-ui text-control text-accent">
            Edit
          </Link>
        )}
      </div>
      <p className="mt-1 font-ui text-caption text-muted">
        {system.title} {campaign.system_versions}
        {campaign.modules.length > 0 && ` · ${campaign.modules.join(", ")}`}
        {campaign.archived && " · archived"}
      </p>
      {campaign.description && <p className="mt-4 whitespace-pre-line">{campaign.description}</p>}

      <section className="mt-8">
        <h2 className="font-display text-heading">Instances</h2>
        {instances.length === 0 ? (
          <p className="mt-2 text-muted">No instances yet.</p>
        ) : (
          <ul className="mt-2">
            {instances.map((i) => (
              <li key={i.id} className="border-b border-rule py-1">
                <Link href={`/instances/${i.id}`} className="text-accent">
                  {i.name}
                </Link>
                <span className="ml-2 font-ui text-caption text-muted">
                  {i.status} · {i.characters.length} character{i.characters.length === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {author && !campaign.archived && (
          <ActionForm action={createInstanceAction} className="mt-4 flex items-end gap-2">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <label className="flex flex-col gap-1">
              <span className="font-ui text-label">Instance name</span>
              <input name="name" required maxLength={80} placeholder="Tuesday group" className="rounded-control border border-border bg-page px-2 py-1" />
            </label>
            <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
              Create instance
            </button>
          </ActionForm>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-heading">Members</h2>
        <ul className="mt-2">
          {campaign.members.map((m) => (
            <li key={m.user_id}>
              {m.display_name} <span className="font-ui text-caption text-muted">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-heading">Materials</h2>
        <ul className="mt-2">
          {campaign.materials.map((m) => (
            <li key={`${m.kind}:${m.id}`}>
              {m.id} {m.version} <span className="font-ui text-caption text-muted">{m.kind}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
