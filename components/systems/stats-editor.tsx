"use client";
// SPEC_ISSUES.md#editor-stats: structures included; modules come from the draft's system.
// The adventure editor's form for creature, item, ability, and structure `system_stats` (app-flow.md,
// Character creation and editor: `StatsEditor`, generated from the system's schemas by default; module
// fields only while the module is enabled). Fields come from lib/materials/stats-form.ts; a schema
// feature the form does not cover, a value of an unexpected type, and keys outside the schema are
// edited as YAML. Cadmium's editor extends Quest's with a note on module fields it hides. Given a
// `pointer`, each field marks the draft value it edits and shows the editor's problems for it.
import { useState } from "react";
import { parse, stringify } from "yaml";
import { Badge } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { denseArea, denseInput, denseSelect } from "@/components/editor/controls";
import { fieldId, InlineProblems, problemProps, useProblems } from "@/components/editor/problems";
import { extraKeys, fits, hiddenModuleFields, parseNumber, statsFields, statsSchema, withField, type StatsField, type StatsKind } from "@/lib/materials/stats-form";
import type { Problem } from "@/components/editor/doc";

export interface StatsEditorProps {
  system: string;
  /** The modules the draft's `adventure.system.modules` enables. */
  modules: readonly string[];
  kind: StatsKind;
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  /** Labels the inputs, such as the entity id. */
  name: string;
  /** The JSON Pointer of `value` in the draft, such as /entities/lamp/system_stats, for inline problems. */
  pointer?: string;
}

const toYaml = (v: unknown) => (v === undefined ? "" : stringify(v, { version: "1.2" }).trim());

/** The control props for a field: its id, and its problems when the editor has a pointer for it. */
function tie(label: string, pointer: string | undefined, problems: Problem[]) {
  const id = fieldId(pointer ?? `/stats/${label}`);
  return problemProps(id, problems);
}

/** A YAML text field applied on blur; a parse error keeps the text with the error shown. */
function YamlField({ label, value, onApply, rows = 2, control }: { label: string; value: unknown; onApply: (v: unknown) => void; rows?: number; control?: ReturnType<typeof tie> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <textarea
        key={toYaml(value)}
        {...control}
        aria-label={label}
        defaultValue={toYaml(value)}
        rows={rows}
        spellCheck={false}
        onBlur={(e) => {
          try {
            onApply(e.target.value.trim() === "" ? undefined : parse(e.target.value, { version: "1.2" }));
            setError(null);
          } catch (err) {
            setError((err as Error).message.split("\n")[0]!);
          }
        }}
        className={cx(denseArea, "w-full font-mono text-code")}
      />
      {error && (
        <span role="alert" className="text-caption text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

function Input({ f, value, set, name, pointer, control }: { f: StatsField; value: unknown; set: (v: unknown) => void; name: string; pointer?: string; control: ReturnType<typeof tie> }) {
  const label = `${name} ${f.key}`;
  if (!fits(f, value) || f.type === "raw") return <YamlField label={`${label} (YAML)`} value={value} onApply={set} control={control} />;
  switch (f.type) {
    case "integer":
    case "number":
      return (
        <input
          {...control}
          type="number"
          aria-label={label}
          min={f.min}
          max={f.max}
          step={f.type === "integer" ? 1 : "any"}
          value={value === undefined ? "" : String(value)}
          placeholder={f.min !== undefined || f.max !== undefined ? `${f.min ?? ""}–${f.max ?? ""}` : undefined}
          onChange={(e) => set(parseNumber(e.target.value))}
          className={cx(denseInput, "w-24 tabular")}
        />
      );
    case "boolean":
      return <input {...control} type="checkbox" aria-label={label} checked={value === true} onChange={(e) => set(e.target.checked ? true : f.required ? false : undefined)} className="size-5 accent-[var(--color-accent)]" />;
    case "string":
      return <input {...control} aria-label={label} value={(value as string | undefined) ?? ""} maxLength={f.maxLength} onChange={(e) => set(e.target.value === "" ? undefined : e.target.value)} className={cx(denseInput, "w-full max-w-64")} />;
    case "enum":
      return (
        <select {...control} aria-label={label} value={value === undefined ? "" : JSON.stringify(value)} onChange={(e) => set(e.target.value === "" ? undefined : JSON.parse(e.target.value))} className={denseSelect}>
          <option value="">{f.required ? "Choose" : "Unset"}</option>
          {f.options.map((o) => (
            <option key={JSON.stringify(o)} value={JSON.stringify(o)}>
              {String(o)}
            </option>
          ))}
        </select>
      );
    case "strings":
      return (
        <input
          {...control}
          key={JSON.stringify(value ?? [])}
          aria-label={label}
          defaultValue={((value as string[] | undefined) ?? []).join(", ")}
          placeholder="comma-separated"
          onBlur={(e) => {
            const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            set(list.length ? list : undefined);
          }}
          className={cx(denseInput, "w-full max-w-72")}
        />
      );
    case "object":
      return <Fields fields={f.fields} open={f.open} value={value} name={label} pointer={pointer} onChange={(next) => set(Object.keys(next).length === 0 && !f.required ? undefined : next)} />;
  }
}

function Fields({ fields, open, value, onChange, name, pointer }: { fields: StatsField[]; open: boolean; value: unknown; onChange: (next: Record<string, unknown>) => void; name: string; pointer?: string }) {
  const { under, at } = useProblems();
  const v = (value ?? {}) as Record<string, unknown>;
  const extra = extraKeys(value, fields);
  const own = pointer ? at(pointer) : [];
  const extraProblems = pointer ? extra.flatMap((k) => under(`${pointer}/${k}`)) : [];
  const extraControl = tie(`${name} other`, pointer && `${pointer}/other`, extraProblems);
  return (
    <div className="flex min-w-0 flex-col gap-2 border-l-2 border-rule pl-3">
      <InlineProblems problems={own} />
      {fields.map((f) => {
        const p = pointer && `${pointer}/${f.key}`;
        // A nested form shows its own fields' problems; this row shows the ones about the object itself.
        const nested = f.type === "object" && fits(f, v[f.key]);
        const problems = p ? (nested ? at(p) : under(p)) : [];
        const control = tie(`${name} ${f.key}`, p, problems);
        return (
          <div key={f.key} data-pointer={p} className="grid gap-1 @lg:grid-cols-[9rem_minmax(0,1fr)] @lg:gap-3">
            <span className="pt-1.5 text-label">
              {f.label}
              {f.required && (
                <span className="text-danger" title="Required">
                  {" "}
                  *<span className="sr-only">required</span>
                </span>
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex min-h-8 flex-wrap items-center gap-2">
                <Input f={f} value={v[f.key]} name={name} pointer={p} control={control} set={(x) => onChange(withField(value, f.key, x))} />
                {f.module && <Badge dot={false}>{f.module} module</Badge>}
              </div>
              {f.description && <span className="text-caption text-muted">{f.description}</span>}
              <InlineProblems id={`${control.id}-problems`} problems={problems} />
            </div>
          </div>
        );
      })}
      {extra.length > 0 && (
        <div data-pointer={pointer && `${pointer}/other`} className="flex flex-col gap-1">
          <span className={cx("text-caption", open ? "text-muted" : "text-warning")}>{open ? "Other fields" : `Not in this schema: ${extra.join(", ")}`}</span>
          <YamlField
            label={`${name} other fields (YAML)`}
            control={extraControl}
            value={Object.fromEntries(extra.map((k) => [k, v[k]]))}
            onApply={(x) => {
              const kept = Object.fromEntries(Object.entries(v).filter(([k]) => !extra.includes(k)));
              onChange({ ...kept, ...(x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {}) });
            }}
          />
          <InlineProblems id={`${extraControl.id}-problems`} problems={extraProblems} />
        </div>
      )}
    </div>
  );
}

/** Quest's StatsEditor: the form generated from the system's configured schema for `kind`. */
export function QuestStatsEditor({ system, modules, kind, value, onChange, name, pointer }: StatsEditorProps) {
  const { under } = useProblems();
  const form = statsFields(statsSchema(system, modules, kind));
  if (!form) {
    // The schema is not a plain object of properties: the whole value is edited as YAML.
    const problems = pointer ? under(pointer) : [];
    const control = tie(`${name} system_stats`, pointer, problems);
    return (
      <div className="flex flex-col gap-1">
        <YamlField label={`${name} system_stats (YAML)`} value={value} rows={4} control={control} onApply={(x) => onChange((x ?? {}) as Record<string, unknown>)} />
        <InlineProblems id={`${control.id}-problems`} problems={problems} />
      </div>
    );
  }
  return <Fields fields={form.fields} open={form.open} value={value} name={name} pointer={pointer} onChange={onChange} />;
}

/** Cadmium's StatsEditor: Quest's, plus the module fields the draft's modules leave out. */
export function CadmiumStatsEditor(props: StatsEditorProps) {
  const hidden = hiddenModuleFields(props.system, props.modules, props.kind);
  return (
    <div className="flex flex-col gap-2">
      <QuestStatsEditor {...props} />
      {hidden.length > 0 && (
        <p className="text-caption text-muted">
          Module fields not shown: {hidden.map(([m, k]) => `${k} (${m})`).join(", ")}. Add the module to the adventure&apos;s system modules to set {hidden.length === 1 ? "it" : "them"}.
        </p>
      )}
    </div>
  );
}
