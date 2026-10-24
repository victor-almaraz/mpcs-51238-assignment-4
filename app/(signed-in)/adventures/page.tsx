// My adventures (app-flow.md, Route map: /adventures): the user's drafts and published versions. A hub
// (docs/design/README.md, Page layouts): drafts as rows that open the editor, then what is published.
import { BookOpen, FilePen, Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { formatWhen } from "@/components/when";
import { listDrafts } from "@/lib/api/drafts";
import { listMaterials } from "@/lib/api/materials";
import { deleteDraftAction } from "@/lib/server/draft-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { List, ListRow } from "@/components/ui/list";
import { Page, PageHeader, Section } from "@/components/ui/page";

export default async function Adventures() {
  const user = await pageUser();
  const store = serverStore();
  const drafts = await listDrafts(store, user.id, { limit: 100 });
  const published = await listMaterials(store, user.id, { owner: "me", kind: "adventure" });
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
            No drafts.
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
                actions={
                  <ActionForm action={deleteDraftAction}>
                    <input type="hidden" name="draft_id" value={d.id} />
                    <Button type="submit" variant="danger" size="sm" icon={<Trash2 {...ICON_DENSE} />}>
                      Delete<span className="sr-only"> {d.title}</span>
                    </Button>
                  </ActionForm>
                }
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
    </Page>
  );
}
