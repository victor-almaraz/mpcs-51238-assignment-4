"use client";
// Upload portrait (app-flow.md, Character editor): an image and its alt text, with optional licence,
// credit, and provenance for images made by someone else or with a generative tool.
import { ActionForm } from "@/components/action-form";
import { removePortraitAction, uploadPortraitAction } from "@/lib/server/actions";

const field = "rounded-control border border-border bg-page px-2 py-1 font-ui text-caption";

export function PortraitForm({ id, has }: { id: string; has: boolean }) {
  return (
    <section className="mt-8 flex flex-col gap-2">
      <h2 className="font-display text-heading">Portrait</h2>
      <ActionForm action={uploadPortraitAction} className="flex flex-col gap-2">
        <input type="hidden" name="character_id" value={id} />
        <input type="file" name="file" accept="image/png,image/webp" required className="font-ui text-caption" />
        <input name="alt" required maxLength={200} placeholder="Describe the image for people who cannot see it" className={field} />
        <details className="font-ui text-caption">
          <summary className="cursor-pointer text-muted">Made by someone else, or with a generative tool?</summary>
          <div className="mt-2 flex flex-col gap-2">
            <input name="license" maxLength={80} placeholder="Licence, such as CC-BY-4.0" className={field} />
            <input name="credit" maxLength={200} placeholder="Credit, such as the artist's name" className={field} />
            <input name="provenance" maxLength={500} placeholder="Provenance: tool, model, date" className={field} />
          </div>
        </details>
        <p className="font-ui text-caption text-muted">PNG or WebP, up to 1 MB and 1024 × 1024 pixels. Only upload images of real people with their consent.</p>
        <div>
          <button type="submit" className="rounded-control border border-border px-3 py-1 font-ui text-control">
            Upload portrait
          </button>
        </div>
      </ActionForm>
      {has && (
        <ActionForm action={removePortraitAction}>
          <input type="hidden" name="character_id" value={id} />
          <button type="submit" className="font-ui text-caption text-danger">
            Remove portrait
          </button>
        </ActionForm>
      )}
    </section>
  );
}
