"use client";
// Items & creatures (app-flow.md, Adventure editor: Sections): the draft's adventure-specific entity
// templates as a form, with `system_stats` edited by the system's StatsEditor (components/systems)
// configured with the draft's system modules. Fields the form does not offer are edited as YAML per
// entity; **Edit as YAML** edits the whole section.
import { useState } from "react";
import { parse, stringify } from "yaml";
import { systemUi } from "@/components/systems";
import { statsKindOf } from "@/lib/materials/stats-form";
import { ID, type Doc, type Problem } from "./doc";

const KINDS = ["creature", "item", "container", "fixture", "obstacle", "door"] as const;
/** Fields the form edits; the rest are edited as YAML. Without a StatsEditor, system_stats is YAML too. */
const OWN = new Set(["kind", "label", "system_stats"]);
const OWN_NO_STATS = new Set(["kind", "label"]);
const field = "rounded-control border border-border bg-page px-2 py-1";
const small = "rounded-control border border-border bg-page px-1 font-ui text-caption";
const quiet = "font-ui text-caption text-accent";

type Template = Record<string, unknown> & { kind?: string; label?: string };

function fresh(kind: string, id: string): Template {
  const label = id.replace(/_/g, " ");
  if (kind === "creature") return { kind, label, behavior: "aggressive", system_stats: { template: "minion" } };
  return { kind, label };
}

function OtherFields({ id, value, own, onApply }: { id: string; value: Template; own: ReadonlySet<string>; onApply: (rest: Record<string, unknown>) => void }) {
  const rest = Object.fromEntries(Object.entries(value).filter(([k]) => !own.has(k)));
  const text = Object.keys(rest).length ? stringify(rest, { version: "1.2" }).trim() : "";
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-ui text-label">Other fields (YAML)</span>
      <textarea
        key={text}
        aria-label={`${id} other fields`}
        defaultValue={text}
        rows={Math.min(8, Math.max(2, text.split("\n").length))}
        spellCheck={false}
        placeholder="tags, behavior, verbs, use, light, …"
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
        className={`${small} font-mono`}
      />
      {error && <span className="font-ui text-caption text-danger">{error}</span>}
    </div>
  );
}

export function EntitiesSection({ doc, edit, problems }: { doc: Doc; edit: (f: (d: Doc) => void) => void; problems: Problem[] }) {
  const [id, setId] = useState("");
  const [kind, setKind] = useState<string>("item");
  const entities = doc.entities as Record<string, Template>;
  const system = doc.adventure.system;
  const modules = system.modules ?? [];
  const Stats = systemUi(system.id)?.StatsEditor;
  const set = (key: string, f: (t: Template) => void) => edit((d) => f((d.entities as Record<string, Template>)[key]!));
  const ok = ID.test(id) && !(id in entities);

  return (
    <div className="flex flex-col gap-4">
      <p className="font-ui text-caption text-muted">
        Adventure-specific items and creatures, keyed by id, as in entities/*.yaml. Placed on maps as {doc.adventure.id}:id.
        {modules.length > 0 && ` System modules: ${modules.join(", ")}.`}
      </p>
      {Object.entries(entities).map(([key, t]) => {
        const statsKind = statsKindOf(t.kind);
        const own = statsKind && Stats ? OWN : OWN_NO_STATS;
        const here = problems.filter((p) => p.pointer === `/entities/${key}` || p.pointer.startsWith(`/entities/${key}/`));
        return (
          <section key={key} className="flex flex-col gap-2 rounded-control border border-rule p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-code">{key}</span>
              <select aria-label={`${key} kind`} value={t.kind ?? ""} onChange={(e) => set(key, (x) => void (x.kind = e.target.value))} className={small}>
                {!KINDS.includes(t.kind as never) && <option value={t.kind ?? ""}>{t.kind ?? "kind"}</option>}
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <input aria-label={`${key} label`} value={t.label ?? ""} maxLength={80} onChange={(e) => set(key, (x) => void (x.label = e.target.value))} className={`${field} flex-1`} />
              <button type="button" className="font-ui text-caption text-danger" onClick={() => edit((d) => void delete d.entities[key])}>
                Delete
              </button>
            </div>
            {statsKind && (
              <div className="flex flex-col gap-1">
                <span className="font-ui text-label">
                  System stats <span className="text-muted">({system.id} {statsKind})</span>
                </span>
                {Stats ? (
                  <Stats
                    system={system.id}
                    modules={modules}
                    kind={statsKind}
                    value={t.system_stats}
                    name={key}
                    onChange={(next) =>
                      set(key, (x) => {
                        // Creatures require system_stats; items, obstacles, and doors may leave them out.
                        if (Object.keys(next).length === 0 && x.kind !== "creature") delete x.system_stats;
                        else x.system_stats = next;
                      })
                    }
                  />
                ) : (
                  <p className="font-ui text-caption text-muted">No stats editor for {system.id}; edit system_stats in the YAML below.</p>
                )}
              </div>
            )}
            <OtherFields
              id={key}
              value={t}
              own={own}
              onApply={(rest) =>
                set(key, (x) => {
                  for (const k of Object.keys(x)) if (!own.has(k)) delete x[k];
                  Object.assign(x, rest);
                })
              }
            />
            {here.length > 0 && (
              <ul className="font-ui text-caption">
                {here.map((p, i) => (
                  <li key={i} className={p.severity === "error" ? "text-danger" : "text-warning"}>
                    {p.message} <span className="font-mono text-muted">{p.pointer.slice(`/entities/${key}`.length) || "/"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          edit((d) => void (d.entities[id] = fresh(kind, id)));
          setId("");
        }}
      >
        <select aria-label="New entity kind" value={kind} onChange={(e) => setKind(e.target.value)} className={small}>
          {KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <input aria-label="New id" value={id} placeholder="new_id" onChange={(e) => setId(e.target.value)} className={`${small} w-40 font-mono`} />
        <button type="submit" disabled={!ok} className={`${quiet} disabled:text-muted`}>
          Add {kind}
        </button>
      </form>
    </div>
  );
}
