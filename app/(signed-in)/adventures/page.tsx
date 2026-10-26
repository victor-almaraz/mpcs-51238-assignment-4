// My adventures (app-flow.md, Route map: /adventures): the user's drafts and published versions. A hub
// (docs/design/README.md, Page layouts): drafts as rows that open the editor, then what is published;
// then archived drafts, with Unarchive, and recently deleted ones, with Restore
// (SPEC_ISSUES.md#character-draft-archive).
import { Archive, BookOpen, FilePen, Plus, Trash2 } from "lucide-react";
import { DraftActions, RestoreForm, UnarchiveForm } from "@/components/draft-lifecycle";
import { formatWhen } from "@/components/when";
import { listDeletedDrafts, listDrafts } from "@/lib/api/drafts";
import { listMaterials } from "@/lib/api/materials";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { List, ListRow } from "@/components/ui/list";
import { Page, PageHeader, Section } from "@/components/ui/page";

export default async function Adventures() {
  const user = await pageUser();
  const store = serverStore();
  const [drafts, archived, deleted, published] = await Promise.all([
    listDrafts(store, user.id, { archived: false, limit: 100 }),
    listDrafts(store, user.id, { archived: true, limit: 100 }),
    listDeletedDrafts(store, user.id),
    listMaterials(store, user.id, { owner: "me", kind: "adventure" }),
  ]);
  return (
    <Page>
      <PageHeader
        title="My adventures"
        description="Drafts you are writing and the versions you have published."
        actions={
          <ButtonLink href="/adventures/new" variant="primary" icon={<Plus {...ICON_DENSE} />}>
            New adventure
          </ButtonLink>
        }
      />
      <Section id="drafts" title="Drafts" description={drafts.items.length > 0 ? `${drafts.items.length} draft${drafts.items.length === 1 ? "" : "s"}` : undefined}>
        {drafts.items.length === 0 ? (
          <EmptyState
            icon={<FilePen {...ICON} />}
            action={
              <ButtonLink href="/adventures/new" size="sm">
                Write an adventure
              </ButtonLink>
            }
          >
            {archived.items.length > 0 ? "No drafts. Your archived drafts are below." : "No drafts."}
          </EmptyState>
        ) : (
          <List>
            {drafts.items.map((d) => (
              <ListRow
                key={d.id}
                icon={<FilePen {...ICON_DENSE} />}
                title={d.title}
                href={`/adventures/${d.id}/edit`}
                badge={d.problems > 0 ? <Badge tone="warning">{`${d.problems} problem${d.problems === 1 ? "" : "s"}`}</Badge> : <Badge tone="success">No problems</Badge>}
                meta={
                  <>
                    Saved {formatWhen(d.updated_at, user.timezone)}
                    {d.last_published_version && ` · Published ${d.last_published_version}`}
                  </>
                }
                actions={<DraftActions draftId={d.id} title={d.title} />}
              />
            ))}
          </List>
        )}
      </Section>
      <Section id="published" title="Published" description="Usable in campaigns you create.">
        {published.length === 0 ? (
          <EmptyState icon={<BookOpen {...ICON} />}>Nothing published yet.</EmptyState>
        ) : (
          <List>
            {published.map((m) => (
              <ListRow key={`${m.id}@${m.version}`} icon={<BookOpen {...ICON_DENSE} />} title={m.title} badge={<Badge tone="accent">{m.version}</Badge>} meta={<span className="font-mono">{m.id}</span>} />
            ))}
          </List>
        )}
      </Section>
      <Section id="archived" title={`Archived (${archived.items.length})`} description="Archived drafts keep their content and published versions, and cannot be published.">
        {archived.items.length === 0 ? (
          <EmptyState icon={<Archive {...ICON} />}>No archived drafts. Archive a draft from its row above; you can unarchive it here.</EmptyState>
        ) : (
          <List>
            {archived.items.map((d) => (
              <ListRow
                key={d.id}
                icon={<Archive {...ICON_DENSE} />}
                title={d.title}
                href={`/adventures/${d.id}/edit`}
                meta={
                  <>
                    Saved {formatWhen(d.updated_at, user.timezone)}
                    {d.last_published_version && ` · Published ${d.last_published_version}`}
                  </>
                }
                actions={<UnarchiveForm draftId={d.id} title={d.title} />}
              />
            ))}
          </List>
        )}
      </Section>
      {deleted.length > 0 && (
        <Section id="deleted" title={`Recently deleted (${deleted.length})`} description="Deleted drafts are hidden; their published versions stay usable. You can restore one for 30 days; within 90 days it is erased.">
          <List>
            {deleted.map((d) => (
              <ListRow
                key={d.id}
                icon={<Trash2 {...ICON_DENSE} />}
                title={d.title}
                meta={`Deleted ${formatWhen(d.deleted_at, user.timezone)} · restore until ${formatWhen(d.restorable_until, user.timezone)}`}
                actions={<RestoreForm draftId={d.id} title={d.title} />}
              />
            ))}
          </List>
        </Section>
      )}
    </Page>
  );
}
