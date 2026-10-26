// Archiving, unarchiving, deleting, and restoring a character (api.md, Characters;
// SPEC_ISSUES.md#character-draft-archive). Archiving keeps the character and keeps it out of games.
// Deleting hides it at once; its owner can restore it for 30 days, and it is erased within 90 days, or
// with the owner's account. A character in a game can be neither.
import { ActionForm } from "@/components/action-form";
import * as lifecycle from "@/components/lifecycle";
import { Button } from "@/components/ui/button";
import { archiveCharacterAction, deleteCharacterAction, restoreCharacterAction, retireCharacterAction, unarchiveCharacterAction } from "@/lib/server/actions";

export const ARCHIVE_NOTE = "An archived character keeps its sheet and portrait, and cannot join games.";

export function ArchiveForm({ characterId }: { characterId: string }) {
  return <lifecycle.ArchiveForm action={archiveCharacterAction} field="character_id" id={characterId} note={ARCHIVE_NOTE} label="Archive character" />;
}

export function UnarchiveForm({ characterId, name }: { characterId: string; name?: string }) {
  return <lifecycle.UnarchiveForm action={unarchiveCharacterAction} field="character_id" id={characterId} title={name} />;
}

export function RestoreForm({ characterId, name }: { characterId: string; name: string }) {
  return <lifecycle.RestoreForm action={restoreCharacterAction} field="character_id" id={characterId} title={name} />;
}

export function ArchivedNotice({ characterId, className }: { characterId: string; className?: string }) {
  return <lifecycle.ArchivedNotice title="This character is archived" note={ARCHIVE_NOTE} unarchive={<UnarchiveForm characterId={characterId} />} className={className} />;
}

/** Retire character (api.md, retire_character): for good, unlike archiving. */
export function RetireForm({ characterId }: { characterId: string }) {
  return (
    <ActionForm action={retireCharacterAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input type="hidden" name="character_id" value={characterId} />
      <p className="text-muted">A retired character can never join a game again.</p>
      <Button type="submit" variant="danger" className="shrink-0 self-start sm:self-center">
        Retire character
      </Button>
    </ActionForm>
  );
}

export function DeleteCharacterForm({ characterId, name }: { characterId: string; name: string }) {
  return (
    <lifecycle.DeleteForm
      action={deleteCharacterAction}
      field="character_id"
      id={characterId}
      noun="character"
      name={name}
      consequence="It disappears from your characters at once. You can restore it from the Characters page for 30 days. Within 90 days it is erased with its portrait."
    />
  );
}
