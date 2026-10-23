"use client";
// A form bound to a server action that returns FormState; shows the action's error under the fields.
import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/lib/server/forms";

export function ActionForm({ action, children, className }: { action: (state: FormState, form: FormData) => Promise<FormState>; children: ReactNode; className?: string }) {
  const [state, run, pending] = useActionState(action, { error: null });
  return (
    <form action={run} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.error && <p className="text-danger">{state.error}</p>}
    </form>
  );
}
