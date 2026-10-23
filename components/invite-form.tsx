"use client";
// Create invitation (app-flow.md, Campaign editor, Invitations): the new code and link with Copy, shown once.
import { useActionState } from "react";
import { inviteAction, type InviteState } from "@/lib/server/campaign-actions";

const field = "rounded-control border border-border bg-page px-2 py-1";

export function InviteForm({ campaignId, origin }: { campaignId: string; origin: string }) {
  const [state, run, pending] = useActionState<InviteState, FormData>(inviteAction, { error: null });
  const link = state.url ? `${origin}${state.url}` : undefined;
  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <label className="flex flex-col gap-1">
        <span className="font-ui text-label">Message, shown to whoever opens the code</span>
        <textarea name="message" maxLength={500} rows={2} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-ui text-label">Note, for you: whom the code is for</span>
        <input name="note" maxLength={80} className={field} />
      </label>
      <div>
        <button type="submit" disabled={pending} className="rounded-control bg-accent px-4 py-2 font-ui text-control text-page">
          Create invitation
        </button>
      </div>
      {state.error && <p className="text-danger">{state.error}</p>}
      {state.code && link && (
        <div className="rounded-control border border-accent-line bg-accent-soft p-3">
          <p className="font-ui text-label">Shown once. Give the code or the link to the player.</p>
          <p className="mt-2 font-mono text-code">{state.code}</p>
          <p className="mt-1 break-all font-mono text-code">{link}</p>
          <button type="button" onClick={() => navigator.clipboard.writeText(link)} className="mt-2 font-ui text-control text-accent">
            Copy link
          </button>
        </div>
      )}
    </form>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <button type="button" onClick={() => navigator.clipboard.writeText(text)} className="font-ui text-control text-accent">
      {label}
    </button>
  );
}
