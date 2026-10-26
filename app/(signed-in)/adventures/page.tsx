// My adventures (app-flow.md, Route map: /adventures): the user's drafts and published versions. A hub
// (docs/design/README.md, Page layouts): drafts as rows that open the editor, then what is published;
// then archived drafts, with Unarchive, and recently deleted ones, with Restore
// (app-flow.md, Characters, Campaigns, and My adventures).
import { BookOpen, FilePen, Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { ArchivedSection, DeletedSection, DraftActions } from "@/components/lifecycle";
import { formatWhen } from "@/components/when";
import { listDeletedDrafts, listDrafts } from "@/lib/api/drafts";
import { listMaterials } from "@/lib/api/materials";
import { deleteMaterialAction } from "@/lib/server/draft-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { plural } from "@/lib/text";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
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
  const saved = (d: (typeof drafts.items)[number]) => (
    <>
      Saved {formatWhen(d.updated_at, user.timezone)}
      {d.last_published_version && ` · Published ${d.last_published_version}`}
    </>
  );
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
      <Section id="drafts" title="Drafts" description={drafts.items.length > 0 ? plural(drafts.items.length, "draft") : undefined}>
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
                badge={d.problems > 0 ? <Badge tone="warning">{plural(d.problems, "problem")}</Badge> : <Badge tone="success">No problems</Badge>}
                meta={saved(d)}
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
              <ListRow
                key={`${m.id}@${m.version}`}
                icon={<BookOpen {...ICON_DENSE} />}
                title={m.title}
                badge={<Badge tone="accent">{m.version}</Badge>}
                meta={<span className="font-mono">{m.id}</span>}
                actions={
                  <ActionForm action={deleteMaterialAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="version" value={m.version} />
                    <ConfirmButton
                      as="icon"
                      tip="end"
                      label={`Delete ${m.title} ${m.version}`}
                      icon={<Trash2 {...ICON} />}
                      title={`Delete ${m.title} ${m.version}?`}
                      description="This published version is deleted for good; your draft stays. A version that a campaign or a game uses cannot be deleted, since games replay from it."
                      confirm="Delete"
                    />
                  </ActionForm>
                }
              />
            ))}
          </List>
        )}
      </Section>
      <ArchivedSection kind="draft" items={archived.items.map((d) => ({ id: d.id, title: d.title, href: `/adventures/${d.id}/edit`, meta: saved(d) }))} />
      <DeletedSection kind="draft" items={deleted} timezone={user.timezone} />
    </Page>
  );
}
