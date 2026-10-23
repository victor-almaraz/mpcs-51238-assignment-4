// Campaign creation (app-flow.md, Route map: title; system, defaulting to Cadmium, with its credit
// line; module checkboxes preselected from the materials' required modules; materials).
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { MaterialPicker } from "@/components/campaign-materials";
import { listMaterials } from "@/lib/api/materials";
import { listSystems } from "@/lib/api/systems";
import { createCampaignAction } from "@/lib/server/campaign-actions";
import { defaultRange } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const field = "rounded-control border border-border bg-page px-2 py-1 font-prose text-prose";

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ system?: string }> }) {
  const user = await pageUser();
  const systems = listSystems();
  const id = (await searchParams).system ?? "cadmium";
  const system = systems.find((s) => s.id === id);
  if (!system) notFound();
  const materials = await listMaterials(serverStore(), user.id, { system: system.id });
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">New campaign</h1>
      <nav className="mt-4 flex gap-4 font-ui text-control">
        {systems.map((s) => (
          <Link key={s.id} href={`/campaigns/new?system=${s.id}`} aria-current={s.id === system.id ? "page" : undefined} className={s.id === system.id ? "border-b-2 border-accent" : "text-muted"}>
            {s.title}
          </Link>
        ))}
      </nav>
      <p className="mt-2 font-ui text-caption text-muted">{system.credit}</p>
      <ActionForm action={createCampaignAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="system" value={system.id} />
        <label className="flex flex-col gap-1">
          <span className="font-ui text-label">Title</span>
          <input name="title" required maxLength={80} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-ui text-label">Description</span>
          <textarea name="description" maxLength={2000} rows={3} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-ui text-label">System versions</span>
          <input name="system_versions" required defaultValue={defaultRange(system.version)} className={`${field} w-32`} />
        </label>
        <MaterialPicker materials={materials} modules={system.modules} chosen={[]} enabled={[]} />
        <div>
          <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
            Create campaign
          </button>
        </div>
      </ActionForm>
    </div>
  );
}
