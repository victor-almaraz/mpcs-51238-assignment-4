"use client";
// The editor's form sections (app-flow.md, Adventure editor: Sections): Overview, Flags, Locations,
// NPCs, and the YAML view every section also has. Plot is plot.tsx; Items & creatures is entities.tsx.
// Every field marks the draft value it edits with `data-pointer` and shows its own problems.
import { MapPinned, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { Fragment, useState } from "react";
import { parse, stringify } from "yaml";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { Choice, FieldGroup, Select, TextArea, TextInput } from "@/components/ui/field";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { DeleteButton, denseInput, denseSelect, NewId, Panel, RemoveButton } from "./controls";
import { freshId, usesOf, type Adventure, type AuthoredLocation, type Doc, type Flag, type Npc, type Problem, type Refs } from "./doc";
import { MapEditor } from "./map-editor";
import type { YamlFile } from "./yaml-editor";
import { EditorField, fieldId, InlineProblems, problemProps, useProblems } from "./problems";
import { plural } from "@/lib/text";

type Edit = (f: (d: Doc) => void) => void;

/** A reveal request from the Problems panel: the pointer to show, and a counter so a repeat still applies. */
export type Reveal = { pointer: string; n: number } | null;

// YAML ---------------------------------------------------------------------------------------------

// Monaco is large and browser-only, so it loads when a YAML view first opens.
const YamlEditor = dynamic(() => import("./yaml-editor"), {
  ssr: false,
  loading: () => <div className="flex h-[32rem] items-center justify-center rounded-card border border-border bg-page text-caption text-muted">Loading the YAML editor</div>,
});

/** The schema a YAML view validates against: a whole section, or one location. */
const yamlFile = (pointer: string | undefined): YamlFile => (/^\/locations\/[^/]+$/.test(pointer ?? "") ? "location" : ((pointer ?? "/adventure").slice(1).split("/")[0] as YamlFile));

export function YamlPanel({ value, onApply, label, pointer }: { value: unknown; onApply: (v: unknown) => void; label: string; pointer?: string }) {
  const [text, setText] = useState(() => stringify(value, { version: "1.2" }));
  const [error, setError] = useState<string | null>(null);
  const { under } = useProblems();
  const problems = pointer ? under(pointer) : [];
  const id = fieldId(`${pointer ?? ""}/yaml`);
  return (
    <div data-pointer={pointer} id={id} className="flex min-h-0 flex-col gap-3">
      <YamlEditor value={text} onChange={setText} file={yamlFile(pointer)} label={label} invalid={!!error || problems.length > 0} />
      {error && (
        <Notice tone="danger" live>
          <p id={`${id}-error`}>{error}</p>
        </Notice>
      )}
      <InlineProblems id={`${id}-problems`} problems={problems} />
      <div>
        <Button
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
        </Button>
      </div>
    </div>
  );
}

// Overview -----------------------------------------------------------------------------------------

export function Overview({ doc, refs, edit, general }: { doc: Doc; refs: Refs; edit: Edit; general: Problem[] }) {
  const a = doc.adventure;
  const { under, rest } = useProblems();
  const locations = Object.keys(doc.locations);
  const start = doc.locations[a.start.location];
  const rooms = start && start.kind === "authored" ? Object.keys((start as AuthoredLocation).map.rooms) : [];
  const set = (f: (a: Adventure) => void) => edit((d) => f(d.adventure));
  const own = ["title", "description", "requires_settings", "players", "start", "endings"].map((k) => `/adventure/${k}`);
  const top = [...general, ...rest("/adventure", own)];
  const startRest = rest("/adventure/start", ["/adventure/start/location", "/adventure/start/room"]);
  const playersRest = rest("/adventure/players", ["/adventure/players/0", "/adventure/players/1"]);
  const settingsRest = rest(
    "/adventure/requires_settings",
    a.requires_settings.map((_, i) => `/adventure/requires_settings/${i}`),
  );
  const endingsRest = rest(
    "/adventure/endings",
    Object.keys(a.endings).map((id) => `/adventure/endings/${id}`),
  );
  return (
    <div className="flex max-w-form flex-col gap-6">
      {top.length > 0 && (
        <Panel pointer="/adventure" aria-label="Problems with the whole adventure">
          <InlineProblems problems={top} />
        </Panel>
      )}
      <FieldGroup legend="Details">
        <EditorField pointer="/adventure/title" label="Title">
          {(p) => <TextInput {...p} value={a.title} maxLength={80} onChange={(e) => set((x) => void (x.title = e.target.value))} />}
        </EditorField>
        <EditorField pointer="/adventure/description" label="Description" optional hint="Shown to game masters when they choose an adventure for a campaign.">
          {(p) => <TextArea {...p} value={a.description ?? ""} maxLength={2000} rows={4} onChange={(e) => set((x) => void (e.target.value ? (x.description = e.target.value) : delete x.description))} />}
        </EditorField>
        <div className="flex flex-col gap-1.5">
          <p className="text-label font-medium text-ink">System</p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-code">
              {a.system.id} {a.system.versions}
            </span>
            {(a.system.modules ?? []).map((m) => (
              <Badge key={m}>
                {m} module
              </Badge>
            ))}
            <span className="text-caption text-muted">Fixed after creation.</span>
          </p>
        </div>
      </FieldGroup>

      <FieldGroup legend="Players and start">
        <div data-pointer="/adventure/players" className="flex flex-col gap-2">
          <div className="grid gap-4 @md:grid-cols-2">
            <EditorField pointer="/adventure/players/0" label="Fewest players">
              {(p) => <TextInput {...p} type="number" min={1} max={a.players[1]} value={a.players[0]} onChange={(e) => set((x) => void (x.players[0] = Number(e.target.value)))} className="tabular" />}
            </EditorField>
            <EditorField pointer="/adventure/players/1" label="Most players">
              {(p) => <TextInput {...p} type="number" min={a.players[0]} max={8} value={a.players[1]} onChange={(e) => set((x) => void (x.players[1] = Number(e.target.value)))} className="tabular" />}
            </EditorField>
          </div>
          <InlineProblems problems={playersRest} />
        </div>
        <div data-pointer="/adventure/start" className="flex flex-col gap-2">
          <div className="grid gap-4 @md:grid-cols-2">
            <EditorField pointer="/adventure/start/location" label="Start location">
              {(p) => (
                <Select {...p} value={a.start.location} onChange={(e) => set((x) => void (x.start = { ...x.start, location: e.target.value, room: "" }))}>
                  <option value="">Choose a location</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </EditorField>
            <EditorField pointer="/adventure/start/room" label="Start room">
              {(p) => (
                <Select {...p} value={a.start.room} onChange={(e) => set((x) => void (x.start.room = e.target.value))}>
                  <option value="">Choose a room</option>
                  {rooms.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              )}
            </EditorField>
          </div>
          <InlineProblems problems={startRest} />
        </div>
      </FieldGroup>

      <div data-pointer="/adventure/requires_settings">
        <FieldGroup legend="Required settings" description="The settings whose terrain, templates, and conditions this adventure uses, with the versions it accepts.">
          <ul className="flex flex-col">
            {refs.settings.map((s) => {
              const i = a.requires_settings.findIndex((x) => x.id === s.id);
              const r = a.requires_settings[i];
              const here = r ? under(`/adventure/requires_settings/${i}`) : [];
              const vid = fieldId(`/adventure/requires_settings/${s.id}/versions`);
              return (
                <li key={s.id} data-pointer={r ? `/adventure/requires_settings/${i}` : undefined} className="flex flex-col gap-1 border-b border-rule py-1 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-4">
                    <Choice
                      label={s.title}
                      hint={<span className="font-mono">{s.id}</span>}
                      checked={!!r}
                      onChange={(e) =>
                        set((x) => {
                          const [major, minor] = s.version.split(".");
                          x.requires_settings = e.target.checked ? [...x.requires_settings, { id: s.id, versions: `^${major}.${minor}` }] : x.requires_settings.filter((q) => q.id !== s.id);
                        })
                      }
                    />
                    {r && (
                      <label htmlFor={vid} className="flex items-center gap-2 text-caption text-muted">
                        Versions
                        <input {...problemProps(vid, here)} value={r.versions} onChange={(e) => set((x) => void (x.requires_settings.find((q) => q.id === s.id)!.versions = e.target.value))} className={cx(denseInput, "w-24 font-mono")} />
                      </label>
                    )}
                  </div>
                  <InlineProblems id={`${vid}-problems`} problems={here} className="pb-1" />
                </li>
              );
            })}
          </ul>
          <InlineProblems problems={settingsRest} />
        </FieldGroup>
      </div>

      <div data-pointer="/adventure/endings">
        <FieldGroup legend="Endings" description="How the adventure can end. A trigger's end campaign effect chooses one.">
          {Object.keys(a.endings).length === 0 && <p className="text-caption text-muted">No endings yet.</p>}
          <ul className="flex flex-col gap-3">
            {Object.entries(a.endings).map(([id, e]) => {
              const pointer = `/adventure/endings/${id}`;
              const here = under(pointer);
              const fid = fieldId(pointer);
              return (
                <li key={id} data-pointer={pointer} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor={fid} className="w-32 shrink-0 truncate font-mono text-code" title={id}>
                      {id}
                    </label>
                    <TextInput {...problemProps(fid, here)} value={e.label} onChange={(ev) => set((x) => void (x.endings[id]!.label = ev.target.value))} />
                    <DeleteButton dense label={`Remove ending ${id}`} name={`ending ${id}`} doc={doc} target={{ kind: "ending", id }} onDelete={() => set((x) => void delete x.endings[id])} />
                  </div>
                  <InlineProblems id={`${fid}-problems`} problems={here} className="pl-34" />
                </li>
              );
            })}
          </ul>
          <InlineProblems problems={endingsRest} />
          <div>
            <Button variant="quiet" size="sm" icon={<Plus {...ICON_DENSE} />} onClick={() => set((x) => void (x.endings[freshId(Object.keys(x.endings).length ? "ending" : "lost", Object.keys(x.endings))] = { label: "New ending" }))}>
              Add ending
            </Button>
          </div>
        </FieldGroup>
      </div>
    </div>
  );
}

// Flags --------------------------------------------------------------------------------------------

export function Flags({ doc, edit }: { doc: Doc; edit: Edit }) {
  const [blocked, setBlocked] = useState<string | null>(null);
  const { under, rest } = useProblems();
  const entries = Object.entries(doc.flags);
  const top = rest("/flags", Object.keys(doc.flags).map((id) => `/flags/${id}`));
  const th = "px-3 py-2 text-left text-caption font-medium text-muted";
  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <InlineProblems problems={top} />
      {entries.length === 0 ? (
        <EmptyState>No flags yet. Flags hold the values triggers read and set.</EmptyState>
      ) : (
        <div className="relative overflow-x-auto rounded-card border border-rule bg-page">
          <table className="w-full min-w-[40rem] text-label">
            <thead className="border-b border-rule">
              <tr>
                <th scope="col" className={th}>
                  Name
                </th>
                <th scope="col" className={th}>
                  Type
                </th>
                <th scope="col" className={th}>
                  Range or values
                </th>
                <th scope="col" className={th}>
                  Initial
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Used by
                </th>
                <th scope="col" className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([id, f]) => {
                const pointer = `/flags/${id}`;
                const here = under(pointer);
                const pid = `${fieldId(pointer)}-problems`;
                const tie = { "aria-describedby": here.length ? pid : undefined, "aria-invalid": here.some((p) => p.severity === "error") || undefined };
                return (
                  <Fragment key={id}>
                  <tr data-pointer={pointer} className={cx("align-middle", here.length === 0 && "border-b border-rule last:border-b-0")}>
                    <th scope="row" className="px-3 py-2 text-left font-mono text-code font-normal">
                      {id}
                    </th>
                    <td className="px-3 py-2" data-pointer={`${pointer}/type`}>
                      <select
                        {...tie}
                        aria-label={`${id} type`}
                        value={f.type}
                        onChange={(e) =>
                          edit((d) => {
                            const t = e.target.value as Flag["type"];
                            d.flags[id] = t === "bool" ? { type: t, initial: false } : t === "int" ? { type: t, min: 0, max: 10, initial: 0 } : { type: t, values: ["a", "b"], initial: "a" };
                          })
                        }
                        className={denseSelect}
                      >
                        <option value="bool">bool</option>
                        <option value="int">int</option>
                        <option value="enum">enum</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {f.type === "int" && (
                        <span className="flex items-center gap-1">
                          <input {...tie} data-pointer={`${pointer}/min`} aria-label={`${id} minimum`} type="number" value={f.min ?? 0} onChange={(e) => edit((d) => void (d.flags[id]!.min = Number(e.target.value)))} className={cx(denseInput, "w-16 tabular")} />
                          <span aria-hidden="true" className="text-muted">
                            –
                          </span>
                          <input {...tie} data-pointer={`${pointer}/max`} aria-label={`${id} maximum`} type="number" value={f.max ?? 0} onChange={(e) => edit((d) => void (d.flags[id]!.max = Number(e.target.value)))} className={cx(denseInput, "w-16 tabular")} />
                        </span>
                      )}
                      {f.type === "enum" && <input key={(f.values ?? []).join(", ")} {...tie} data-pointer={`${pointer}/values`} aria-label={`${id} values, comma-separated`} defaultValue={(f.values ?? []).join(", ")} onBlur={(e) => edit((d) => void (d.flags[id]!.values = e.target.value.split(/[,\s]+/).filter(Boolean)))} className={cx(denseInput, "w-44")} />}
                      {f.type === "bool" && <span className="text-caption text-muted">true or false</span>}
                    </td>
                    <td className="px-3 py-2" data-pointer={`${pointer}/initial`}>
                      {f.type === "bool" ? (
                        <input {...tie} type="checkbox" aria-label={`${id} starts true`} checked={f.initial === true} onChange={(e) => edit((d) => void (d.flags[id]!.initial = e.target.checked))} className="size-5 align-middle accent-[var(--color-accent)]" />
                      ) : f.type === "int" ? (
                        <input {...tie} aria-label={`${id} initial value`} type="number" value={Number(f.initial)} onChange={(e) => edit((d) => void (d.flags[id]!.initial = Number(e.target.value)))} className={cx(denseInput, "w-16 tabular")} />
                      ) : (
                        <select {...tie} aria-label={`${id} initial value`} value={String(f.initial)} onChange={(e) => edit((d) => void (d.flags[id]!.initial = e.target.value))} className={denseSelect}>
                          {(f.values ?? []).map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{usesOf(doc, { kind: "flag", id }).count}</td>
                    <td className="px-1 py-1 text-right">
                      <RemoveButton
                        label={`Delete flag ${id}`}
                        onClick={() => {
                          const uses = usesOf(doc, { kind: "flag", id });
                          if (uses.count > 0) return setBlocked(`${id} is used ${plural(uses.count, "time")}, by ${uses.places.join(", ")}; remove those uses first.`);
                          setBlocked(null);
                          edit((d) => void delete d.flags[id]);
                        }}
                      />
                    </td>
                  </tr>
                  {here.length > 0 && (
                    <tr className="border-b border-rule last:border-b-0">
                      <td colSpan={6} className="px-3 pb-2">
                        <InlineProblems id={pid} problems={here} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {blocked && (
        <Notice tone="warning" live>
          {blocked}
        </Notice>
      )}
      <NewId label="Add flag" noun="flag id" taken={Object.keys(doc.flags)} onAdd={(id) => edit((d) => void (d.flags[id] = { type: "bool", initial: false }))} />
    </div>
  );
}

// Locations ----------------------------------------------------------------------------------------

export function Locations({ doc, refs, edit, current, select, reveal }: { doc: Doc; refs: Refs; edit: Edit; current: string | null; select: (id: string) => void; reveal: Reveal }) {
  const ids = Object.keys(doc.locations);
  const { rest } = useProblems();
  const loc = current ? doc.locations[current] : undefined;
  const add = (
    <NewId
      label="Add authored location"
      noun="location id"
      taken={ids}
      onAdd={(id) => {
        edit((d) => void (d.locations[id] = { id, kind: "authored", map: { rows: ["##########", "#........#", "#........#", "#........#", "##########"], rooms: {} } }));
        select(id);
      }}
    />
  );
  if (!loc || !current) return <EmptyState icon={<MapPinned {...ICON} />} action={add}>No locations yet. Add one, then paint its map.</EmptyState>;
  const pointer = `/locations/${current}`;
  const own = loc.kind === "authored" ? ["rooms", "contents", "links"].map((k) => `${pointer}/map/${k}`) : [pointer];
  const top = rest(pointer, own);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-mono text-heading font-semibold">{current}</h3>
        <Badge>{loc.kind === "authored" ? "Authored map" : "Generated"}</Badge>
        <DeleteButton tip="end" className="ml-auto" label="Delete location" name={`location ${current}`} doc={doc} target={{ kind: "location", id: current }} onDelete={() => edit((d) => void delete d.locations[current])} />
      </div>
      {loc.kind === "authored" && top.length > 0 && (
        <Panel pointer={`${pointer}/map`} aria-label={`Problems with ${current}`}>
          <InlineProblems problems={top} />
        </Panel>
      )}
      {loc.kind === "authored" ? (
        <MapEditor
          key={current}
          loc={loc as AuthoredLocation}
          doc={doc}
          refs={refs}
          reveal={reveal}
          change={(f) =>
            edit((d) => {
              f(d.locations[current] as AuthoredLocation, d);
            })
          }
        />
      ) : (
        <YamlPanel key={current} label={`${current} as YAML`} pointer={pointer} value={loc} onApply={(v) => edit((d) => void (d.locations[current] = v as never))} />
      )}
      <div className="border-t border-rule pt-4">{add}</div>
    </div>
  );
}

// NPCs ---------------------------------------------------------------------------------------------

function NpcCard({ n, doc, creatures, edit }: { n: Npc; doc: Doc; creatures: Refs["templates"]; edit: Edit }) {
  const { under, rest } = useProblems();
  const set = (f: (n: Npc) => void) => edit((d) => f(d.npcs[n.id]!));
  const base = `/npcs/${n.id}`;
  const topics = Object.entries(n.topics ?? {});
  const secrets = Object.entries(n.secrets ?? {});
  const top = rest(base, ["name", "template", "disposition", "topics", "secrets"].map((k) => `${base}/${k}`));
  const topicsRest = rest(`${base}/topics`, topics.map(([t]) => `${base}/topics/${t}`));
  const secretsRest = rest(`${base}/secrets`, secrets.map(([s]) => `${base}/secrets/${s}`));
  const hid = `${fieldId(base)}-title`;
  return (
    <Panel pointer={base} aria-labelledby={hid} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={hid} className="text-heading font-semibold">
            {n.name || n.id}
          </h3>
          <p className="font-mono text-caption text-muted">{n.id}</p>
        </div>
        <DeleteButton tip="end" label={`Delete ${n.name || n.id}`} name={n.name || n.id} doc={doc} target={{ kind: "npc", id: n.id }} onDelete={() => edit((d) => void delete d.npcs[n.id])} />
      </div>
      <InlineProblems problems={top} />
      <div className="grid gap-4 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <EditorField pointer={`${base}/name`} label="Name">
          {(p) => <TextInput {...p} value={n.name} onChange={(e) => set((x) => void (x.name = e.target.value))} />}
        </EditorField>
        <EditorField pointer={`${base}/template`} label="Template">
          {(p) => (
            <Select {...p} value={n.template} onChange={(e) => set((x) => void (x.template = e.target.value))}>
              <option value="">Choose</option>
              {creatures.map((t) => (
                <option key={t.ref} value={t.ref}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </EditorField>
        <EditorField pointer={`${base}/disposition`} label="Disposition" optional>
          {(p) => (
            <Select {...p} value={n.disposition ?? ""} onChange={(e) => set((x) => void (e.target.value ? (x.disposition = e.target.value as Npc["disposition"]) : delete x.disposition))}>
              <option value="">Unset</option>
              {["friendly", "neutral", "wary", "hostile"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          )}
        </EditorField>
      </div>

      <div data-pointer={`${base}/topics`} className="flex flex-col gap-3">
        <h4 className="text-label font-semibold">
          Topics <span className="font-normal text-muted tabular">{topics.length}</span>
        </h4>
        <InlineProblems problems={topicsRest} />
        {topics.map(([tid, t]) => {
          const tp = `${base}/topics/${tid}`;
          const here = rest(tp, [`${tp}/label`, `${tp}/brief`, `${tp}/when`]);
          return (
            <div key={tid} data-pointer={tp} className="flex flex-col gap-3 rounded-card border border-rule bg-desk/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-code">{tid}</span>
                <RemoveButton label={`Remove topic ${tid}`} onClick={() => set((x) => void delete x.topics![tid])} />
              </div>
              <InlineProblems problems={here} />
              <EditorField pointer={`${tp}/label`} label="Label">
                {(p) => <TextInput {...p} value={t.label} onChange={(e) => set((x) => void (x.topics![tid]!.label = e.target.value))} />}
              </EditorField>
              <EditorField pointer={`${tp}/brief`} label="Brief" hint="What the narrator may say about it.">
                {(p) => <TextArea {...p} value={t.brief} rows={2} onChange={(e) => set((x) => void (x.topics![tid]!.brief = e.target.value))} className="font-prose text-prose-sm" />}
              </EditorField>
              <EditorField pointer={`${tp}/when`} label="When" optional hint="A condition as YAML, such as { flag: met_archivist }. Applied when you leave the field.">
                {(p) => (
                  <TextInput
                    key={t.when === undefined ? "" : stringify(t.when, { version: "1.2" }).trim()}
                    {...p}
                    defaultValue={t.when === undefined ? "" : stringify(t.when, { version: "1.2" }).trim()}
                    spellCheck={false}
                    onBlur={(e) =>
                      set((x) => {
                        try {
                          const v = e.target.value.trim() ? parse(e.target.value, { version: "1.2" }) : undefined;
                          if (v === undefined) delete x.topics![tid]!.when;
                          else x.topics![tid]!.when = v;
                        } catch {
                          /* kept as before; the YAML view reports the error */
                        }
                      })
                    }
                    className="font-mono text-code"
                  />
                )}
              </EditorField>
            </div>
          );
        })}
        <NewId label="Add topic" noun="topic id" taken={Object.keys(n.topics ?? {})} onAdd={(tid) => set((x) => void (x.topics = { ...(x.topics ?? {}), [tid]: { label: tid.replace(/_/g, " "), brief: "" } }))} />
      </div>

      <div data-pointer={`${base}/secrets`} className="flex flex-col gap-3">
        <h4 className="text-label font-semibold">
          Secrets <span className="font-normal text-muted tabular">{secrets.length}</span>
        </h4>
        <InlineProblems problems={secretsRest} />
        {secrets.map(([sid, text]) => {
          const sp = `${base}/secrets/${sid}`;
          const here = under(sp);
          const sidId = fieldId(sp);
          return (
            <div key={sid} data-pointer={sp} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label htmlFor={sidId} className="w-36 shrink-0 truncate font-mono text-code" title={sid}>
                  {sid}
                </label>
                <TextInput {...problemProps(sidId, here)} value={text} onChange={(e) => set((x) => void (x.secrets![sid] = e.target.value))} />
                <RemoveButton label={`Remove secret ${sid}`} onClick={() => set((x) => void delete x.secrets![sid])} />
              </div>
              <InlineProblems id={`${sidId}-problems`} problems={here} />
            </div>
          );
        })}
        <NewId label="Add secret" noun="secret id" taken={Object.keys(n.secrets ?? {})} onAdd={(sid) => set((x) => void (x.secrets = { ...(x.secrets ?? {}), [sid]: "" }))} />
      </div>
    </Panel>
  );
}

export function Npcs({ doc, refs, edit }: { doc: Doc; refs: Refs; edit: Edit }) {
  const creatures = refs.templates.filter((t) => t.kind === "creature");
  const { rest } = useProblems();
  const npcs = Object.values(doc.npcs);
  const top = rest("/npcs", Object.keys(doc.npcs).map((id) => `/npcs/${id}`));
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <InlineProblems problems={top} />
      {npcs.length === 0 && <EmptyState>No NPCs yet. NPCs talk about topics and keep secrets.</EmptyState>}
      {npcs.map((n) => (
        <NpcCard key={n.id} n={n} doc={doc} creatures={creatures} edit={edit} />
      ))}
      <NewId label="Add NPC" noun="NPC id" taken={Object.keys(doc.npcs)} onAdd={(id) => edit((d) => void (d.npcs[id] = { id, name: id.replace(/_/g, " "), template: creatures[0]?.ref ?? "" }))} />
    </div>
  );
}
