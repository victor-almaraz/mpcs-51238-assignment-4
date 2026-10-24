"use client";
// Items & creatures (app-flow.md, Adventure editor: Sections): the draft's adventure-specific entity
// templates as a form, with `system_stats` edited by the system's StatsEditor (components/systems)
// configured with the draft's system modules. Fields the form does not offer are edited as YAML per
// entity; **Edit as YAML** edits the whole section. Each entity shows its own problems.
import { useState } from "react";
import { parse, stringify } from "yaml";
import { systemUi } from "@/components/systems";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, TextInput } from "@/components/ui/field";
import { statsKindOf } from "@/lib/materials/stats-form";
import { denseArea, denseSelect, NewId, Panel, RemoveButton } from "./controls";
import { type Doc } from "./doc";
import { EditorField, fieldId, InlineProblems, problemProps, useProblems } from "./problems";

const KINDS = ["creature", "item", "container", "fixture", "obstacle", "door"] as const;
/** Fields the form edits; the rest are edited as YAML. Without a StatsEditor, system_stats is YAML too. */
const OWN = new Set(["kind", "label", "system_stats"]);
const OWN_NO_STATS = new Set(["kind", "label"]);

type Template = Record<string, unknown> & { kind?: string; label?: string };

function fresh(kind: string, id: string): Template {
  const label = id.replace(/_/g, " ");
  if (kind === "creature") return { kind, label, behavior: "aggressive", system_stats: { template: "minion" } };
  return { kind, label };
}

function OtherFields({ value, own, onApply, pointer }: { value: Template; own: ReadonlySet<string>; onApply: (rest: Record<string, unknown>) => void; pointer: string }) {
  const rest = Object.fromEntries(Object.entries(value).filter(([k]) => !own.has(k)));
  const text = Object.keys(rest).length ? stringify(rest, { version: "1.2" }).trim() : "";
  const [error, setError] = useState<string | null>(null);
  const { under } = useProblems();
  const problems = Object.keys(rest).flatMap((k) => under(`${pointer}/${k}`));
  const fid = fieldId(`${pointer}/other`);
  return (
    <div data-pointer={`${pointer}/other`} className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="text-label font-medium">
        Other fields <span className="font-normal text-muted">(YAML)</span>
      </label>
      <p id={`${fid}-hint`} className="text-caption text-muted">
        Tags, behavior, verbs, use, light, and the rest. Applied when you leave the field.
      </p>
      <textarea
        key={text}
        {...problemProps(fid, problems, `${fid}-hint`)}
        aria-describedby={[`${fid}-hint`, error ? `${fid}-error` : null, problems.length ? `${fid}-problems` : null].filter(Boolean).join(" ")}
        aria-invalid={error || problems.some((p) => p.severity === "error") ? true : undefined}
        defaultValue={text}
        rows={Math.min(10, Math.max(2, text.split("\n").length))}
        spellCheck={false}
        placeholder="tags: [heavy]"
        onBlur={(e) => {
          try {
            const v = e.target.value.trim() ? parse(e.target.value, { version: "1.2" }) : {};
            if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error("expected a mapping of fields");
            onApply(v as Record<string, unknown>);
            setError(null);
          } catch (err) {
            setError((err as Error).message.split("\n")[0]!);
          }
        }}
        className={`${denseArea} font-mono text-code`}
      />
      {error && (
        <p id={`${fid}-error`} role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <InlineProblems id={`${fid}-problems`} problems={problems} />
    </div>
  );
}

export function EntitiesSection({ doc, edit }: { doc: Doc; edit: (f: (d: Doc) => void) => void }) {
  const [kind, setKind] = useState<string>("item");
  const entities = doc.entities as Record<string, Template>;
  const system = doc.adventure.system;
  const modules = system.modules ?? [];
  const Stats = systemUi(system.id)?.StatsEditor;
  const set = (key: string, f: (t: Template) => void) => edit((d) => f((d.entities as Record<string, Template>)[key]!));
  const { rest } = useProblems();
  const top = rest("/entities", Object.keys(entities).map((k) => `/entities/${k}`));

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <p className="text-caption text-muted">
        Adventure-specific items and creatures, keyed by id, as in entities/*.yaml. Placed on maps as <span className="font-mono">{doc.adventure.id}:id</span>.
        {modules.length > 0 && ` System modules: ${modules.join(", ")}.`}
      </p>
      <InlineProblems problems={top} />
      {Object.keys(entities).length === 0 && <EmptyState>No items or creatures of this adventure yet.</EmptyState>}
      {Object.entries(entities).map(([key, t]) => {
        const statsKind = statsKindOf(t.kind);
        const own = statsKind && Stats ? OWN : OWN_NO_STATS;
        const base = `/entities/${key}`;
        // The card shows what its fields and the stats editor do not: problems with the whole entity,
        // and with system_stats when it is edited as YAML.
        const claimed = [...own].map((k) => `${base}/${k}`);
        const here = rest(base, [...claimed, ...Object.keys(t).filter((k) => !own.has(k)).map((k) => `${base}/${k}`)]);
        const hid = `${fieldId(base)}-title`;
        return (
          <Panel key={key} pointer={base} aria-labelledby={hid} className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id={hid} className="flex flex-wrap items-center gap-2 text-heading font-semibold">
                  {t.label || key}
                  {t.kind && <Badge dot={false}>{t.kind}</Badge>}
                </h3>
                <p className="font-mono text-caption text-muted">{key}</p>
              </div>
              <RemoveButton label={`Delete ${key}`} onClick={() => edit((d) => void delete d.entities[key])} />
            </div>
            <InlineProblems problems={here} />
            <div className="grid gap-4 @xl:grid-cols-[12rem_minmax(0,1fr)]">
              <EditorField pointer={`${base}/kind`} label="Kind">
                {(p) => (
                  <Select {...p} value={t.kind ?? ""} onChange={(e) => set(key, (x) => void (x.kind = e.target.value))}>
                    {!KINDS.includes(t.kind as never) && <option value={t.kind ?? ""}>{t.kind ?? "kind"}</option>}
                    {KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </Select>
                )}
              </EditorField>
              <EditorField pointer={`${base}/label`} label="Label">
                {(p) => <TextInput {...p} value={t.label ?? ""} maxLength={80} onChange={(e) => set(key, (x) => void (x.label = e.target.value))} />}
              </EditorField>
            </div>
            {statsKind && (
              <div data-pointer={`${base}/system_stats`} className="flex flex-col gap-2">
                <p className="text-label font-medium">
                  System stats{" "}
                  <span className="font-normal text-muted">
                    ({system.id} {statsKind})
                  </span>
                </p>
                {Stats ? (
                  <Stats
                    system={system.id}
                    modules={modules}
                    kind={statsKind}
                    value={t.system_stats}
                    name={key}
                    pointer={`${base}/system_stats`}
                    onChange={(next) =>
                      set(key, (x) => {
                        // Creatures require system_stats; items, obstacles, and doors may leave them out.
                        if (Object.keys(next).length === 0 && x.kind !== "creature") delete x.system_stats;
                        else x.system_stats = next;
                      })
                    }
                  />
                ) : (
                  <p className="text-caption text-muted">No stats editor for {system.id}; edit system_stats in the YAML below.</p>
                )}
              </div>
            )}
            <OtherFields
              pointer={base}
              value={t}
              own={own}
              onApply={(rest) =>
                set(key, (x) => {
                  for (const k of Object.keys(x)) if (!own.has(k)) delete x[k];
                  Object.assign(x, rest);
                })
              }
            />
          </Panel>
        );
      })}
      <NewId
        label={`Add ${kind}`}
        noun={`${kind} id`}
        taken={Object.keys(entities)}
        before={
          <select aria-label="New entity kind" value={kind} onChange={(e) => setKind(e.target.value)} className={denseSelect}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        }
        onAdd={(id) => edit((d) => void (d.entities[id] = fresh(kind, id)))}
      />
    </div>
  );
}
