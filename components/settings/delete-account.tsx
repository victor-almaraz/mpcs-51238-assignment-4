"use client";
// Delete account (app-flow.md, Settings: Your data): asks for the display name, then signs out.
import { useActionState, useEffect } from "react";
import { useClerkSignOut } from "@/components/clerk";
import { deleteAccountAction } from "@/lib/server/account-actions";
import type { FormState } from "@/lib/server/forms";

export function DeleteAccount({ name }: { name: string }) {
  const { signOut } = useClerkSignOut();
  const [state, run, pending] = useActionState<FormState & { closed?: boolean }, FormData>(deleteAccountAction, { error: null });
  useEffect(() => {
    if (state.closed) void signOut({ redirectUrl: "/" });
  }, [state.closed, signOut]);
  return (
    <form action={run} className="flex flex-col gap-2">
      <p>You may be able to restore the account by signing in within 30 days. Within 90 days it is erased with everything it owns.</p>
      <label className="flex flex-col gap-1">
        <span className="font-ui text-label">Type your display name, {name}, to confirm</span>
        <input name="confirm" required className="rounded-control border border-border bg-page px-2 py-1" />
      </label>
      {state.error && <p className="text-danger">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending} className="rounded-control border border-danger px-4 py-2 font-ui text-control text-danger">
          Delete account
        </button>
      </div>
    </form>
  );
}
