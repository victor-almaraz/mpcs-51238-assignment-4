// Archiving, unarchiving, deleting, and restoring a campaign, character, or adventure draft, the same
// way for each (api.md, Campaigns, Characters, Adventure drafts; app-flow.md, Characters, Campaigns,
// and My adventures). Each form posts the record's id in its kind's `field` to the kind's server
// action. Archiving keeps the record; deleting hides it at once, its owner can restore it for 30 days,
// and it is erased within 90 days, or with the owner's account.
import type { ReactNode } from "react";
import { Archive, ArchiveRestore, RotateCcw, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { formatWhen } from "@/components/when";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, TextInput, described } from "@/components/ui/field";
import { ICON, ICON_DENSE, IconButton } from "@/components/ui/icon-button";
import { List, ListRow } from "@/components/ui/list";
import { Notice } from "@/components/ui/notice";
import { Section } from "@/components/ui/page";
import { archiveCharacterAction, deleteCharacterAction, restoreCharacterAction, retireCharacterAction, unarchiveCharacterAction } from "@/lib/server/actions";
import { archiveCampaignAction, deleteCampaignAction, restoreCampaignAction, unarchiveCampaignAction } from "@/lib/server/campaign-actions";
import { archiveDraftAction, deleteDraftAction, restoreDraftAction, unarchiveDraftAction } from "@/lib/server/draft-actions";
import type { FormState } from "@/lib/server/forms";

export type Kind = "campaign" | "character" | "draft";
type Action = (state: FormState, form: FormData) => Promise<FormState>;

interface Lifecycle {
  /** The form field that carries the record's id. */
  field: string;
  archive: Action;
  unarchive: Action;
  delete: Action;
  restore: Action;
  /** What archiving keeps and stops. */
  note: string;
  /** The archived notice's sentence, when it says more than `note`. */
  notice?: string;
  /** Delete's sentence on what follows, and which of the record's words confirms it; a draft is deleted from its row without either. */
  confirm?: { consequence: string; by: "name" | "title" };
  /** The hub's Archived section's description. */
  archived: { description: string };
  /** The hub's Recently deleted section's description. */
  deleted: string;
}

const KINDS: Record<Kind, Lifecycle> = {
  campaign: {
    field: "campaign_id",
    archive: archiveCampaignAction,
    unarchive: unarchiveCampaignAction,
    delete: deleteCampaignAction,
    restore: restoreCampaignAction,
    note: "An archived campaign keeps its games and members, and accepts no new games, members, or invitations. Archiving turns its invite link off; after unarchiving, enable a new one under Invitations.",
    confirm: {
      consequence: "Its games end, and every member loses access at once. You can restore it from the Campaigns page for 30 days. Within 90 days it is erased with its games and invitations.",
      by: "title",
    },
    archived: {
      description: "Archived campaigns keep their games and members, and accept no new games, members, or invitations.",
    },
    deleted: "Deleted campaigns are hidden from every member. You can restore one for 30 days; within 90 days it is erased with its games.",
  },
  character: {
    field: "character_id",
    archive: archiveCharacterAction,
    unarchive: unarchiveCharacterAction,
    delete: deleteCharacterAction,
    restore: restoreCharacterAction,
    note: "An archived character keeps its sheet and portrait, and cannot join games.",
    confirm: {
      consequence: "It disappears from your characters at once. You can restore it from the Characters page for 30 days. Within 90 days it is erased with its portrait.",
      by: "name",
    },
    archived: {
      description: "Archived characters keep their sheets and portraits, and cannot join games.",
    },
    deleted: "Deleted characters are hidden. You can restore one for 30 days; within 90 days it is erased with its portrait.",
  },
  draft: {
    field: "draft_id",
    archive: archiveDraftAction,
    unarchive: unarchiveDraftAction,
    delete: deleteDraftAction,
    restore: restoreDraftAction,
    note: "An archived draft keeps its content and published versions, and cannot be published.",
    notice: "An archived draft keeps its content and published versions, and cannot be published. Unarchive it to publish.",
    archived: {
      description: "Archived drafts keep their content and published versions, and cannot be published.",
    },
    deleted: "Deleted drafts are hidden; their published versions stay usable. You can restore one for 30 days; within 90 days it is erased.",
  },
};

interface Target {
  kind: Kind;
  id: string;
}

function Id({ kind, id }: Target) {
  return <input type="hidden" name={KINDS[kind].field} value={id} />;
}

/** The note on what archiving keeps and stops, and the Archive button. */
export function ArchiveForm({ kind, id }: Target) {
  return (
    <ActionForm action={KINDS[kind].archive} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Id kind={kind} id={id} />
      <p className="text-muted">{KINDS[kind].note} You can unarchive it at any time.</p>
      <Button type="submit" variant="secondary" className="shrink-0 self-start sm:self-center">
        {`Archive ${kind}`}
      </Button>
    </ActionForm>
  );
}

export function UnarchiveForm({ kind, id, title }: Target & { title?: string }) {
  return (
    <ActionForm action={KINDS[kind].unarchive}>
      <Id kind={kind} id={id} />
      <Button type="submit" size="sm" icon={<ArchiveRestore {...ICON_DENSE} />} aria-label={title ? `Unarchive ${title}` : undefined}>
        Unarchive
      </Button>
    </ActionForm>
  );
}

function RestoreForm({ kind, id, title }: Target & { title: string }) {
  return (
    <ActionForm action={KINDS[kind].restore}>
      <Id kind={kind} id={id} />
      <Button type="submit" size="sm" icon={<RotateCcw {...ICON_DENSE} />} aria-label={`Restore ${title}`}>
        Restore
      </Button>
    </ActionForm>
  );
}

/** The archived state, with Unarchive unless `unarchive` is false (a campaign's members other than its author). */
export function ArchivedNotice({ kind, id, unarchive = true, className }: Target & { unarchive?: boolean; className?: string }) {
  const k = KINDS[kind];
  return (
    <Notice title={`This ${kind} is archived`} className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{k.notice ?? k.note}</p>
        {unarchive && <UnarchiveForm kind={kind} id={id} />}
      </div>
    </Notice>
  );
}

/** Delete, confirmed by typing the record's `name` (its name or title, as its kind says) into `confirm`, after a sentence on what follows. */
export function DeleteForm({ kind, id, name }: Target & { kind: "campaign" | "character"; name: string }) {
  const { consequence, by } = KINDS[kind].confirm!;
  const input = `delete-${kind}-confirm`;
  return (
    <ActionForm action={KINDS[kind].delete} className="flex flex-col gap-4">
      <Id kind={kind} id={id} />
      <p className="text-ink">{consequence}</p>
      <Field id={input} label={`Type the ${kind}'s ${by}, ${name}, to confirm`}>
        <TextInput {...described(input)} name="confirm" required autoComplete="off" />
      </Field>
      <div>
        <Button type="submit" variant="danger" icon={<Trash2 {...ICON_DENSE} />}>
          {`Delete ${kind}`}
        </Button>
      </div>
    </ActionForm>
  );
}

export interface ArchivedItem {
  id: string;
  title: string;
  href?: string;
  meta: ReactNode;
  /** Whether the viewer may unarchive it; true unless said otherwise. */
  unarchive?: boolean;
}

/** A hub's Archived section: the archived records, each with Unarchive, or an empty state. */
export function ArchivedSection({ kind, items }: { kind: Kind; items: ArchivedItem[] }) {
  const k = KINDS[kind].archived;
  // Like Recently deleted, the section appears only once there is something in it.
  if (items.length === 0) return null;
  return (
    <Section id="archived" title={`Archived (${items.length})`} description={k.description}>
      <List>
        {items.map((r) => (
          <ListRow
            key={r.id}
            icon={<Archive {...ICON_DENSE} />}
            title={r.title}
            href={r.href}
            meta={r.meta}
            actions={r.unarchive === false ? undefined : <UnarchiveForm kind={kind} id={r.id} title={r.title} />}
          />
        ))}
      </List>
    </Section>
  );
}

export interface DeletedItem {
  id: string;
  title: string;
  deleted_at: string;
  restorable_until: string;
}

/** A hub's Recently deleted section, shown when not empty: each deletion's date, its last day to restore, and Restore. */
export function DeletedSection({ kind, items, timezone }: { kind: Kind; items: DeletedItem[]; timezone: string }) {
  if (items.length === 0) return null;
  return (
    <Section id="deleted" title={`Recently deleted (${items.length})`} description={KINDS[kind].deleted}>
      <List>
        {items.map((r) => (
          <ListRow
            key={r.id}
            icon={<Trash2 {...ICON_DENSE} />}
            title={r.title}
            meta={`Deleted ${formatWhen(r.deleted_at, timezone)} · restore until ${formatWhen(r.restorable_until, timezone)}`}
            actions={<RestoreForm kind={kind} id={r.id} title={r.title} />}
          />
        ))}
      </List>
    </Section>
  );
}

/** Retire character (api.md, retire_character): for good, unlike archiving. */
export function RetireForm({ characterId }: { characterId: string }) {
  return (
    <ActionForm action={retireCharacterAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Id kind="character" id={characterId} />
      <p className="text-muted">A retired character can never join a game again.</p>
      <Button type="submit" variant="danger" className="shrink-0 self-start sm:self-center">
        Retire character
      </Button>
    </ActionForm>
  );
}

/**
 * A draft row's Archive and Delete. Stacked under the title on compact screens, the row pulls them back
 * by the icon buttons' 8 px inset so the icons, not the buttons' edges, line up with the title.
 */
export function DraftActions({ draftId, title }: { draftId: string; title: string }) {
  return (
    <div className="flex items-center gap-1 max-sm:-ml-2">
      <ActionForm action={KINDS.draft.archive}>
        <Id kind="draft" id={draftId} />
        <IconButton type="submit" tip="end" label={`Archive ${title}`} icon={<Archive {...ICON} />} />
      </ActionForm>
      <ActionForm action={KINDS.draft.delete}>
        <Id kind="draft" id={draftId} />
        <IconButton type="submit" tone="danger" tip="end" label={`Delete ${title}`} icon={<Trash2 {...ICON} />} />
      </ActionForm>
    </div>
  );
}
