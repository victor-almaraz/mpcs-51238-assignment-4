"use client";
// The adventure editor (app-flow.md, Adventure editor): sections, a workspace per section, every
// section also as YAML, the Problems panel, and a status bar with save state, Undo, Redo, Snapshot,
// Export, and Publish. Saves 2 seconds after the last edit with the draft revision; a local backup in
// IndexedDB keeps unsaved changes across reloads. Every edit is also validated in the browser after
// 400 ms (live-validation.ts); a save's diagnostics from the server replace the browser's.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parse, stringify } from "yaml";
import { copyDraftAction, requiredSettingsAction, saveDraftAction } from "@/lib/server/draft-actions";
import { content, freshId, ID, type Adventure, type AuthoredLocation, type Doc, type Flag, type Npc, type Problem, type Refs } from "./doc";
import { EntitiesSection } from "./entities";
import { useLiveValidation } from "./live-validation";
import { MapEditor } from "./map-editor";
import { PlotSection } from "./plot";
import { Playtest } from "./playtest";
import type { SettingBundle } from "@/lib/bundle/setting";

type Section = "overview" | "flags" | "plot" | "locations" | "npcs" | "entities";
const SECTIONS: { id: Section; label: string; key: keyof Doc }[] = [
  { id: "overview", label: "Overview", key: "adventure" },
  { id: "flags", label: "Flags", key: "flags" },
  { id: "plot", label: "Plot", key: "arcs" },
  { id: "locations", label: "Locations", key: "locations" },
  { id: "npcs", label: "NPCs", key: "npcs" },
  { id: "entities", label: "Items & creatures", key: "entities" },
];
const SECTION_OF: Record<string, Section> = { adventure: "overview", flags: "flags", arcs: "plot", locations: "locations", npcs: "npcs", entities: "entities" };

const field = "rounded-control border border-border bg-page px-2 py-1";
const small = "rounded-control border border-border bg-page px-1 font-ui text-caption";
const quiet = "font-ui text-caption text-accent";

// Local backup -------------------------------------------------------------------------------------

function idb<T>(run: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(undefined);
    const open = indexedDB.open("cadmium-editor", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("backups");
    open.onerror = () => resolve(undefined);
    open.onsuccess = () => {
      const req = run(open.result.transaction("backups", mode).objectStore("backups"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    };
  });
}
const backup = { put: (id: string, v: unknown) => idb((s) => s.put(v, id), "readwrite"), get: (id: string) => idb<{ revision: number; doc: Doc }>((s) => s.get(id), "readonly"), drop: (id: string) => idb((s) => s.delete(id), "readwrite") };

// YAML panel ---------------------------------------------------------------------------------------

function YamlPanel({ value, onApply }: { value: unknown; onApply: (v: unknown) => void }) {
  const [text, setText] = useState(() => stringify(value, { version: "1.2" }));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={24} spellCheck={false} className={`${field} font-mono text-code`} />
      {error && <p className="font-ui text-caption text-danger">{error}</p>}
      <div>
        <button
          type="button"
          className="rounded-control border border-border px-3 py-1 font-ui text-control"
          onClick={() => {
            try {
              onApply(parse(text, { version: "1.2" }) ?? {});
              setError(null);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Apply YAML
        </button>
      </div>
    </div>
  );
}

// Sections -----------------------------------------------------------------------------------------

function Overview({ doc, refs, edit }: { doc: Doc; refs: Refs; edit: (f: (d: Doc) => void) => void }) {
  const a = doc.adventure;
  const locations = Object.keys(doc.locations);
  const start = doc.locations[a.start.location];
  const rooms = start && start.kind === "authored" ? Object.keys((start as AuthoredLocation).map.rooms) : [];
  const set = (f: (a: Adventure) => void) => edit((d) => f(d.adventure));
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-ui text-label">Title</span>
        <input value={a.title} maxLength={80} onChange={(e) => set((x) => void (x.title = e.target.value))} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-ui text-label">Description</span>
        <textarea value={a.description ?? ""} maxLength={2000} rows={3} onChange={(e) => set((x) => void (e.target.value ? (x.description = e.target.value) : delete x.description))} className={field} />
      </label>
      <p className="font-ui text-label">
        System: {a.system.id} {a.system.versions} <span className="text-muted">(fixed after creation)</span>
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-ui text-label">Required settings</legend>
        {refs.settings.map((s) => {
          const r = a.requires_settings.find((x) => x.id === s.id);
          return (
            <div key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!r}
                onChange={(e) =>
                  set((x) => {
                    const [major, minor] = s.version.split(".");
                    x.requires_settings = e.target.checked ? [...x.requires_settings, { id: s.id, versions: `^${major}.${minor}` }] : x.requires_settings.filter((q) => q.id !== s.id);
                  })
                }
              />
              <span>{s.title}</span>
              {r && <input aria-label={`${s.id} versions`} value={r.versions} onChange={(e) => set((x) => void (x.requires_settings.find((q) => q.id === s.id)!.versions = e.target.value))} className={`${small} w-20 font-mono`} />}
            </div>
          );
        })}
      </fieldset>
      <div className="flex items-center gap-2">
        <span className="font-ui text-label">Players</span>
        <input type="number" min={1} max={a.players[1]} value={a.players[0]} onChange={(e) => set((x) => void (x.players[0] = Number(e.target.value)))} className={`${small} w-14`} />
        to
        <input type="number" min={a.players[0]} max={8} value={a.players[1]} onChange={(e) => set((x) => void (x.players[1] = Number(e.target.value)))} className={`${small} w-14`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-ui text-label">Start</span>
        <select aria-label="Start location" value={a.start.location} onChange={(e) => set((x) => void (x.start = { ...x.start, location: e.target.value, room: "" }))} className={small}>
          <option value="">location</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Start room" value={a.start.room} onChange={(e) => set((x) => void (x.start.room = e.target.value))} className={small}>
          <option value="">room</option>
          {rooms.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className="font-ui text-label">Endings</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {Object.entries(a.endings).map(([id, e]) => (
            <div key={id} className="flex items-center gap-1 rounded-control border border-rule p-2">
              <span className="font-mono text-code">{id}</span>
              <input aria-label={`${id} label`} value={e.label} onChange={(ev) => set((x) => void (x.endings[id]!.label = ev.target.value))} className={`${small} w-44`} />
              <button type="button" className="font-ui text-caption text-danger" onClick={() => set((x) => void delete x.endings[id])}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className={quiet} onClick={() => set((x) => void (x.endings[freshId(Object.keys(x.endings).length ? "ending" : "lost", Object.keys(x.endings))] = { label: "New ending" }))}>
            Add ending
          </button>
        </div>
      </div>
    </div>
  );
}

function usesOf(doc: Doc, flag: string): number {
  const text = JSON.stringify([doc.arcs, doc.npcs, doc.locations, doc.adventure.start]);
  return (text.match(new RegExp(`"flag":"${flag}"`, "g")) ?? []).length;
}

function Flags({ doc, edit }: { doc: Doc; edit: (f: (d: Doc) => void) => void }) {
  const [blocked, setBlocked] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <table className="font-ui text-caption">
        <thead>
          <tr className="text-left text-muted">
            <th className="pr-2">Name</th>
            <th className="pr-2">Type</th>
            <th className="pr-2">Range or values</th>
            <th className="pr-2">Initial</th>
            <th className="pr-2">Used by</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Object.entries(doc.flags).map(([id, f]) => (
            <tr key={id} className="border-b border-rule">
              <td className="py-1 pr-2 font-mono">{id}</td>
              <td className="pr-2">
                <select
                  aria-label={`${id} type`}
                  value={f.type}
                  onChange={(e) =>
                    edit((d) => {
                      const t = e.target.value as Flag["type"];
                      d.flags[id] = t === "bool" ? { type: t, initial: false } : t === "int" ? { type: t, min: 0, max: 10, initial: 0 } : { type: t, values: ["a", "b"], initial: "a" };
                    })
                  }
                  className={small}
                >
                  <option value="bool">bool</option>
                  <option value="int">int</option>
                  <option value="enum">enum</option>
                </select>
              </td>
              <td className="pr-2">
                {f.type === "int" && (
                  <span className="flex gap-1">
                    <input aria-label="min" type="number" value={f.min ?? 0} onChange={(e) => edit((d) => void (d.flags[id]!.min = Number(e.target.value)))} className={`${small} w-14`} />
                    <input aria-label="max" type="number" value={f.max ?? 0} onChange={(e) => edit((d) => void (d.flags[id]!.max = Number(e.target.value)))} className={`${small} w-14`} />
                  </span>
                )}
                {f.type === "enum" && <input aria-label="values" defaultValue={(f.values ?? []).join(", ")} onBlur={(e) => edit((d) => void (d.flags[id]!.values = e.target.value.split(/[,\s]+/).filter(Boolean)))} className={`${small} w-40`} />}
              </td>
              <td className="pr-2">
                {f.type === "bool" ? (
                  <input type="checkbox" checked={f.initial === true} onChange={(e) => edit((d) => void (d.flags[id]!.initial = e.target.checked))} />
                ) : f.type === "int" ? (
                  <input type="number" value={Number(f.initial)} onChange={(e) => edit((d) => void (d.flags[id]!.initial = Number(e.target.value)))} className={`${small} w-14`} />
                ) : (
                  <select value={String(f.initial)} onChange={(e) => edit((d) => void (d.flags[id]!.initial = e.target.value))} className={small}>
                    {(f.values ?? []).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                )}
              </td>
              <td className="pr-2">{usesOf(doc, id)}</td>
              <td>
                <button
                  type="button"
                  className="text-danger"
                  onClick={() => {
                    const n = usesOf(doc, id);
                    if (n > 0) return setBlocked(`${id} is used ${n} time${n === 1 ? "" : "s"}; remove those uses first.`);
                    edit((d) => void delete d.flags[id]);
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {blocked && <p className="font-ui text-caption text-danger">{blocked}</p>}
      <NewId label="Add flag" taken={Object.keys(doc.flags)} onAdd={(id) => edit((d) => void (d.flags[id] = { type: "bool", initial: false }))} />
    </div>
  );
}

function NewId({ label, taken, onAdd }: { label: string; taken: string[]; onAdd: (id: string) => void }) {
  const [id, setId] = useState("");
  const ok = ID.test(id) && !taken.includes(id);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) {
          onAdd(id);
          setId("");
        }
      }}
    >
      <input aria-label="New id" value={id} placeholder="new_id" onChange={(e) => setId(e.target.value)} className={`${small} w-40 font-mono`} />
      <button type="submit" disabled={!ok} className={`${quiet} disabled:text-muted`}>
        {label}
      </button>
    </form>
  );
}

function Locations({ doc, refs, edit, focus }: { doc: Doc; refs: Refs; edit: (f: (d: Doc) => void) => void; focus: string | null }) {
  const ids = Object.keys(doc.locations);
  const [current, setCurrent] = useState<string | null>(focus ?? ids[0] ?? null);
  const loc = current ? doc.locations[current] : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 font-ui text-control">
        {ids.map((id) => (
          <button key={id} type="button" aria-pressed={id === current} onClick={() => setCurrent(id)} className={id === current ? "border-b-2 border-accent" : "text-muted"}>
            {id}
          </button>
        ))}
        <NewId
          label="Add authored location"
          taken={ids}
          onAdd={(id) => {
            edit((d) => void (d.locations[id] = { id, kind: "authored", map: { rows: ["##########", "#........#", "#........#", "#........#", "##########"], rooms: {} } }));
            setCurrent(id);
          }}
        />
      </div>
      {loc?.kind === "authored" && (
        <MapEditor
          loc={loc as AuthoredLocation}
          doc={doc}
          refs={refs}
          change={(f) =>
            edit((d) => {
              f(d.locations[current!] as AuthoredLocation, d);
            })
          }
        />
      )}
      {loc && loc.kind !== "authored" && <YamlPanel key={current} value={loc} onApply={(v) => edit((d) => void (d.locations[current!] = v as never))} />}
      {loc && (
        <button type="button" className="self-start font-ui text-caption text-danger" onClick={() => edit((d) => void delete d.locations[current!])}>
          Delete location
        </button>
      )}
    </div>
  );
}

function Npcs({ doc, refs, edit }: { doc: Doc; refs: Refs; edit: (f: (d: Doc) => void) => void }) {
  const creatures = refs.templates.filter((t) => t.kind === "creature");
  const set = (id: string, f: (n: Npc) => void) => edit((d) => f(d.npcs[id]!));
  return (
    <div className="flex flex-col gap-6">
      {Object.values(doc.npcs).map((n) => (
        <section key={n.id} className="flex flex-col gap-2 rounded-control border border-rule p-3">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-code">{n.id}</span>
            <button type="button" className="font-ui text-caption text-danger" onClick={() => edit((d) => void delete d.npcs[n.id])}>
              Delete NPC
            </button>
          </div>
          <input aria-label="Name" value={n.name} onChange={(e) => set(n.id, (x) => void (x.name = e.target.value))} className={field} />
          <div className="flex gap-2">
            <select aria-label="Template" value={n.template} onChange={(e) => set(n.id, (x) => void (x.template = e.target.value))} className={small}>
              <option value="">template</option>
              {creatures.map((t) => (
                <option key={t.ref} value={t.ref}>
                  {t.label}
                </option>
              ))}
            </select>
            <select aria-label="Disposition" value={n.disposition ?? ""} onChange={(e) => set(n.id, (x) => void (e.target.value ? (x.disposition = e.target.value as Npc["disposition"]) : delete x.disposition))} className={small}>
              <option value="">disposition</option>
              {["friendly", "neutral", "wary", "hostile"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <p className="font-ui text-label">Topics</p>
          {Object.entries(n.topics ?? {}).map(([tid, t]) => (
            <div key={tid} className="flex flex-col gap-1 rounded-control border border-rule p-2">
              <span className="font-mono text-code">{tid}</span>
              <input aria-label="Topic label" value={t.label} onChange={(e) => set(n.id, (x) => void (x.topics![tid]!.label = e.target.value))} className={small} />
              <textarea aria-label="Brief" value={t.brief} rows={2} onChange={(e) => set(n.id, (x) => void (x.topics![tid]!.brief = e.target.value))} className={small} placeholder="What the narrator may say about it" />
              <input
                aria-label="When (YAML)"
                defaultValue={t.when === undefined ? "" : stringify(t.when, { version: "1.2" }).trim()}
                placeholder="when, as YAML, such as { flag: met_archivist }"
                onBlur={(e) =>
                  set(n.id, (x) => {
                    try {
                      const v = e.target.value.trim() ? parse(e.target.value, { version: "1.2" }) : undefined;
                      if (v === undefined) delete x.topics![tid]!.when;
                      else x.topics![tid]!.when = v;
                    } catch {
                      /* kept as before; the YAML view reports the error */
                    }
                  })
                }
                className={`${small} font-mono`}
              />
              <button type="button" className="self-start font-ui text-caption text-danger" onClick={() => set(n.id, (x) => void delete x.topics![tid])}>
                Remove topic
              </button>
            </div>
          ))}
          <NewId label="Add topic" taken={Object.keys(n.topics ?? {})} onAdd={(tid) => set(n.id, (x) => void (x.topics = { ...(x.topics ?? {}), [tid]: { label: tid.replace(/_/g, " "), brief: "" } }))} />
          <p className="font-ui text-label">Secrets</p>
          {Object.entries(n.secrets ?? {}).map(([sid, text]) => (
            <div key={sid} className="flex items-center gap-2">
              <span className="font-mono text-code">{sid}</span>
              <input aria-label={`${sid} secret`} value={text} onChange={(e) => set(n.id, (x) => void (x.secrets![sid] = e.target.value))} className={`${small} flex-1`} />
              <button type="button" className="font-ui text-caption text-danger" onClick={() => set(n.id, (x) => void delete x.secrets![sid])}>
                Remove
              </button>
            </div>
          ))}
          <NewId label="Add secret" taken={Object.keys(n.secrets ?? {})} onAdd={(sid) => set(n.id, (x) => void (x.secrets = { ...(x.secrets ?? {}), [sid]: "" }))} />
        </section>
      ))}
      <NewId label="Add NPC" taken={Object.keys(doc.npcs)} onAdd={(id) => edit((d) => void (d.npcs[id] = { id, name: id.replace(/_/g, " "), template: creatures[0]?.ref ?? "" }))} />
    </div>
  );
}

// Editor -------------------------------------------------------------------------------------------

export interface EditorProps {
  draftId: string;
  revision: number;
  document: Doc;
  diagnostics: Problem[];
  refs: Refs;
  /** The required settings' bundles, for playtesting in the browser. */
  settings: SettingBundle[];
}

export function Editor(props: EditorProps) {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc>(props.document);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [section, setSection] = useState<Section>("overview");
  const [yaml, setYaml] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  // The required settings' bundles for validation and playtest; reloaded when requires_settings changes.
  const [settings, setSettings] = useState<SettingBundle[]>(props.settings);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const live = useLiveValidation(props.diagnostics, loadingSettings ? null : settings);
  const problems = live.problems;
  const [status, setStatus] = useState<{ state: "saved" | "pending" | "saving" | "error" | "conflict"; at?: string; message?: string }>({ state: "saved" });
  const [restorable, setRestorable] = useState<Doc | null>(null);
  const [playtest, setPlaytest] = useState(false);
  const revision = useRef(props.revision);
  const latest = useRef(doc);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Increases with every change of the document, so results apply only to the edit they checked. */
  const seq = useRef(0);
  const requires = useRef(JSON.stringify(props.document.adventure.requires_settings));
  const settingsRequest = useRef(0);

  // Offer unsaved changes from the local backup, when it is newer than the server's copy.
  useEffect(() => {
    void backup.get(props.draftId).then((b) => {
      if (b && b.revision >= props.revision && JSON.stringify(b.doc) !== JSON.stringify(props.document)) setRestorable(b.doc);
    });
  }, [props.draftId, props.revision, props.document]);

  const { check, fromServer } = live;
  const save = useCallback(async () => {
    setStatus({ state: "saving" });
    const at = seq.current;
    const r = await saveDraftAction({ draft_id: props.draftId, document: latest.current as unknown as Record<string, unknown>, revision: revision.current });
    if (r.error) return setStatus({ state: r.conflict ? "conflict" : "error", message: r.error });
    revision.current = r.revision!;
    fromServer(r.diagnostics ?? [], at);
    setStatus({ state: "saved", at: r.saved_at });
    void backup.drop(props.draftId);
  }, [props.draftId, fromServer]);

  /** A new current document: validated in the browser now, saved 2 seconds after the last change. */
  const changed = useCallback(
    (next: Doc) => {
      setDoc(next);
      latest.current = next;
      seq.current += 1;
      const key = JSON.stringify(next.adventure?.requires_settings);
      if (key !== requires.current) {
        requires.current = key;
        const n = ++settingsRequest.current;
        setLoadingSettings(true);
        void requiredSettingsAction(props.draftId, next.adventure?.requires_settings).then((s) => {
          if (n !== settingsRequest.current) return;
          if (s) setSettings(s);
          setLoadingSettings(false);
        });
      }
      check(next as unknown as Record<string, unknown>, seq.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), 2000);
    },
    [props.draftId, check, save],
  );

  const commit = useCallback(
    (next: Doc, from: Doc) => {
      setPast((p) => [...p.slice(-99), from]);
      setFuture([]);
      setStatus({ state: "pending" });
      void backup.put(props.draftId, { revision: revision.current, doc: next });
      changed(next);
    },
    [props.draftId, changed],
  );

  const edit = useCallback(
    (f: (d: Doc) => void) => {
      const from = latest.current;
      const next = structuredClone(from);
      f(next);
      commit(next, from);
    },
    [commit],
  );

  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([latest.current, ...future]);
    changed(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, latest.current]);
    changed(next);
  };

  const jump = (p: Problem) => {
    const [, top, id] = p.pointer.split("/");
    setSection(SECTION_OF[top ?? "adventure"] ?? "overview");
    setYaml(false);
    if (top === "locations" && id) setFocus(id);
  };

  const errors = problems.filter((p) => p.severity === "error");
  const key = SECTIONS.find((s) => s.id === section)!.key;

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      {restorable && (
        <p className="border-b border-warning bg-warning-soft px-4 py-2 font-ui text-control">
          This browser holds unsaved changes.{" "}
          <button type="button" className="underline" onClick={() => (commit(restorable, latest.current), setRestorable(null))}>
            Restore them
          </button>{" "}
          <button type="button" className="ml-2 text-muted underline" onClick={() => (setRestorable(null), void backup.drop(props.draftId))}>
            Discard
          </button>
        </p>
      )}
      {status.state === "conflict" && (
        <p className="border-b border-danger bg-danger-soft px-4 py-2 font-ui text-control">
          {status.message}{" "}
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Reload
          </button>{" "}
          <button
            type="button"
            className="ml-2 underline"
            onClick={async () => {
              const a = latest.current.adventure;
              const r = await copyDraftAction({ document: latest.current as unknown as Record<string, unknown>, material_id: a.id, title: `${a.title} (copy)`.slice(0, 80), system: a.system.id, requires: a.requires_settings });
              if (r.id) router.push(`/adventures/${r.id}/edit`);
              else setStatus({ state: "error", message: r.error ?? "copy failed" });
            }}
          >
            Keep mine as a new draft
          </button>
        </p>
      )}
      <div className="grid flex-1 grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[12rem_minmax(0,1fr)_16rem]">
        <nav className="flex flex-row flex-wrap gap-2 font-ui text-control lg:flex-col">
          <p className="hidden font-display text-heading lg:block">{doc.adventure.title || doc.adventure.id}</p>
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={s.id === section ? "page" : undefined} onClick={() => (setSection(s.id), setYaml(false))} className={`text-left ${s.id === section ? "text-accent" : ""}`}>
              {s.label}
            </button>
          ))}
        </nav>
        <main className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between">
            <h1 className="font-display text-title">{SECTIONS.find((s) => s.id === section)!.label}</h1>
            <button type="button" aria-pressed={yaml} onClick={() => setYaml(!yaml)} className={quiet}>
              {yaml ? "Close YAML" : "Edit as YAML"}
            </button>
          </div>
          {yaml ? (
            <YamlPanel key={`${section}:${past.length}:${future.length}`} value={doc[key]} onApply={(v) => edit((d) => void ((d as unknown as Record<string, unknown>)[key] = v))} />
          ) : section === "overview" ? (
            <Overview doc={doc} refs={props.refs} edit={edit} />
          ) : section === "flags" ? (
            <Flags doc={doc} edit={edit} />
          ) : section === "plot" ? (
            <PlotSection doc={doc} refs={props.refs} edit={edit} />
          ) : section === "locations" ? (
            <Locations doc={doc} refs={props.refs} edit={edit} focus={focus} />
          ) : section === "npcs" ? (
            <Npcs doc={doc} refs={props.refs} edit={edit} />
          ) : (
            <EntitiesSection doc={doc} edit={edit} problems={problems} />
          )}
        </main>
        <aside className="flex flex-col gap-4 font-ui text-caption">
          <div>
            <p className="font-ui text-label">Problems ({errors.length})</p>
            <p className="text-muted">
              {live.state === "checking" || loadingSettings
                ? "Checking…"
                : live.state === "off"
                  ? "Checked when saved."
                  : live.state === "failed"
                    ? "The live check failed; showing the last results."
                    : live.source === "browser"
                      ? "Checked as you edit."
                      : "Checked when saved."}
            </p>
            {problems.length === 0 && <p className="text-muted">None.</p>}
            <ul className="mt-1 flex max-h-96 flex-col gap-1 overflow-auto">
              {problems.map((p, i) => (
                <li key={i}>
                  <button type="button" className="text-left" onClick={() => jump(p)}>
                    <span className={p.severity === "error" ? "text-danger" : "text-warning"}>{i + 1}.</span> {p.message} <span className="font-mono text-muted">{p.pointer || "/"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-ui text-label">Snapshots</p>
            <button
              type="button"
              className={quiet}
              onClick={() => {
                const name = window.prompt("Snapshot name")?.trim();
                if (name) edit((d) => void d.editor.snapshots.push({ name: name.slice(0, 80), saved_at: new Date().toISOString(), document: content(d) }));
              }}
            >
              Take snapshot
            </button>
            <ul className="mt-1">
              {doc.editor.snapshots.map((s, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{s.name}</span>
                  <button type="button" className="text-accent" onClick={() => edit((d) => Object.assign(d, structuredClone(s.document as object)))}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
      {playtest && (
        <section className="border-t border-rule px-4 py-4">
          <h2 className="mb-2 font-display text-heading">Playtest</h2>
          <Playtest doc={doc} settings={settings} />
        </section>
      )}
      <footer className="flex flex-wrap items-center gap-4 border-t border-rule px-4 py-2 font-ui text-caption">
        <span className={errors.length ? "text-danger" : ""}>Problems ({errors.length})</span>
        <span>{status.state === "saved" ? (status.at ? `Saved ${new Date(status.at).toLocaleTimeString()}` : "Saved") : status.state === "pending" ? "Unsaved changes" : status.state === "saving" ? "Saving…" : (status.message ?? "Not saved")}</span>
        <button type="button" onClick={undo} disabled={!past.length} className="disabled:text-muted">
          Undo
        </button>
        <button type="button" onClick={redo} disabled={!future.length} className="disabled:text-muted">
          Redo
        </button>
        <a href={`/v1/drafts/${props.draftId}/export.zip`} className="text-accent">
          Export
        </a>
        <button type="button" aria-pressed={playtest} onClick={() => setPlaytest(!playtest)} className="text-accent">
          {playtest ? "Close playtest" : "Playtest"}
        </button>
        <Link href={`/adventures/${props.draftId}/publish`} aria-disabled={errors.length > 0} title={errors.length ? `Fix ${errors.length} problem${errors.length === 1 ? "" : "s"} to publish` : undefined} className={`ml-auto rounded-control px-3 py-1 text-page ${errors.length ? "pointer-events-none bg-muted" : "bg-accent"}`}>
          Publish
        </Link>
      </footer>
    </div>
  );
}
