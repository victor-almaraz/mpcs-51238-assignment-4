// Operator console (app-flow.md, Route map: /admin; runbooks/content-publishing.md,
// content-reports.md, instance-recovery.md): materials, instance inspection, reports, and the log.
// Non-operators get the 404 page.
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { inspectInstance, listBundles, operatorLog, replayInstance } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { listedAction, publishAction, reportAction, restoreAction } from "@/lib/server/admin-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const field = "rounded-control border border-border bg-page px-2 py-1";
const button = "rounded-control border border-border px-3 py-1 font-ui text-control";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 flex flex-col gap-3">
      <h2 className="font-display text-heading">{title}</h2>
      {children}
    </section>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ inspect?: string; reason?: string }> }) {
  const user = await pageUser();
  const store = serverStore();
  let bundles;
  try {
    bundles = await listBundles(store, user.id);
  } catch (e) {
    if (e instanceof ApiError && e.code === "not_found") notFound();
    throw e;
  }
  const { inspect, reason } = await searchParams;
  const inspected = inspect && reason ? await inspectInstance(store, user.id, inspect, reason).catch((e: Error) => e.message) : null;
  const replayed = inspected && typeof inspected !== "string" ? await replayInstance(store, user.id, { instance_id: inspected.id }).catch((e: Error) => ({ error: e.message })) : null;
  const log = await operatorLog(store, user.id);

  return (
    <div className="mx-auto max-w-[48rem] px-6 py-10">
      <h1 className="font-display text-title">Operator console</h1>

      <Section title="Materials">
        <ActionForm action={publishAction} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <select name="kind" className={field}>
              <option value="setting">Setting</option>
              <option value="adventure">Adventure</option>
            </select>
            <input type="file" name="bundle" accept="application/json,.json" className="font-ui text-caption" />
          </div>
          <textarea name="json" rows={3} placeholder="Or paste the compiled bundle JSON" className={`${field} font-mono text-code`} />
          <div>
            <button type="submit" className={button}>
              Publish bundle
            </button>
          </div>
        </ActionForm>
        <table className="font-ui text-caption">
          <tbody>
            {bundles.map((b) => (
              <tr key={`${b.kind}:${b.id}@${b.version}`} className="border-b border-rule">
                <td className="py-1 pr-3">{b.kind}</td>
                <td className="pr-3">
                  {b.id} {b.version}
                </td>
                <td className="pr-3 text-muted">
                  {b.system} {b.system_versions} · {b.origin}
                </td>
                <td>
                  <ActionForm action={listedAction}>
                    <input type="hidden" name="kind" value={b.kind} />
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="version" value={b.version} />
                    <input type="hidden" name="listed" value={b.listed ? "false" : "true"} />
                    <button type="submit" className="text-accent">
                      {b.listed ? "Unlist" : "List"}
                    </button>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Instances">
        <form className="flex flex-wrap items-end gap-2">
          <input name="inspect" required placeholder="Instance id" defaultValue={inspect} className={field} />
          <input name="reason" required placeholder="Reason, such as a report date" defaultValue={reason} className={`${field} flex-1`} />
          <button type="submit" className={button}>
            Inspect
          </button>
        </form>
        {typeof inspected === "string" && <p className="text-danger">{inspected}</p>}
        {inspected && typeof inspected !== "string" && (
          <>
            <p className="font-ui text-caption">
              {inspected.name} · {inspected.status} · version {inspected.version} · replay: {replayed && "matches_stored" in replayed ? (replayed.matches_stored ? "matches the stored state" : `diverges at ${replayed.diverges_at}`) : JSON.stringify(replayed)}
            </p>
            <details>
              <summary className="cursor-pointer font-ui text-caption text-muted">Full state</summary>
              <pre className="max-h-96 overflow-auto font-mono text-code">{JSON.stringify(inspected.state, null, 2)}</pre>
            </details>
            <ActionForm action={restoreAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="instance_id" value={inspected.id} />
              <input type="number" name="to_version" required min={1} placeholder="To version" className={`${field} w-28`} />
              <input name="reason" required placeholder="Reason" className={`${field} flex-1`} />
              <button type="submit" className={button}>
                Restore (paused only)
              </button>
            </ActionForm>
          </>
        )}
      </Section>

      <Section title="Reports">
        <ActionForm action={reportAction} className="flex flex-wrap items-end gap-2">
          <select name="action" className={field}>
            <option value="hold">Hold</option>
            <option value="release">Release hold</option>
            <option value="remove">Remove content</option>
            <option value="end">End game</option>
            <option value="suspend">Suspend account</option>
            <option value="unsuspend">Lift suspension</option>
          </select>
          <select name="kind" className={field}>
            <option value="user">User</option>
            <option value="character">Character</option>
            <option value="campaign">Campaign</option>
            <option value="instance">Instance</option>
            <option value="asset">Asset (hash)</option>
          </select>
          <input name="id" required placeholder="Id" className={field} />
          <input name="reason" required placeholder="Reason or note" className={`${field} flex-1`} />
          <button type="submit" className={button}>
            Apply
          </button>
        </ActionForm>
      </Section>

      <Section title="Log">
        <ul className="font-ui text-caption">
          {log.map((l) => (
            <li key={l.id} className="border-b border-rule py-1">
              {l.at.slice(0, 16).replace("T", " ")} · {l.action} {l.target} {l.detail && <span className="text-muted">· {l.detail}</span>}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
