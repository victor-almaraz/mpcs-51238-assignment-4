"use client";
// SPEC_ISSUES.md#editor-stats: structures included; modules come from the draft's system.
// The adventure editor's form for creature, item, ability, and structure `system_stats` (app-flow.md,
// Character creation and editor: `StatsEditor`, generated from the system's schemas by default; module
// fields only while the module is enabled). Fields come from lib/materials/stats-form.ts; a schema
// feature the form does not cover, a value of an unexpected type, and keys outside the schema are
// edited as YAML. Cadmium's editor extends Quest's with a note on module fields it hides.
import { useState } from "react";
import { parse, stringify } from "yaml";
import { extraKeys, fits, hiddenModuleFields, parseNumber, statsFields, statsSchema, withField, type StatsField, type StatsKind } from "@/lib/materials/stats-form";

export interface StatsEditorProps {
  system: string;
  /** The modules the draft's `adventure.system.modules` enables. */
  modules: readonly string[];
  kind: StatsKind;
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  /** Labels the inputs, such as the entity id. */
  name: string;
}

const small = "rounded-control border border-border bg-page px-1 font-ui text-caption";
const toYaml = (v: unknown) => (v === undefined ? "" : stringify(v, { version: "1.2" }).trim());

/** A YAML text field applied on blur; a parse error keeps the text with the error shown. */
function YamlField({ label, value, onApply, rows = 2 }: { label: string; value: unknown; onApply: (v: unknown) => void; rows?: number }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-0.5">
      <textarea
        key={toYaml(value)}
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
        className={`${small} font-mono`}
      />
      {error && <span className="font-ui text-caption text-danger">{error}</span>}
    </span>
  );
}

function Input({ f, value, set, name }: { f: StatsField; value: unknown; set: (v: unknown) => void; name: string }) {
  const label = `${name} ${f.key}`;
  if (!fits(f, value) || f.type === "raw") return <YamlField label={`${label} (YAML)`} value={value} onApply={set} />;
  switch (f.type) {
    case "integer":
    case "number":
      return (
        <input
          type="number"
          aria-label={label}
          min={f.min}
          max={f.max}
          step={f.type === "integer" ? 1 : "any"}
          value={value === undefined ? "" : String(value)}
          placeholder={f.min !== undefined || f.max !== undefined ? `${f.min ?? ""}–${f.max ?? ""}` : undefined}
          onChange={(e) => set(parseNumber(e.target.value))}
          className={`${small} w-20`}
        />
      );
    case "boolean":
      return <input type="checkbox" aria-label={label} checked={value === true} onChange={(e) => set(e.target.checked ? true : f.required ? false : undefined)} />;
    case "string":
      return <input aria-label={label} value={(value as string | undefined) ?? ""} maxLength={f.maxLength} onChange={(e) => set(e.target.value === "" ? undefined : e.target.value)} className={`${small} w-40`} />;
    case "enum":
      return (
        <select aria-label={label} value={value === undefined ? "" : JSON.stringify(value)} onChange={(e) => set(e.target.value === "" ? undefined : JSON.parse(e.target.value))} className={small}>
          <option value="">{f.required ? "choose" : "unset"}</option>
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
          key={JSON.stringify(value ?? [])}
          aria-label={label}
          defaultValue={((value as string[] | undefined) ?? []).join(", ")}
          placeholder="comma-separated"
          onBlur={(e) => {
            const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            set(list.length ? list : undefined);
          }}
          className={`${small} w-48`}
        />
      );
    case "object":
      return <Fields fields={f.fields} open={f.open} value={value} name={label} onChange={(next) => set(Object.keys(next).length === 0 && !f.required ? undefined : next)} />;
  }
}

function Fields({ fields, open, value, onChange, name }: { fields: StatsField[]; open: boolean; value: unknown; onChange: (next: Record<string, unknown>) => void; name: string }) {
  const v = (value ?? {}) as Record<string, unknown>;
  const extra = extraKeys(value, fields);
  return (
    <div className="flex flex-col gap-1 border-l border-rule pl-2">
      {fields.map((f) => (
        <div key={f.key} className="flex flex-wrap items-center gap-2 font-ui text-caption">
          <span className="w-24">
            {f.label}
            {f.required && <span className="text-danger"> *</span>}
          </span>
          <Input f={f} value={v[f.key]} name={name} set={(x) => onChange(withField(value, f.key, x))} />
          {f.module && <span className="rounded-control border border-rule px-1 text-muted">{f.module} module</span>}
          {f.description && <span className="text-muted">{f.description}</span>}
        </div>
      ))}
      {extra.length > 0 && (
        <div className="flex flex-col gap-0.5 font-ui text-caption">
          <span className={open ? "text-muted" : "text-warning"}>{open ? "Other fields" : `Not in this schema: ${extra.join(", ")}`}</span>
          <YamlField
            label={`${name} other fields (YAML)`}
            value={Object.fromEntries(extra.map((k) => [k, v[k]]))}
            onApply={(x) => {
              const kept = Object.fromEntries(Object.entries(v).filter(([k]) => !extra.includes(k)));
              onChange({ ...kept, ...(x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {}) });
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Quest's StatsEditor: the form generated from the system's configured schema for `kind`. */
export function QuestStatsEditor({ system, modules, kind, value, onChange, name }: StatsEditorProps) {
  const form = statsFields(statsSchema(system, modules, kind));
  if (!form) {
    // The schema is not a plain object of properties: the whole value is edited as YAML.
    return <YamlField label={`${name} system_stats (YAML)`} value={value} rows={4} onApply={(x) => onChange((x ?? {}) as Record<string, unknown>)} />;
  }
  return <Fields fields={form.fields} open={form.open} value={value} name={name} onChange={onChange} />;
}

/** Cadmium's StatsEditor: Quest's, plus the module fields the draft's modules leave out. */
export function CadmiumStatsEditor(props: StatsEditorProps) {
  const hidden = hiddenModuleFields(props.system, props.modules, props.kind);
  return (
    <div className="flex flex-col gap-1">
      <QuestStatsEditor {...props} />
      {hidden.length > 0 && (
        <p className="font-ui text-caption text-muted">
          Module fields not shown: {hidden.map(([m, k]) => `${k} (${m})`).join(", ")}. Add the module to the adventure&apos;s system modules to set {hidden.length === 1 ? "it" : "them"}.
        </p>
      )}
    </div>
  );
}
