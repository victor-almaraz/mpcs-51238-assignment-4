"use client";
// Cadmium's creation form (app-flow.md, Character creation and editor; systems/cadmium.md, Components):
// Quest's steps, with the fields of the modules a chosen campaign enables shown under the Campaign
// step (SPEC_ISSUES.md#creation-chosen-campaign). `create_character` takes no campaign and builds the
// sheet without modules; the fields say what the sheet holds once the character joins.
import { creationModuleFields } from "@/lib/systems/cadmium/creation";
import type { CampaignChoice } from "@/lib/systems/creation";
import { QuestCreationForm, type CreationProps } from "./quest";

function ModuleFields({ campaign }: { campaign: CampaignChoice }) {
  const fields = creationModuleFields(campaign.modules);
  if (fields.length === 0) return <p className="text-caption text-muted">{campaign.title} enables no modules.</p>;
  return (
    <div className="rounded-card border border-rule bg-desk/50 p-4">
      <h3 className="mb-3 text-label font-medium text-muted">What {campaign.title}&apos;s modules add</h3>
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
      <p className="mt-3 text-caption text-muted">The character gets these when it joins one of {campaign.title}&apos;s games.</p>
    </div>
  );
}

export function CadmiumCreationForm(props: CreationProps) {
  return <QuestCreationForm {...props} campaignDetails={(c) => <ModuleFields campaign={c} />} />;
}
