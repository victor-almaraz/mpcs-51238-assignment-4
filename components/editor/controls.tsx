"use client";
// Controls the editor's dense rows share: 32 px inputs for tables, rule cards, and the map toolbar
// (forms use the 40 px controls of components/ui/field.tsx), the new-id form, and a remove button.
import { Plus, Trash2 } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ICON_DENSE, IconButton } from "@/components/ui/icon-button";
import { ID } from "./doc";

/** A 32 px input, select, or textarea for dense rows. */
export const dense =
  "rounded-control border border-border bg-page px-2 text-label text-ink placeholder:text-muted aria-invalid:border-danger disabled:bg-desk disabled:text-muted";
export const denseInput = cx(dense, "h-8");
export const denseSelect = cx(dense, "h-8 pr-7");
export const denseArea = cx(dense, "py-1.5");

/** A small caption label above a dense control. */
export function Labelled({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1 text-caption text-muted", className)}>
      {label}
      {children}
    </label>
  );
}

/** An icon button that removes something: named for what it removes. */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <IconButton dense label={label} onClick={onClick} icon={<Trash2 {...ICON_DENSE} className="text-danger" />} className="hover:bg-danger-soft" />;
}

/** The ids rule: lower-case letters, digits, and underscores, starting with a letter. */
export function idProblem(id: string, taken: readonly string[]): string | null {
  if (!id) return null;
  if (!ID.test(id)) return "Use lower-case letters, digits, and _, starting with a letter.";
  if (taken.includes(id)) return `${id} is already taken.`;
  return null;
}

/** A form that adds a record under a new id; the button says why it is disabled. */
export function NewId({ label, noun = "id", taken, onAdd, before }: { label: string; noun?: string; taken: readonly string[]; onAdd: (id: string) => void; before?: ReactNode }) {
  const [id, setId] = useState("");
  const uid = useId();
  const problem = idProblem(id, taken);
  const ok = id !== "" && !problem;
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) {
          onAdd(id);
          setId("");
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {before}
        <input
          aria-label={`New ${noun}`}
          aria-describedby={problem ? `${uid}-why` : undefined}
          aria-invalid={problem ? true : undefined}
          value={id}
          placeholder="new_id"
          spellCheck={false}
          onChange={(e) => setId(e.target.value)}
          className={cx(denseInput, "w-44 font-mono")}
        />
        <Button type="submit" variant="quiet" size="sm" disabled={!ok} icon={<Plus {...ICON_DENSE} />}>
          {label}
        </Button>
      </div>
      {problem && (
        <p id={`${uid}-why`} className="text-caption text-danger">
          {problem}
        </p>
      )}
    </form>
  );
}

/** A bordered record on the editor's desk: the card of an NPC, an entity, a rule, or a map panel. */
export function Panel({ children, className, pointer, ...rest }: { children: ReactNode; className?: string; pointer?: string } & Omit<ComponentProps<"section">, "children" | "className">) {
  return (
    <section data-pointer={pointer} className={cx("rounded-card border border-rule bg-page p-4", className)} {...rest}>
      {children}
    </section>
  );
}
