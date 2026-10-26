"use client";
// The operator console's interactive forms: Inspect, which runs as a form action so a reload does not
// inspect again, with Restore under its result; and Reports, whose target kinds follow the chosen
// action and whose destructive actions ask for confirmation.
import { useState } from "react";
import { Gavel, RotateCcw, Search } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { useFormAction } from "@/components/form-action";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { described, Field, Select, TextInput } from "@/components/ui/field";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { DescriptionList } from "@/components/ui/list";
import { Notice } from "@/components/ui/notice";
import { inspectAction, reportAction, restoreAction, type Inspection } from "@/lib/server/admin-actions";

export function InspectPanel() {
  const [result, form, pending] = useFormAction(inspectAction, { error: null } as Inspection);
  const inspected = result.instance;
  const replay = result.replay;
  return (
    <>
      <form {...form} className="flex flex-col gap-4">
        <fieldset disabled={pending} className="contents">
          <Field id="inspect" label="Instance id">
            <TextInput id="inspect" name="inspect" required className="font-mono text-code" />
          </Field>
          <Field id="inspect-reason" label="Reason" hint="Such as a report date. Each inspection is written to the log.">
            <TextInput name="reason" required {...described("inspect-reason", { hint: true })} />
          </Field>
          <div>
            <Button type="submit" icon={<Search {...ICON_DENSE} />}>
              Inspect
            </Button>
          </div>
        </fieldset>
      </form>
      {result.error && (
        <Notice tone="danger" live>
          {result.error}
        </Notice>
      )}
      {inspected && (
        <div className="flex flex-col gap-4 border-t border-rule pt-4">
          <DescriptionList
            items={[
              ["Name", inspected.name],
              ["Status", <StatusBadge key="s" status={inspected.status} />],
              ["Version", <span key="v" className="tabular">{inspected.version}</span>],
              ["Replay", !replay ? "Not run" : "error" in replay ? `The replay failed: ${replay.error}` : replay.matches_stored ? "Matches the stored state" : `Diverges at version ${replay.diverges_at}`],
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
              <ConfirmButton
                label="Restore (paused only)"
                icon={<RotateCcw {...ICON_DENSE} />}
                title={`Restore ${inspected.name}?`}
                description="The game's state goes back to the version you entered, and everything after it is lost."
                confirm="Restore"
              />
            </div>
          </ActionForm>
        </div>
      )}
    </>
  );
}

type Actions = Record<string, { label: string; kinds: readonly string[] }>;

const KIND_LABELS: Record<string, string> = { user: "User", character: "Character", campaign: "Campaign", instance: "Game (instance id)", asset: "Image (hash)" };

/** What each destructive action does, for its confirmation. */
const CONFIRM: Record<string, { title: string; description: string; confirm: string }> = {
  remove: { title: "Remove this content?", description: "It disappears from every user's view; a character leaves its running game, and a campaign's games end. This cannot be undone.", confirm: "Remove" },
  end: { title: "End this game?", description: "The game ends for every player and cannot be resumed.", confirm: "End game" },
  suspend: { title: "Suspend this account?", description: "The person can still sign in to read and export their data, and can do nothing else until the suspension is lifted.", confirm: "Suspend" },
};

export function ReportForm({ actions }: { actions: Actions }) {
  const names = Object.keys(actions);
  const [action, setAction] = useState(names[0]!);
  const [kind, setKind] = useState(actions[names[0]!]!.kinds[0]!);
  const kinds = actions[action]!.kinds;
  const target = kinds.includes(kind) ? kind : kinds[0]!;
  const confirm = CONFIRM[action];
  return (
    <ActionForm action={reportAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="report-action" label="Action">
          <Select id="report-action" name="action" value={action} onChange={(e) => setAction(e.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>
                {actions[n]!.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="report-kind" label="Target kind">
          <Select id="report-kind" name="kind" value={target} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k] ?? k}
              </option>
            ))}
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
        {confirm ? (
          <ConfirmButton label={actions[action]!.label} icon={<Gavel {...ICON_DENSE} />} title={confirm.title} description={confirm.description} confirm={confirm.confirm} />
        ) : (
          <Button type="submit" icon={<Gavel {...ICON_DENSE} />}>
            Apply
          </Button>
        )}
      </div>
    </ActionForm>
  );
}
