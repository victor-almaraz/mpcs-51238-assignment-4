// Adventure creation (app-flow.md, Route map: /adventures/new): id, title, system, required settings,
// or import from a ZIP of an adventure directory. A form page (docs/design/README.md, Page layouts).
import { Upload } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { listMaterials } from "@/lib/api/materials";
import { listSystems } from "@/lib/api/systems";
import { createDraftAction, importDraftAction } from "@/lib/server/draft-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { Button } from "@/components/ui/button";
import { Choice, Field, FieldGroup, TextInput, described, inputClass } from "@/components/ui/field";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { SystemSwitch } from "@/components/ui/system-switch";

export default async function NewAdventure({ searchParams }: { searchParams: Promise<{ system?: string }> }) {
  const user = await pageUser();
  const systems = listSystems();
  const wanted = (await searchParams).system;
  const system = systems.find((s) => s.id === wanted) ?? systems[0]!;
  const settings = await listMaterials(serverStore(), user.id, { system: system.id, kind: "setting" });
  return (
    <Page width="form">
      <PageHeader crumbs={[{ label: "Adventures", href: "/adventures" }]} title="New adventure" description="Start a draft here, or import one from a ZIP." />
      <SystemSwitch systems={systems} current={system.id} base="/adventures/new?system=" />
      <ActionForm action={createDraftAction} className="mt-6 flex flex-col gap-6">
        <input type="hidden" name="system" value={system.id} />
        <FieldGroup legend="Draft">
          <Field id="adventure-id" label="Id" hint="Lowercase letters, digits, and underscores, starting with a letter.">
            <TextInput {...described("adventure-id", { hint: true })} name="material_id" required pattern="[a-z][a-z0-9_]{0,63}" className="font-mono text-code" autoComplete="off" spellCheck={false} />
          </Field>
          <Field id="adventure-title" label="Title">
            <TextInput {...described("adventure-title")} name="title" required maxLength={80} />
          </Field>
          <fieldset className="flex flex-col">
            <legend className="mb-1 text-label font-medium text-ink">Required settings</legend>
            {settings.length === 0 && <p className="text-muted">No settings are installed for {system.title}.</p>}
            {settings.map((s) => (
              <Choice
                key={s.id}
                name="settings"
                value={`${s.id}@${s.version}`}
                label={
                  <>
                    {s.title} <span className="text-muted">{s.version}</span>
                  </>
                }
              />
            ))}
          </fieldset>
        </FieldGroup>
        <div>
          <Button type="submit" variant="primary">
            Create draft
          </Button>
        </div>
      </ActionForm>
      <Section id="import" title="Import" description="A ZIP of an adventure directory." className="mt-12">
        <ActionForm action={importDraftAction} className="flex flex-col gap-3 rounded-card border border-rule bg-page p-4 sm:flex-row sm:items-end">
          <Field id="adventure-archive" label="ZIP file" className="sm:flex-1">
            <input
              {...described("adventure-archive")}
              type="file"
              name="archive"
              accept=".zip,application/zip"
              required
              className={`${inputClass} text-caption file:mr-3 file:rounded-control file:border-0 file:bg-desk file:px-2 file:py-1 file:text-label file:font-medium file:text-ink`}
            />
          </Field>
          <Button type="submit" icon={<Upload {...ICON_DENSE} />} className="h-10">
            Import ZIP
          </Button>
        </ActionForm>
      </Section>
    </Page>
  );
}
