"use client";
// Server-action forms that keep what the user entered. React resets a form after its `action` runs,
// even when the action answers with an error, so a refused submission would clear every field. Forms
// submit through `onSubmit` instead, which dispatches the same action in a transition; `action` stays
// on the form for a submission before hydration.
import { startTransition, useActionState, type FormEvent } from "react";

export function useFormAction<S>(action: (state: Awaited<S>, form: FormData) => S | Promise<S>, initial: Awaited<S>) {
  const [state, run, pending] = useActionState(action, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // The submit button's own name and value, as a native submission would send them.
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    // React's hidden fields for submissions before hydration; the dispatched action does not read them.
    for (const key of [...data.keys()]) if (key.startsWith("$ACTION")) data.delete(key);
    startTransition(() => run(data));
  };
  return [state, { action: run, onSubmit }, pending] as const;
}
