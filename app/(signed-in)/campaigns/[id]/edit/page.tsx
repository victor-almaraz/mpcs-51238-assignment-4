// Campaign editor (app-flow.md, Campaign editor): tabs Details, Materials, Members, Invitations; Archive
// campaign at the bottom of Details. Author only; others get the 404 page. A form page
// (docs/design/README.md, Page layouts); `?tab=` opens a tab.
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { MaterialPicker } from "@/components/campaign-materials";
import { getCampaign } from "@/lib/api/campaigns";
import { listMaterials } from "@/lib/api/materials";
import { systemView } from "@/lib/api/systems";
import { archiveCampaignAction, setMaterialsAction, updateCampaignAction } from "@/lib/server/campaign-actions";
import { orNotFound, origin } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Choice, Field, FieldGroup, TextArea, TextInput, described } from "@/components/ui/field";
import { DescriptionList } from "@/components/ui/list";
import { Notice } from "@/components/ui/notice";
import { DangerZone } from "@/components/ui/card";
import { Page, PageHeader } from "@/components/ui/page";
import { Tabs } from "@/components/ui/tabs";
import { InvitationsPanel, MembersPanel } from "../panels";

const TABS = ["details", "materials", "members", "invitations"] as const;

export default async function EditCampaign({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const requested = (await searchParams).tab;
  const tab = TABS.find((t) => t === requested) ?? "details";
  const user = await pageUser();
  const store = serverStore();
  const campaign = await orNotFound(getCampaign(store, user.id, id));
  if (campaign.author_id !== user.id || !("invite_link_code" in campaign)) notFound();
  const system = systemView(campaign.system);

  const details = (
    <>
      <ActionForm action={updateCampaignAction} className="flex flex-col gap-6">
        <input type="hidden" name="campaign_id" value={campaign.id} />
        <FieldGroup legend="Details">
          <Field id="campaign-title" label="Title">
            <TextInput {...described("campaign-title")} name="title" required maxLength={80} defaultValue={campaign.title} />
          </Field>
          <Field id="campaign-description" label="Description" optional>
            <TextArea {...described("campaign-description")} name="description" maxLength={2000} rows={4} defaultValue={campaign.description} />
          </Field>
          <DescriptionList items={[["System", `${system.title} ${campaign.system_versions}`]]} />
        </FieldGroup>
        {system.modules.length > 0 && (
          <FieldGroup legend="Modules" description="For games created from now on.">
            <div className="flex flex-col">
              {system.modules.map((m) => (
                <Choice key={m.id} name="modules" value={m.id} defaultChecked={campaign.modules.includes(m.id)} label={m.title} />
              ))}
            </div>
          </FieldGroup>
        )}
        <div>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </ActionForm>
      {!campaign.archived && (
        <div className="mt-10">
          <DangerZone id="danger-zone" title="Archive campaign">
            <ActionForm action={archiveCampaignAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <p className="text-muted">An archived campaign accepts no new games, members, or invitations.</p>
              <Button type="submit" variant="danger" className="shrink-0">
                Archive campaign
              </Button>
            </ActionForm>
          </DangerZone>
        </div>
      )}
    </>
  );

  const materials = (
    <ActionForm action={setMaterialsAction} className="flex flex-col gap-6">
      <input type="hidden" name="campaign_id" value={campaign.id} />
      <Notice>Changes apply to games created from now on; existing games keep their versions.</Notice>
      <FieldGroup legend="Materials">
        <MaterialPicker materials={await listMaterials(store, user.id, { system: campaign.system })} modules={[]} chosen={campaign.materials} enabled={campaign.modules} />
      </FieldGroup>
      <div>
        <Button type="submit" variant="primary">
          Save materials
        </Button>
      </div>
    </ActionForm>
  );

  return (
    <Page width="form">
      <PageHeader
        crumbs={[
          { label: "Campaigns", href: "/campaigns" },
          { label: campaign.title, href: `/campaigns/${campaign.id}` },
        ]}
        title="Edit campaign"
        status={campaign.archived ? <StatusBadge status="archived" /> : undefined}
      />
      <Tabs
        label="Campaign editor"
        initial={tab}
        tabs={[
          { id: "details", label: "Details", panel: details },
          { id: "materials", label: "Materials", panel: materials },
          { id: "members", label: "Members", panel: <MembersPanel campaignId={campaign.id} members={campaign.members} author /> },
          { id: "invitations", label: "Invitations", panel: <InvitationsPanel campaignId={campaign.id} userId={user.id} archived={campaign.archived} linkCode={campaign.invite_link_code ?? null} origin={await origin()} /> },
        ]}
      />
    </Page>
  );
}
