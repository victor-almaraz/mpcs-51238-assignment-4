"use client";
// Problems in the adventure editor (docs/design/README.md, Adventure editor): every problem shows in
// the field or record it belongs to, through a context of the current list, and in the bottom Problems
// panel, where selecting one opens its section and focuses its field. Fields mark themselves with
// `data-pointer`, the JSON Pointer of the draft value they edit; a problem focuses the element with the
// longest pointer that contains its own.
import { CircleAlert, CircleCheck, TriangleAlert, X } from "lucide-react";
import { createContext, useContext, useMemo, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { ICON_DENSE, IconButton } from "@/components/ui/icon-button";
import type { Problem } from "./doc";

export type Section = "overview" | "flags" | "plot" | "locations" | "npcs" | "entities";

export const SECTIONS: { id: Section; label: string; key: "adventure" | "flags" | "arcs" | "locations" | "npcs" | "entities" }[] = [
  { id: "overview", label: "Overview", key: "adventure" },
  { id: "flags", label: "Flags", key: "flags" },
  { id: "plot", label: "Plot arcs", key: "arcs" },
  { id: "locations", label: "Locations", key: "locations" },
  { id: "npcs", label: "NPCs", key: "npcs" },
  { id: "entities", label: "Items & creatures", key: "entities" },
];
const SECTION_OF: Record<string, Section> = { adventure: "overview", flags: "flags", arcs: "plot", locations: "locations", npcs: "npcs", entities: "entities" };

/** The unescaped segments of a JSON Pointer. */
export function segments(pointer: string): string[] {
  return pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** The section a problem belongs to; problems about the whole draft belong to Overview. */
export function sectionOf(pointer: string): Section {
  return SECTION_OF[segments(pointer)[0] ?? ""] ?? "overview";
}

/** Where a problem is, in words: its section, then the path inside it. */
export function locate(pointer: string): string {
  const parts = segments(pointer);
  if (parts.length === 0) return "Whole draft";
  const label = SECTIONS.find((s) => s.id === sectionOf(pointer))!.label;
  return [label, ...parts.slice(1)].join(" › ");
}

/** `pointer` is `base` or inside it. */
export const inside = (pointer: string, base: string) => pointer === base || pointer.startsWith(`${base}/`);

/** A stable element id for the field at `pointer`. */
export const fieldId = (pointer: string) => `f${pointer.replace(/[^A-Za-z0-9_-]/g, "-")}`;

export const isError = (p: Problem) => p.severity === "error";

const Ctx = createContext<Problem[]>([]);

export function ProblemsProvider({ problems, children }: { problems: Problem[]; children: ReactNode }) {
  return <Ctx.Provider value={problems}>{children}</Ctx.Provider>;
}

/** Lookups into the current problems. Outside the editor every lookup is empty. */
export function useProblems() {
  const list = useContext(Ctx);
  return useMemo(
    () => ({
      /** Problems at `base` or inside it. */
      under: (base: string) => list.filter((p) => inside(p.pointer, base)),
      /** Problems at exactly `pointer`. */
      at: (pointer: string) => list.filter((p) => p.pointer === pointer),
      /** Problems at `base` or inside it that none of `claimed` holds: the ones the record shows itself. */
      rest: (base: string, claimed: readonly string[]) => list.filter((p) => inside(p.pointer, base) && !claimed.some((c) => inside(p.pointer, c))),
    }),
    [list],
  );
}

/** Props that tie a control to its inline problems: described by them, invalid when one is an error. */
export function problemProps(id: string, problems: Problem[], hintId?: string) {
  const ids = [hintId, problems.length ? `${id}-problems` : null].filter(Boolean).join(" ");
  return { id, ...(ids ? { "aria-describedby": ids } : {}), ...(problems.some(isError) ? { "aria-invalid": true as const } : {}) };
}

export function SeverityIcon({ problem, className }: { problem: Pick<Problem, "severity">; className?: string }) {
  return problem.severity === "error" ? (
    <CircleAlert {...ICON_DENSE} className={cx("shrink-0 text-danger", className)} />
  ) : (
    <TriangleAlert {...ICON_DENSE} className={cx("shrink-0 text-warning", className)} />
  );
}

/** A field's or record's own problems, in its error slot: icon, severity word for screen readers, message. */
export function InlineProblems({ id, problems, className }: { id?: string; problems: Problem[]; className?: string }) {
  if (problems.length === 0) return null;
  return (
    <ul id={id} className={cx("flex flex-col gap-1", className)}>
      {problems.map((p, i) => (
        <li key={i} className={cx("flex items-start gap-1.5 text-caption", isError(p) ? "text-danger" : "text-warning")}>
          <SeverityIcon problem={p} className="mt-px" />
          <span>
            <span className="sr-only">{isError(p) ? "Error: " : "Warning: "}</span>
            {p.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A labelled field with its problems in the error slot, like `Field` (components/ui/field.tsx) but for
 * errors and warnings. `children` receives the props for the control.
 */
export function EditorField({
  pointer,
  label,
  hint,
  optional,
  className,
  id: given,
  children,
}: {
  pointer: string;
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  id?: string;
  children: (control: ReturnType<typeof problemProps>) => ReactNode;
}) {
  const problems = useProblems().under(pointer);
  const id = given ?? fieldId(pointer);
  return (
    <div data-pointer={pointer} className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      )}
      {children(problemProps(id, problems, hint ? `${id}-hint` : undefined))}
      <InlineProblems id={`${id}-problems`} problems={problems} />
    </div>
  );
}

/** A count of problems as an icon and a number, with the words for screen readers. */
export function ProblemBadge({ problems }: { problems: Problem[] }) {
  if (problems.length === 0) return null;
  const errors = problems.filter(isError).length;
  const tone = errors ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning";
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-caption font-medium tabular", tone)}>
      <SeverityIcon problem={{ severity: errors ? "error" : "warning" }} className="size-3.5 text-current" />
      {problems.length}
      <span className="sr-only">{problems.length === 1 ? " problem" : " problems"}</span>
    </span>
  );
}

// Focus --------------------------------------------------------------------------------------------

const FOCUSABLE = "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

/** Focuses the field for `pointer` inside `root`: the marked element with the longest enclosing pointer. */
export function focusPointer(root: HTMLElement, pointer: string): boolean {
  let best: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>("[data-pointer]")) {
    const p = el.dataset.pointer ?? "";
    if (p && inside(pointer, p) && (!best || p.length > (best.dataset.pointer ?? "").length)) best = el;
  }
  if (!best) return false;
  let target = best.matches(FOCUSABLE) ? best : best.querySelector<HTMLElement>(FOCUSABLE);
  if (!target) {
    best.tabIndex = -1;
    target = best;
  }
  target.scrollIntoView({ block: "center" });
  target.focus({ preventScroll: true });
  return true;
}

// Remembered panel state ----------------------------------------------------------------------------

const subscribe = (key: string) => (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(key, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(key, cb);
  };
};
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** A boolean kept in localStorage, so a panel opens as the user last left it. */
export function useRemembered(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const sub = useMemo(() => subscribe(key), [key]);
  const stored = useSyncExternalStore(sub, () => read(key), () => null);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {
      /* storage refused: the panel still toggles for this page */
    }
    window.dispatchEvent(new Event(key));
  };
  return [stored === null ? fallback : stored === "1", set];
}

// Panel --------------------------------------------------------------------------------------------

const ORDER = SECTIONS.map((s) => s.id);

/** Errors first, then by section in outline order; otherwise as the validator reported them. */
export function sorted(problems: Problem[]): Problem[] {
  return problems
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(isError(b.p)) - Number(isError(a.p)) || ORDER.indexOf(sectionOf(a.p.pointer)) - ORDER.indexOf(sectionOf(b.p.pointer)) || a.i - b.i)
    .map(({ p }) => p);
}

export function counts(problems: Problem[]): string {
  const e = problems.filter(isError).length;
  const w = problems.length - e;
  if (problems.length === 0) return "No problems";
  return [e ? `${e} error${e === 1 ? "" : "s"}` : null, w ? `${w} warning${w === 1 ? "" : "s"}` : null].filter(Boolean).join(", ");
}

/** The bottom Problems panel: every problem with its severity, message, and location. */
export function ProblemsPanel({ id, problems, checking, selected, onSelect, onClose }: { id: string; problems: Problem[]; checking: string; selected?: Problem | null; onSelect: (p: Problem) => void; onClose: () => void }) {
  const list = sorted(problems);
  // Up and Down move between rows, Home and End to the first and last; Tab leaves the list.
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : null;
    if (next === null || i < 0) return;
    e.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
  };
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex h-[min(13rem,40dvh)] shrink-0 flex-col border-t border-rule bg-page">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-rule pl-4 pr-1">
        <h2 id={`${id}-title`} className="text-label font-semibold text-ink">
          Problems
        </h2>
        <span className="text-caption text-muted">{counts(problems)}</span>
        <span className="hidden text-caption text-muted sm:inline">· {checking}</span>
        <IconButton dense label="Close problems" icon={<X {...ICON_DENSE} />} onClick={onClose} className="ml-auto" />
      </div>
      {list.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-3 text-body text-muted">
          <CircleCheck {...ICON_DENSE} className="text-success" />
          No problems. The draft is ready to publish.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1" onKeyDown={onKey}>
          {list.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                aria-current={selected && selected.pointer === p.pointer && selected.message === p.message ? "true" : undefined}
                onClick={() => onSelect(p)}
                className="flex w-full aria-[current=true]:bg-accent-soft flex-col gap-0.5 px-4 py-1.5 text-left hover:bg-desk focus-visible:-outline-offset-2 sm:flex-row sm:items-start sm:gap-3">
                <span className="flex min-w-0 flex-1 items-start gap-2 text-body text-ink">
                  <SeverityIcon problem={p} className="mt-[3px]" />
                  <span>
                    <span className="sr-only">{isError(p) ? "Error: " : "Warning: "}</span>
                    {p.message}
                  </span>
                </span>
                <span className="pl-6 text-caption text-muted sm:max-w-[40%] sm:shrink-0 sm:truncate sm:pl-0 sm:pt-0.5" title={p.pointer || "/"}>
                  {locate(p.pointer)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
