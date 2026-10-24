"use client";
// Upload portrait (app-flow.md, Character editor): an image and its alt text, with optional licence,
// credit, and provenance for images made by someone else or with a generative tool.
import { Trash2, Upload } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { removePortraitAction, uploadPortraitAction } from "@/lib/server/actions";
import { Button } from "@/components/ui/button";
import { Field, TextInput, described, inputClass } from "@/components/ui/field";
import { ICON_DENSE } from "@/components/ui/icon-button";

export function PortraitForm({ id, has }: { id: string; has: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <ActionForm action={uploadPortraitAction} className="flex flex-col gap-4">
        <input type="hidden" name="character_id" value={id} />
        <Field id="portrait-file" label={has ? "New image" : "Image"} hint="PNG or WebP, up to 1 MB and 1024 × 1024 pixels. Only upload images of real people with their consent.">
          <input {...described("portrait-file", { hint: true })} type="file" name="file" accept="image/png,image/webp" required className={`${inputClass} text-caption file:mr-3 file:rounded-control file:border-0 file:bg-desk file:px-2 file:py-1 file:text-label file:font-medium file:text-ink`} />
        </Field>
        <Field id="portrait-alt" label="Alt text" hint="Describe the image for people who cannot see it.">
          <TextInput {...described("portrait-alt", { hint: true })} name="alt" required maxLength={200} />
        </Field>
        <details className="rounded-control border border-rule px-3 py-2">
          <summary className="cursor-pointer text-label font-medium text-ink">Made by someone else, or with a generative tool?</summary>
          <div className="mt-3 flex flex-col gap-3 pb-1">
            <Field id="portrait-license" label="Licence" optional>
              <TextInput {...described("portrait-license")} name="license" maxLength={80} placeholder="CC-BY-4.0" />
            </Field>
            <Field id="portrait-credit" label="Credit" optional>
              <TextInput {...described("portrait-credit")} name="credit" maxLength={200} placeholder="The artist's name" />
            </Field>
            <Field id="portrait-provenance" label="Provenance" optional>
              <TextInput {...described("portrait-provenance")} name="provenance" maxLength={500} placeholder="Tool, model, date" />
            </Field>
          </div>
        </details>
        <div>
          <Button type="submit" icon={<Upload {...ICON_DENSE} />}>
            Upload portrait
          </Button>
        </div>
      </ActionForm>
      {has && (
        <ActionForm action={removePortraitAction} className="border-t border-rule pt-4">
          <input type="hidden" name="character_id" value={id} />
          <Button type="submit" variant="danger" size="sm" icon={<Trash2 {...ICON_DENSE} />}>
            Remove portrait
          </Button>
        </ActionForm>
      )}
    </div>
  );
}
