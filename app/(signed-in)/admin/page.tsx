// Operator console (app-flow.md, Route map: /admin; runbooks/content-publishing.md,
// content-reports.md, instance-recovery.md): materials, instance inspection, reports, and the log.
// Non-operators get the 404 page.
import { ActionForm } from "@/components/action-form";
import { ScrollText, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmButton } from "@/components/ui/confirm";
import { described, Field, Select, TextArea } from "@/components/ui/field";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { listBundles, operatorLog, REPORT_ACTIONS, settingDependents } from "@/lib/api/admin";
import { orNotFound } from "@/lib/server/pages";
import { listedAction, publishAction } from "@/lib/server/admin-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { InspectPanel, ReportForm } from "./forms";
import { plural } from "@/lib/text";

/** What unlisting a setting version takes away, for its confirmation. */
function unlistWarning(id: string, version: string, d: { drafts: number; adventures: number }): string {
  if (d.drafts === 0 && d.adventures === 0) return `No draft or listed adventure depends on ${id} ${version} alone. New drafts and campaigns can no longer choose it.`;
  return `${plural(d.drafts, "draft")} and ${plural(d.adventures, "listed adventure")} depend on ${id} ${version}. Those drafts lose its terrain, templates, and conditions until it is listed again, and new campaigns can no longer choose it.`;
}

export default async function Admin() {
  const user = await pageUser();
  const store = serverStore();
  const bundles = await orNotFound(listBundles(store, user.id));
  const dependents = new Map<string, { drafts: number; adventures: number }>();
  for (const b of bundles) if (b.kind === "setting" && b.listed) dependents.set(`${b.id}@${b.version}`, await settingDependents(store, user.id, { id: b.id, version: b.version }));
  const log = await operatorLog(store, user.id);

  return (
    <Page>
      <PageHeader title="Operator console" status={<Badge tone="danger">Operator</Badge>} />
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
          <div className="mt-6 relative overflow-x-auto rounded-card border border-rule bg-page">
            <table className="w-full text-left text-caption">
              <caption className="sr-only">Published bundles</caption>
              <thead className="border-b border-rule bg-desk text-label text-muted">
                <tr>
                  <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">Kind</th>
                  <th scope="col" className="px-4 py-2 font-medium">Bundle</th>
                  <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">System and origin</th>
                  <th scope="col" className="px-4 py-2 font-medium">Listing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {bundles.map((b) => (
                  <tr key={`${b.kind}:${b.id}@${b.version}`}>
                    <td className="hidden px-4 py-2 capitalize sm:table-cell">{b.kind}</td>
                    <td className="px-4 py-2">
                      <span className="font-mono">
                        {b.id} <span className="tabular">{b.version}</span>
                      </span>
                      {/* Narrow screens show the kind, system, and origin under the bundle instead of in columns. */}
                      <span className="block text-muted md:hidden">
                        <span className="capitalize sm:hidden">{b.kind} · </span>
                        {b.system} {b.system_versions} · {b.origin}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-2 text-muted md:table-cell">
                      {b.system} {b.system_versions} · {b.origin}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Badge tone={b.listed ? "success" : "neutral"}>{b.listed ? "Listed" : "Unlisted"}</Badge>
                        <ActionForm action={listedAction}>
                          <input type="hidden" name="kind" value={b.kind} />
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="version" value={b.version} />
                          <input type="hidden" name="listed" value={b.listed ? "false" : "true"} />
                          {b.listed && b.kind === "setting" ? (
                            <ConfirmButton size="sm" label="Unlist" title={`Unlist ${b.id} ${b.version}?`} description={unlistWarning(b.id, b.version, dependents.get(`${b.id}@${b.version}`)!)} confirm="Unlist" />
                          ) : (
                            <Button type="submit" variant="quiet" size="sm" aria-label={`${b.listed ? "Unlist" : "List"} ${b.id} ${b.version}`}>
                              {b.listed ? "Unlist" : "List"}
                            </Button>
                          )}
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="instances" title="Instances" description="Inspect a game's state, or restore a paused one to an earlier version." className="flex flex-col">
          <Card className="flex flex-1 flex-col gap-4">
            <InspectPanel />
          </Card>
        </Section>

        <Section id="reports" title="Reports" description="Act on a content report: hold, remove, end a game, or suspend an account." className="flex flex-col">
          <Card className="flex-1">
            <ReportForm actions={REPORT_ACTIONS} />
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
