"use client";
// A form bound to a server action that returns FormState; shows the action's error under the fields.
import type { ReactNode } from "react";
import type { FormState } from "@/lib/server/forms";
import { useFormAction } from "./form-action";
import { Notice } from "./ui/notice";

export function ActionForm({ action, children, className }: { action: (state: FormState, form: FormData) => Promise<FormState>; children: ReactNode; className?: string }) {
  const [state, form, pending] = useFormAction(action, { error: null });
  return (
    <form {...form} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.error && (
        <Notice tone="danger" live className="mt-4">
          {state.error}
        </Notice>
      )}
    </form>
  );
}
