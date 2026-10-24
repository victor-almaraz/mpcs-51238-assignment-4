// Operator console (app-flow.md, Route map: /admin; runbooks/content-publishing.md,
// content-reports.md, instance-recovery.md): materials, instance inspection, reports, and the log.
// Non-operators get the 404 page.
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Gavel, RotateCcw, ScrollText, Search, Upload } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { described, Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { DescriptionList } from "@/components/ui/list";
import { Notice } from "@/components/ui/notice";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { inspectInstance, listBundles, operatorLog, replayInstance } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { listedAction, publishAction, reportAction, restoreAction } from "@/lib/server/admin-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

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
    <Page>
      <PageHeader title="Operator console" description="Materials, instance inspection and recovery, content reports, and the operator log." status={<Badge tone="danger">Operator</Badge>} />
      <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2 [&>*]:min-w-0">
        <Section id="materials" title="Materials" description="Publish a compiled setting or adventure bundle, and list or unlist versions." className="lg:col-span-2">
          <Card className="flex flex-col gap-4">
            <ActionForm action={publishAction} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <Field id="bundle-kind" label="Kind">
                  <Select id="bundle-kind" name="kind">
                    <option value="setting">Setting</option>
                    <option value="adventure">Adventure</option>
                  </Select>
                </Field>
                <Field id="bundle-file" label="Bundle file" hint="A compiled bundle, as JSON.">
                  <input type="file" name="bundle" accept="application/json,.json" {...described("bundle-file", { hint: true })} className="block w-full text-caption file:mr-3 file:h-9 file:rounded-control file:border file:border-border file:bg-page file:px-3 file:text-control file:text-ink" />
                </Field>
              </div>
              <Field id="bundle-json" label="Or paste the compiled bundle JSON" optional>
                <TextArea id="bundle-json" name="json" rows={3} className="font-mono text-code" />
              </Field>
              <div>
                <Button type="submit" variant="primary" icon={<Upload {...ICON_DENSE} />}>
                  Publish bundle
                </Button>
              </div>
            </ActionForm>
          </Card>
          <div className="mt-4 relative overflow-x-auto rounded-card border border-rule bg-page">
            <table className="w-full text-left text-caption">
              <caption className="sr-only">Published bundles</caption>
              <thead className="border-b border-rule bg-desk text-label text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Kind</th>
                  <th scope="col" className="px-4 py-2 font-medium">Bundle</th>
                  <th scope="col" className="px-4 py-2 font-medium">System and origin</th>
                  <th scope="col" className="px-4 py-2 font-medium">Listing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {bundles.map((b) => (
                  <tr key={`${b.kind}:${b.id}@${b.version}`}>
                    <td className="px-4 py-2 capitalize">{b.kind}</td>
                    <td className="px-4 py-2 font-mono">
                      {b.id} <span className="tabular">{b.version}</span>
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {b.system} {b.system_versions} · {b.origin}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <Badge tone={b.listed ? "success" : "neutral"}>{b.listed ? "Listed" : "Unlisted"}</Badge>
                        <ActionForm action={listedAction}>
                          <input type="hidden" name="kind" value={b.kind} />
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="version" value={b.version} />
                          <input type="hidden" name="listed" value={b.listed ? "false" : "true"} />
                          <Button type="submit" variant="quiet" size="sm" aria-label={`${b.listed ? "Unlist" : "List"} ${b.id} ${b.version}`}>
                            {b.listed ? "Unlist" : "List"}
                          </Button>
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="instances" title="Instances" description="Inspect an instance's state with a recorded reason; restore a paused one to an earlier version.">
          <Card className="flex flex-col gap-4">
            <form className="flex flex-col gap-4">
              <Field id="inspect" label="Instance id">
                <TextInput id="inspect" name="inspect" required defaultValue={inspect} className="font-mono text-code" />
              </Field>
              <Field id="inspect-reason" label="Reason" hint="Such as a report date.">
                <TextInput name="reason" required defaultValue={reason} {...described("inspect-reason", { hint: true })} />
              </Field>
              <div>
                <Button type="submit" icon={<Search {...ICON_DENSE} />}>
                  Inspect
                </Button>
              </div>
            </form>
            {typeof inspected === "string" && <Notice tone="danger">{inspected}</Notice>}
            {inspected && typeof inspected !== "string" && (
              <div className="flex flex-col gap-4 border-t border-rule pt-4">
                <DescriptionList
                  items={[
                    ["Name", inspected.name],
                    ["Status", <StatusBadge key="s" status={inspected.status} />],
                    ["Version", <span key="v" className="tabular">{inspected.version}</span>],
                    ["Replay", replayed && "matches_stored" in replayed ? (replayed.matches_stored ? "Matches the stored state" : `Diverges at ${replayed.diverges_at}`) : JSON.stringify(replayed)],
                  ]}
                />
                <details className="rounded-control border border-rule">
                  <summary className="cursor-pointer px-3 py-2 text-label font-medium">Full state</summary>
                  <pre className="relative max-h-96 overflow-auto border-t border-rule bg-desk p-3 font-mono text-code">{JSON.stringify(inspected.state, null, 2)}</pre>
                </details>
                <ActionForm action={restoreAction} className="flex flex-col gap-4">
                  <input type="hidden" name="instance_id" value={inspected.id} />
                  <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <Field id="to-version" label="To version">
                      <TextInput id="to-version" type="number" name="to_version" required min={1} className="tabular" />
                    </Field>
                    <Field id="restore-reason" label="Reason">
                      <TextInput id="restore-reason" name="reason" required />
                    </Field>
                  </div>
                  <div>
                    <Button type="submit" variant="danger" icon={<RotateCcw {...ICON_DENSE} />}>
                      Restore (paused only)
                    </Button>
                  </div>
                </ActionForm>
              </div>
            )}
          </Card>
        </Section>

        <Section id="reports" title="Reports" description="Act on a content report: hold, remove, end a game, or suspend an account.">
          <Card>
            <ActionForm action={reportAction} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="report-action" label="Action">
                  <Select id="report-action" name="action">
                    <option value="hold">Hold</option>
                    <option value="release">Release hold</option>
                    <option value="remove">Remove content</option>
                    <option value="end">End game</option>
                    <option value="suspend">Suspend account</option>
                    <option value="unsuspend">Lift suspension</option>
                  </Select>
                </Field>
                <Field id="report-kind" label="Target kind">
                  <Select id="report-kind" name="kind">
                    <option value="user">User</option>
                    <option value="character">Character</option>
                    <option value="campaign">Campaign</option>
                    <option value="instance">Instance</option>
                    <option value="asset">Asset (hash)</option>
                  </Select>
                </Field>
              </div>
              <Field id="report-id" label="Id">
                <TextInput id="report-id" name="id" required className="font-mono text-code" />
              </Field>
              <Field id="report-reason" label="Reason or note">
                <TextInput id="report-reason" name="reason" required />
              </Field>
              <div>
                <Button type="submit" icon={<Gavel {...ICON_DENSE} />}>
                  Apply
                </Button>
              </div>
            </ActionForm>
          </Card>
        </Section>

        <Section id="log" title="Log" description="The last 100 operator actions." className="lg:col-span-2">
          {log.length === 0 ? (
            <EmptyState icon={<ScrollText {...ICON} />}>No operator actions yet.</EmptyState>
          ) : (
            <div className="relative overflow-x-auto rounded-card border border-rule bg-page">
              <table className="w-full text-left text-caption">
                <caption className="sr-only">Operator log</caption>
                <thead className="border-b border-rule bg-desk text-label text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Time (UTC)</th>
                    <th scope="col" className="px-4 py-2 font-medium">Action</th>
                    <th scope="col" className="px-4 py-2 font-medium">Target</th>
                    <th scope="col" className="px-4 py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {log.map((l) => (
                    <tr key={l.id}>
                      <td className="tabular whitespace-nowrap px-4 py-2">{l.at.slice(0, 16).replace("T", " ")}</td>
                      <td className="px-4 py-2 font-medium">{l.action}</td>
                      <td className="px-4 py-2 font-mono">{l.target}</td>
                      <td className="px-4 py-2 text-muted">{l.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </Page>
  );
}
