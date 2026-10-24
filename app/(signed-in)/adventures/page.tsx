// My adventures (app-flow.md, Route map: /adventures): the user's drafts and published versions.
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { formatWhen } from "@/components/when";
import { listDrafts } from "@/lib/api/drafts";
import { listMaterials } from "@/lib/api/materials";
import { deleteDraftAction } from "@/lib/server/draft-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

export default async function Adventures() {
  const user = await pageUser();
  const store = serverStore();
  const drafts = await listDrafts(store, user.id, { limit: 100 });
  const published = await listMaterials(store, user.id, { owner: "me", kind: "adventure" });
  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-title">My adventures</h1>
        <Link href="/adventures/new" className="font-ui text-control text-accent">
          New adventure
        </Link>
      </div>
      <section className="mt-8">
        <h2 className="font-display text-heading">Drafts</h2>
        {drafts.items.length === 0 ? (
          <p className="mt-2 text-muted">
            No drafts.{" "}
            <Link href="/adventures/new" className="text-accent underline">
              Write an adventure
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-2">
            {drafts.items.map((d) => (
              <li key={d.id} className="flex items-baseline justify-between border-b border-rule py-1">
                <span>
                  <Link href={`/adventures/${d.id}/edit`} className="text-accent">
                    {d.title}
                  </Link>
                  <span className="ml-2 font-ui text-caption text-muted">
                    {d.problems > 0 ? `${d.problems} problem${d.problems === 1 ? "" : "s"}` : "no problems"} · saved {formatWhen(d.updated_at, user.timezone)}
                    {d.last_published_version && ` · published ${d.last_published_version}`}
                  </span>
                </span>
                <ActionForm action={deleteDraftAction}>
                  <input type="hidden" name="draft_id" value={d.id} />
                  <button type="submit" className="font-ui text-caption text-danger">
                    Delete
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="font-display text-heading">Published</h2>
        {published.length === 0 ? (
          <p className="mt-2 text-muted">Nothing published yet.</p>
        ) : (
          <ul className="mt-2">
            {published.map((m) => (
              <li key={`${m.id}@${m.version}`} className="border-b border-rule py-1">
                {m.title} <span className="font-ui text-caption text-muted">{m.version}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
