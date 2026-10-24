// Adventure creation (app-flow.md, Route map: /adventures/new): id, title, system, required settings,
// or import from a ZIP of an adventure directory.
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { listMaterials } from "@/lib/api/materials";
import { listSystems } from "@/lib/api/systems";
import { createDraftAction, importDraftAction } from "@/lib/server/draft-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const field = "rounded-control border border-border bg-page px-2 py-1";

export default async function NewAdventure({ searchParams }: { searchParams: Promise<{ system?: string }> }) {
  const user = await pageUser();
  const systems = listSystems();
  const wanted = (await searchParams).system;
  const system = systems.find((s) => s.id === wanted) ?? systems[0]!;
  const settings = await listMaterials(serverStore(), user.id, { system: system.id, kind: "setting" });
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">New adventure</h1>
      <nav className="mt-4 flex gap-4 font-ui text-control">
        {systems.map((s) => (
          <Link key={s.id} href={`?system=${s.id}`} aria-current={s.id === system.id ? "page" : undefined} className={s.id === system.id ? "border-b-2 border-accent" : "text-muted"}>
            {s.title}
          </Link>
        ))}
      </nav>
      <ActionForm action={createDraftAction} className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="system" value={system.id} />
        <label className="flex flex-col gap-1">
          <span className="font-ui text-label">Id, lowercase letters, digits, and underscores</span>
          <input name="material_id" required pattern="[a-z][a-z0-9_]{0,63}" className={`${field} font-mono text-code`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-ui text-label">Title</span>
          <input name="title" required maxLength={80} className={field} />
        </label>
        <fieldset>
          <legend className="font-ui text-label">Required settings</legend>
          {settings.length === 0 && <p className="text-muted">No settings are installed for {system.title}.</p>}
          {settings.map((s) => (
            <label key={s.id} className="flex items-baseline gap-2">
              <input type="checkbox" name="settings" value={`${s.id}@${s.version}`} />
              {s.title} <span className="font-ui text-caption text-muted">{s.version}</span>
            </label>
          ))}
        </fieldset>
        <div>
          <button type="submit" className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
            Create draft
          </button>
        </div>
      </ActionForm>
      <section className="mt-10">
        <h2 className="font-display text-heading">Import</h2>
        <ActionForm action={importDraftAction} className="mt-2 flex items-end gap-2">
          <input type="file" name="archive" accept=".zip,application/zip" required className="font-ui text-caption" />
          <button type="submit" className="rounded-control border border-border px-3 py-1 font-ui text-control">
            Import ZIP
          </button>
        </ActionForm>
      </section>
    </div>
  );
}
