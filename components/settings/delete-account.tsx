"use client";
// Delete account (app-flow.md, Settings: Your data): asks for the display name, then signs out.
import { Trash2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { described, Field, TextInput } from "@/components/ui/field";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { useClerkSignOut } from "@/components/clerk";
import { deleteAccountAction } from "@/lib/server/account-actions";
import type { FormState } from "@/lib/server/forms";

export function DeleteAccount({ name }: { name: string }) {
  const { signOut } = useClerkSignOut();
  const [state, run, pending] = useActionState<FormState & { closed?: boolean }, FormData>(deleteAccountAction, { error: null });
  useEffect(() => {
    if (state.closed) void signOut({ redirectUrl: "/" });
  }, [state.closed, signOut]);
  const id = "delete-confirm";
  return (
    <form action={run} className="flex flex-col gap-4">
      <p className="text-body text-ink">
        Delete your account. You may be able to restore the account by signing in within 30 days. Within 90 days it is erased with everything it owns.
      </p>
      <Field id={id} label={`Type your display name, ${name}, to confirm`} error={state.error}>
        <TextInput name="confirm" required autoComplete="off" {...described(id, { error: state.error })} />
      </Field>
      <div>
        <Button type="submit" variant="danger" disabled={pending} icon={<Trash2 {...ICON_DENSE} />}>
          {pending ? "Deleting…" : "Delete account"}
        </Button>
      </div>
    </form>
  );
}
