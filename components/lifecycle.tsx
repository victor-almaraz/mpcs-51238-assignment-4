// Archiving, unarchiving, deleting, and restoring a campaign, character, or adventure draft, the same
// way for each (SPEC_ISSUES.md#campaign-unarchive, #character-draft-archive). Each form posts the
// record's id in `field` (campaign_id, character_id, draft_id) to its server action.
import type { ReactNode } from "react";
import { ArchiveRestore, RotateCcw, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, TextInput, described } from "@/components/ui/field";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import type { FormState } from "@/lib/server/forms";

type Action = (state: FormState, form: FormData) => Promise<FormState>;
interface Target {
  action: Action;
  field: string;
  id: string;
}

/** The note on what archiving keeps and stops, and the Archive button. */
export function ArchiveForm({ action, field, id, note, label }: Target & { note: string; label: string }) {
  return (
    <ActionForm action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input type="hidden" name={field} value={id} />
      <p className="text-muted">{note} You can unarchive it at any time.</p>
      <Button type="submit" variant="secondary" className="shrink-0 self-start sm:self-center">
        {label}
      </Button>
    </ActionForm>
  );
}

export function UnarchiveForm({ action, field, id, title }: Target & { title?: string }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name={field} value={id} />
      <Button type="submit" size="sm" icon={<ArchiveRestore {...ICON_DENSE} />} aria-label={title ? `Unarchive ${title}` : undefined}>
        Unarchive
      </Button>
    </ActionForm>
  );
}

export function RestoreForm({ action, field, id, title }: Target & { title: string }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name={field} value={id} />
      <Button type="submit" size="sm" icon={<RotateCcw {...ICON_DENSE} />} aria-label={`Restore ${title}`}>
        Restore
      </Button>
    </ActionForm>
  );
}

/** The archived state, with `unarchive` (an UnarchiveForm) for whoever may unarchive. */
export function ArchivedNotice({ title, note, unarchive, className }: { title: string; note: string; unarchive?: ReactNode; className?: string }) {
  return (
    <Notice title={title} className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{note}</p>
        {unarchive}
      </div>
    </Notice>
  );
}

/** Delete, confirmed by typing the record's `name` (its name or title, as `by` says) into `confirm`, after a sentence on what follows. */
export function DeleteForm({ action, field, id, noun, name, by = "name", consequence }: Target & { noun: string; name: string; by?: "name" | "title"; consequence: string }) {
  const input = `delete-${noun}-confirm`;
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <input type="hidden" name={field} value={id} />
      <p className="text-ink">{consequence}</p>
      <Field id={input} label={`Type the ${noun}'s ${by}, ${name}, to confirm`}>
        <TextInput {...described(input)} name="confirm" required autoComplete="off" />
      </Field>
      <div>
        <Button type="submit" variant="danger" icon={<Trash2 {...ICON_DENSE} />}>
          {`Delete ${noun}`}
        </Button>
      </div>
    </ActionForm>
  );
}
