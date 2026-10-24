"use client";
// SPEC_ISSUES.md#creation-chosen-campaign: the campaign choice is shown, never submitted.
// Cadmium's creation form (app-flow.md, Character creation and editor; systems/cadmium.md, Components):
// Quest's steps plus a "For campaign" step among the caller's Cadmium campaigns. With a campaign chosen,
// the step shows the fields of the modules it enables. `create_character` takes no campaign and builds
// the sheet without modules; the fields say what the sheet holds once the character joins.
import { useState } from "react";
import { creationModuleFields } from "@/lib/systems/cadmium/creation";
import { chosenCampaign } from "@/lib/systems/creation";
import { Field, Select, described } from "@/components/ui/field";
import { CreationStep, QuestCreationForm, type CreationProps } from "./quest";

export function CadmiumCreationForm(props: CreationProps) {
  const campaigns = props.campaigns ?? [];
  const [campaignId, setCampaignId] = useState(chosenCampaign(campaigns, props.campaign)?.id ?? "");
  const campaign = chosenCampaign(campaigns, campaignId);
  const fields = campaign ? creationModuleFields(campaign.modules) : [];
  const summary = campaigns.length > 0 ? [{ label: "For campaign", value: campaign?.title ?? "Any campaign", href: "#step-campaign" }] : [];

  return (
    <QuestCreationForm {...props} summary={summary}>
      {campaigns.length > 0 && (
        <CreationStep n={5} id="step-campaign" title="For campaign" done>
          <div className="flex max-w-form flex-col gap-4">
            <Field id="creation-campaign" label="Campaign" hint="Shows what the campaign's modules add to the sheet. The character is not tied to it." optional>
              <Select {...described("creation-campaign", { hint: true })} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">Any campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </Field>
            {campaign && fields.length === 0 && <p className="text-caption text-muted">{campaign.title} enables no modules.</p>}
            {fields.length > 0 && (
              <div className="rounded-card border border-rule bg-desk/50 p-4">
                <h3 className="mb-3 text-label font-medium text-muted">What {campaign!.title}&apos;s modules add</h3>
                <dl className="flex flex-col gap-3">
                  {fields.map((f) => (
                    <div key={f.module} className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[8rem_1fr]">
                      <dt className="text-label font-medium text-muted">{f.label}</dt>
                      <dd className="min-w-0">
                        <span className="tabular text-ink">{f.value}</span>
                        <span className="block text-caption text-muted">{f.note}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-caption text-muted">The character gets these when it joins one of {campaign!.title}&apos;s games.</p>
              </div>
            )}
          </div>
        </CreationStep>
      )}
    </QuestCreationForm>
  );
}
