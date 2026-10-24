"use client";
// SPEC_ISSUES.md#creation-chosen-campaign: the campaign choice is shown, never submitted.
// Cadmium's creation form (app-flow.md, Character creation and editor; systems/cadmium.md, Components):
// Quest's form plus a "For campaign" choice among the caller's Cadmium campaigns. With a campaign chosen,
// the form shows the fields of the modules it enables. `create_character` takes no campaign and builds
// the sheet without modules; the fields say what the sheet holds once the character joins.
import { useState } from "react";
import { creationModuleFields } from "@/lib/systems/cadmium/creation";
import { chosenCampaign } from "@/lib/systems/creation";
import { QuestCreationForm, type CreationProps } from "./quest";

export function CadmiumCreationForm(props: CreationProps) {
  const campaigns = props.campaigns ?? [];
  const [campaignId, setCampaignId] = useState(chosenCampaign(campaigns, props.campaign)?.id ?? "");
  const campaign = chosenCampaign(campaigns, campaignId);
  const fields = campaign ? creationModuleFields(campaign.modules) : [];

  return (
    <QuestCreationForm {...props}>
      {campaigns.length > 0 && (
        <fieldset>
          <legend className="font-ui text-label">
            <label htmlFor="creation-campaign">For campaign</label>
          </legend>
          <select id="creation-campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="mt-1 rounded-control border border-border bg-page px-2 py-1 font-ui text-control">
            <option value="">Any campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          {campaign && fields.length === 0 && <p className="mt-2 font-ui text-caption text-muted">{campaign.title} enables no modules.</p>}
          {fields.length > 0 && (
            <>
              <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1">
                {fields.map((f) => (
                  <div key={f.module} className="contents">
                    <dt className="font-ui text-label text-muted">{f.label}</dt>
                    <dd>
                      {f.value}
                      <span className="block font-ui text-caption text-muted">{f.note}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 font-ui text-caption text-muted">The character gets these when it joins one of {campaign!.title}&apos;s instances.</p>
            </>
          )}
        </fieldset>
      )}
    </QuestCreationForm>
  );
}
