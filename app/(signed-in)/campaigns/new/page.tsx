// Campaign creation (app-flow.md, Route map: title; system, defaulting to Cadmium, with its credit
// line; module checkboxes preselected from the materials' required modules; materials). A form page
// (docs/design/README.md, Page layouts).
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { MaterialPicker } from "@/components/campaign-materials";
import { listMaterials } from "@/lib/api/materials";
import { listSystems } from "@/lib/api/systems";
import { createCampaignAction } from "@/lib/server/campaign-actions";
import { defaultRange } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, TextArea, TextInput, described } from "@/components/ui/field";
import { Page, PageHeader } from "@/components/ui/page";
import { SystemSwitch } from "@/components/ui/system-switch";

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ system?: string }> }) {
  const user = await pageUser();
  const systems = listSystems();
  const id = (await searchParams).system ?? "cadmium";
  const system = systems.find((s) => s.id === id);
  if (!system) notFound();
  const materials = await listMaterials(serverStore(), user.id, { system: system.id });
  return (
    <Page width="form">
      <PageHeader crumbs={[{ label: "Campaigns", href: "/campaigns" }]} title="New campaign" description="A campaign holds the adventure, its players, and the games you run from it." />
      <SystemSwitch systems={systems} current={system.id} base="/campaigns/new?system=" />
      <ActionForm action={createCampaignAction} className="mt-6 flex flex-col gap-6">
        <input type="hidden" name="system" value={system.id} />
        <FieldGroup legend="Details">
          <Field id="campaign-title" label="Title">
            <TextInput {...described("campaign-title")} name="title" required maxLength={80} />
          </Field>
          <Field id="campaign-description" label="Description" optional>
            <TextArea {...described("campaign-description")} name="description" maxLength={2000} rows={3} />
          </Field>
          <Field id="campaign-versions" label="System versions" hint={`The ${system.title} versions the campaign accepts, as a range such as ${defaultRange(system.version)}.`}>
            <TextInput {...described("campaign-versions", { hint: true })} name="system_versions" required defaultValue={defaultRange(system.version)} className="max-w-40 font-mono" />
          </Field>
        </FieldGroup>
        <FieldGroup legend="Materials">
          <MaterialPicker materials={materials} modules={system.modules} chosen={[]} enabled={[]} />
        </FieldGroup>
        <div>
          <Button type="submit" variant="primary">
            Create campaign
          </Button>
        </div>
      </ActionForm>
    </Page>
  );
}
