"use client";
// Create invitation (app-flow.md, Campaign editor, Invitations): the new code and link with Copy, shown once.
import { Check, Copy } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { inviteAction, type InviteState } from "@/lib/server/campaign-actions";
import { Button } from "./ui/button";
import { Field, TextArea, TextInput, described } from "./ui/field";
import { ICON_DENSE } from "./ui/icon-button";
import { Notice } from "./ui/notice";

export function InviteForm({ campaignId, origin }: { campaignId: string; origin: string }) {
  const [state, run, pending] = useActionState<InviteState, FormData>(inviteAction, { error: null });
  const link = state.url ? `${origin}${state.url}` : undefined;
  return (
    <form action={run} className="flex flex-col gap-4">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <Field id={`invite-message-${campaignId}`} label="Message" hint="Shown to whoever opens the code." optional>
        <TextArea {...described(`invite-message-${campaignId}`, { hint: true })} name="message" maxLength={500} rows={2} />
      </Field>
      <Field id={`invite-note-${campaignId}`} label="Note" hint="For you: whom the code is for." optional>
        <TextInput {...described(`invite-note-${campaignId}`, { hint: true })} name="note" maxLength={80} />
      </Field>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create invitation"}
        </Button>
      </div>
      {state.error && (
        <Notice tone="danger" live>
          {state.error}
        </Notice>
      )}
      {state.code && link && (
        <Notice tone="success" live title="Shown once. Give the code or the link to the player.">
          <dl className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <dt className="text-caption text-muted">Code</dt>
                <dd className="font-mono text-code">{state.code}</dd>
              </div>
              <CopyButton text={state.code} label="Copy code" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <dt className="text-caption text-muted">Link</dt>
                <dd className="break-all font-mono text-code">{link}</dd>
              </div>
              <CopyButton text={link} label="Copy link" />
            </div>
          </dl>
        </Notice>
      )}
    </form>
  );
}

/** Copies `text`; says "Copied" for a moment in a polite live region. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button size="sm" icon={copied ? <Check {...ICON_DENSE} /> : <Copy {...ICON_DENSE} />} onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}
