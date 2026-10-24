// Form fields (docs/design/README.md, Components): label above, hint under the label, error under the
// control; hint and error joined to the control by aria-describedby. Works in server components.
import { CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export const inputClass =
  "block w-full rounded-control border border-border bg-page px-3 py-2 text-control text-ink placeholder:text-muted aria-invalid:border-danger disabled:bg-desk disabled:text-muted";

/** The props that tie a control to its field's hint and error. */
export function described(id: string, { hint, error }: { hint?: unknown; error?: unknown } = {}) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return { id, ...(ids ? { "aria-describedby": ids } : {}), ...(error ? { "aria-invalid": true as const } : {}) };
}

/** A labelled field. Give the control `{...described(id, { hint, error })}`. */
export function Field({ id, label, hint, error, optional, className, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; optional?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-caption text-danger">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(inputClass, "h-10", className)} {...rest} />;
}

export function TextArea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "min-h-24", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cx(inputClass, "h-10 pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

/** A checkbox or radio with its label to the right, in a 40 px hit area. */
export function Choice({ type = "checkbox", label, hint, className, ...rest }: { type?: "checkbox" | "radio"; label: ReactNode; hint?: ReactNode; className?: string } & Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={cx("flex min-h-10 cursor-pointer items-start gap-3 rounded-control py-2", className)}>
      <input type={type} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" {...rest} />
      <span className="flex flex-col">
        <span className="text-control text-ink">{label}</span>
        {hint && <span className="text-caption text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** A titled group of fields. */
export function FieldGroup({ legend, description, children, className }: { legend: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx("flex min-w-0 flex-col gap-4 rounded-card border border-rule bg-page p-4 sm:p-6", className)}>
      {/* Floated, the legend sits inside the card as its heading instead of on its border. */}
      <legend className="float-left mb-1 w-full text-heading font-semibold text-ink">{legend}</legend>
      {description && <p className="-mt-3 text-caption text-muted">{description}</p>}
      {children}
    </fieldset>
  );
}
