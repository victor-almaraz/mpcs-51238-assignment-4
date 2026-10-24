"use client";
// Plot (app-flow.md, Adventure editor: Plot; design/components.md, Graphs and Rule inserts): the
// selected arc's graph with stages as nodes and `set_stage` effects as edges, and the triggers that act
// in the selected stage as rule cards: When, If, Then, Narrate, Only once, with a plain-English summary.
// Stages are chosen by clicking a node, by keyboard on a node, or from the stage list.
import { ArrowDown, ArrowUp, Braces, Plus, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { parse, stringify } from "yaml";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, TextInput } from "@/components/ui/field";
import { ICON_DENSE, IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { plotGraph } from "@/lib/materials/plot";
import { denseArea, denseInput, denseSelect, NewId, Panel, RemoveButton } from "./controls";
import { freshId, type Arc, type AuthoredLocation, type Doc, type Refs } from "./doc";
import { EditorField, fieldId, InlineProblems, segments, SeverityIcon, useProblems } from "./problems";
import type { Reveal } from "./sections";

type Obj = Record<string, unknown>;
type Trigger = { id: string; on: Obj; when?: unknown; effects: Obj[]; narrate?: string; once?: boolean };

const NODE_W = 120;
const NODE_H = 32;

// Reference index -------------------------------------------------------------------------------------

function index(doc: Doc, refs: Refs) {
  const entities: string[] = [];
  const rooms: { location: string; room: string }[] = [];
  const doors: string[] = [];
  for (const loc of Object.values(doc.locations)) {
    if (loc.kind !== "authored") continue;
    const m = (loc as AuthoredLocation).map;
    for (const r of Object.keys(m.rooms)) rooms.push({ location: loc.id, room: r });
    for (const c of m.contents ?? []) {
      if (c.id) entities.push(c.id);
      if (c.id && c.ref && refs.templates.find((t) => t.ref === c.ref)?.kind === "door") doors.push(c.id);
    }
  }
  return {
    npcs: Object.values(doc.npcs),
    entities: [...entities, ...Object.keys(doc.npcs)],
    doors,
    items: [...refs.templates.filter((t) => t.kind === "item").map((t) => t.ref), ...Object.keys(doc.entities).map((id) => `${doc.adventure.id}:${id}`)],
    rooms,
    flags: Object.keys(doc.flags),
    arcs: Object.values(doc.arcs),
    endings: Object.keys(doc.adventure.endings),
    secrets: Object.values(doc.npcs).flatMap((n) => Object.keys(n.secrets ?? {}).map((s) => `${n.id}.${s}`)),
  };
}
type Index = ReturnType<typeof index>;

function Pick({ value, options, onChange, label }: { value: string; options: (string | { value: string; label: string })[]; onChange: (v: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cx(denseSelect, "max-w-full")}>
      <option value="">{label}</option>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        return (
          <option key={v} value={v}>
            {typeof o === "string" ? o : o.label}
          </option>
        );
      })}
    </select>
  );
}

/** A row of a rule card: its word (When, If, Then, Narrate) and its controls. */
function Row({ word, children }: { word: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 @lg:grid-cols-[5.5rem_minmax(0,1fr)] @lg:gap-3">
      <span className="pt-1.5 text-caption font-semibold uppercase tracking-wide text-muted">{word}</span>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </div>
  );
}

const line = "flex flex-wrap items-center gap-1.5 text-label";

// When ---------------------------------------------------------------------------------------------

const WHEN_KINDS = [
  { type: "talked", label: "a player talks to" },
  { type: "interacted", label: "a player interacts with" },
  { type: "item_taken", label: "a player picks up" },
  { type: "moved", label: "a player enters" },
  { type: "died", label: "a player defeats" },
];

function When({ on, set, ix }: { on: Obj; set: (on: Obj) => void; ix: Index }) {
  const kind = WHEN_KINDS.find((k) => k.type === on.type);
  const npc = ix.npcs.find((n) => n.id === on.npc);
  return (
    <div className={line}>
      <Pick label="event" value={kind ? String(on.type) : ""} options={WHEN_KINDS.map((k) => ({ value: k.type, label: k.label }))} onChange={(t) => set({ type: t })} />
      {on.type === "talked" && (
        <>
          <Pick label="NPC" value={String(on.npc ?? "")} options={ix.npcs.map((n) => ({ value: n.id, label: n.name }))} onChange={(v) => set({ ...on, npc: v })} />
          about
          <Pick label="any topic" value={String(on.topic ?? "")} options={Object.entries(npc?.topics ?? {}).map(([id, t]) => ({ value: id, label: t.label }))} onChange={(v) => set(v ? { ...on, topic: v } : { type: on.type, npc: on.npc })} />
        </>
      )}
      {on.type === "interacted" && (
        <>
          <Pick label="thing" value={String(on.target ?? "")} options={ix.entities} onChange={(v) => set({ ...on, target: v })} />
          <input aria-label="verb" placeholder="verb" defaultValue={String(on.verb ?? "")} onBlur={(e) => set(e.target.value ? { ...on, verb: e.target.value } : { type: on.type, target: on.target })} className={cx(denseInput, "w-24")} />
        </>
      )}
      {on.type === "item_taken" && <Pick label="item" value={String(on.ref ?? "")} options={ix.items} onChange={(v) => set({ ...on, ref: v })} />}
      {on.type === "moved" && (
        <Pick
          label="room"
          value={on.location && on.to ? `${String(on.location)}.${String(on.to)}` : ""}
          options={ix.rooms.map((r) => ({ value: `${r.location}.${r.room}`, label: `${r.location} · ${r.room}` }))}
          onChange={(v) => {
            const [location, to] = v.split(".");
            set({ type: "moved", location, to });
          }}
        />
      )}
      {on.type === "died" && <Pick label="creature" value={String(on.target ?? "")} options={ix.entities} onChange={(v) => set({ ...on, target: v })} />}
      {!kind && on.type !== undefined && <code className="font-mono text-code">{JSON.stringify(on)}</code>}
    </div>
  );
}

// If -----------------------------------------------------------------------------------------------

type Cond = Obj;
type Group = { mode: "all" | "any" | "none"; items: Cond[] };

/** A condition as a group the builder shows, or null when it needs YAML (deeper than two levels). */
function groupOf(when: unknown): Group | null {
  if (when === undefined) return { mode: "all", items: [] };
  const flat = (xs: unknown[]) => xs.every((x) => x !== null && typeof x === "object" && !("all" in (x as Obj)) && !("any" in (x as Obj)) && !("not" in (x as Obj)));
  const w = when as Obj;
  if (Array.isArray(w.all) && flat(w.all)) return { mode: "all", items: w.all as Cond[] };
  if (Array.isArray(w.any) && flat(w.any)) return { mode: "any", items: w.any as Cond[] };
  if (w.not && typeof w.not === "object" && Array.isArray((w.not as Obj).any) && flat((w.not as Obj).any as unknown[])) return { mode: "none", items: (w.not as Obj).any as Cond[] };
  if (flat([w])) return { mode: "all", items: [w] };
  return null;
}

function whenOf(g: Group): unknown {
  if (g.items.length === 0) return undefined;
  if (g.mode === "all") return g.items.length === 1 ? g.items[0] : { all: g.items };
  if (g.mode === "any") return { any: g.items };
  return { not: { any: g.items } };
}

/** The stage of `arc` a trigger requires, or null when it acts in any stage. */
function stageOf(t: Trigger, arc: string): string | null {
  const g = groupOf(t.when);
  const req = (g?.mode === "all" ? g.items : []).find((c) => Array.isArray(c.stage) && c.stage[0] === arc) as { stage?: string[] } | undefined;
  return req ? (req.stage![1] ?? null) : null;
}

const COND_KINDS = ["stage", "flag", "has_item", "room", "defeated"] as const;

function Condition({ c, set, ix }: { c: Cond; set: (c: Cond) => void; ix: Index }) {
  const kind = COND_KINDS.find((k) => k in c) ?? "";
  const stage = Array.isArray(c.stage) ? (c.stage as string[]) : ["", ""];
  const arc = ix.arcs.find((a) => a.id === stage[0]);
  const op = ["eq", "gte", "lte"].find((o) => o in c) ?? "";
  return (
    <span className={line}>
      <Pick label="condition" value={kind} options={["stage", "flag", "has_item", "room", "defeated"].map((k) => ({ value: k, label: { stage: "arc is at", flag: "flag", has_item: "has item", room: "is in room", defeated: "defeated" }[k]! }))} onChange={(k) => set(k === "stage" ? { stage: ["", ""] } : k === "flag" ? { flag: "" } : { [k]: "" })} />
      {kind === "stage" && (
        <>
          <Pick label="arc" value={stage[0]!} options={ix.arcs.map((a) => a.id)} onChange={(v) => set({ stage: [v, ""] })} />
          <Pick label="stage" value={stage[1]!} options={arc?.stages ?? []} onChange={(v) => set({ stage: [stage[0], v] })} />
        </>
      )}
      {kind === "flag" && (
        <>
          <Pick label="flag" value={String(c.flag ?? "")} options={ix.flags} onChange={(v) => set({ ...c, flag: v })} />
          <Pick label="is set" value={op} options={[{ value: "eq", label: "=" }, { value: "gte", label: "≥" }, { value: "lte", label: "≤" }]} onChange={(o) => set(o ? { flag: c.flag, [o]: c.eq ?? c.gte ?? c.lte ?? 0 } : { flag: c.flag })} />
          {op && (
            <input
              aria-label="value"
              defaultValue={String(c[op])}
              onBlur={(e) => {
                const v = e.target.value;
                set({ flag: c.flag, [op]: v === "true" ? true : v === "false" ? false : Number.isNaN(Number(v)) ? v : Number(v) });
              }}
              className={cx(denseInput, "w-20")}
            />
          )}
        </>
      )}
      {kind === "has_item" && <Pick label="item" value={String(c.has_item ?? "")} options={ix.items} onChange={(v) => set({ has_item: v })} />}
      {kind === "room" && <Pick label="room" value={String(c.room ?? "")} options={ix.rooms.map((r) => ({ value: `${r.location}.${r.room}`, label: `${r.location} · ${r.room}` }))} onChange={(v) => set({ room: v })} />}
      {kind === "defeated" && <Pick label="creature" value={String(c.defeated ?? "")} options={ix.entities} onChange={(v) => set({ defeated: v })} />}
    </span>
  );
}

function If({ when, set, ix }: { when: unknown; set: (w: unknown) => void; ix: Index }) {
  const g = groupOf(when);
  if (!g)
    return (
      <Row word="If">
        <code className="font-mono text-code">{JSON.stringify(when)}</code>
        <p className="text-caption text-muted">Nested deeper than the builder shows; edit this trigger as YAML.</p>
      </Row>
    );
  const put = (next: Group) => set(whenOf(next));
  return (
    <Row word="If">
      <div className={line}>
        <Pick label="all of" value={g.mode} options={[{ value: "all", label: "all of" }, { value: "any", label: "any of" }, { value: "none", label: "none of" }]} onChange={(m) => put({ ...g, mode: (m || "all") as Group["mode"] })} />
        <Button variant="quiet" size="sm" icon={<Plus {...ICON_DENSE} />} onClick={() => put({ ...g, items: [...g.items, { stage: ["", ""] }] })}>
          Add condition
        </Button>
      </div>
      {g.items.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-l-2 border-rule pl-3">
          {g.items.map((c, i) => (
            <li key={i} className="flex items-center gap-1">
              <Condition c={c} ix={ix} set={(n) => put({ ...g, items: g.items.map((x, j) => (j === i ? n : x)) })} />
              <IconButton dense label="Remove condition" icon={<X {...ICON_DENSE} />} onClick={() => put({ ...g, items: g.items.filter((_, j) => j !== i) })} />
            </li>
          ))}
        </ul>
      )}
    </Row>
  );
}

// Then ---------------------------------------------------------------------------------------------

const EFFECT_KINDS = ["set_stage", "set_flag", "add_flag", "end_campaign", "open_door", "reveal", "start_combat"] as const;

function Effect({ e, set, ix }: { e: Obj; set: (e: Obj) => void; ix: Index }) {
  const [name] = Object.keys(e);
  const a = (e[name!] ?? {}) as Obj;
  const arc = ix.arcs.find((x) => x.id === a.arc);
  const known = EFFECT_KINDS.includes(name as (typeof EFFECT_KINDS)[number]);
  return (
    <span className={line}>
      <Pick label="effect" value={known ? name! : ""} options={EFFECT_KINDS.map((k) => ({ value: k, label: k.replace(/_/g, " ") }))} onChange={(k) => set({ [k]: {} })} />
      {name === "set_stage" && (
        <>
          <Pick label="arc" value={String(a.arc ?? "")} options={ix.arcs.map((x) => x.id)} onChange={(v) => set({ set_stage: { arc: v, stage: "" } })} />
          to
          <Pick label="stage" value={String(a.stage ?? "")} options={arc?.stages ?? []} onChange={(v) => set({ set_stage: { ...a, stage: v } })} />
        </>
      )}
      {(name === "set_flag" || name === "add_flag") && (
        <>
          <Pick label="flag" value={String(a.flag ?? "")} options={ix.flags} onChange={(v) => set({ [name]: { ...a, flag: v } })} />
          {name === "set_flag" ? "to" : "by"}
          <input
            aria-label="value"
            defaultValue={a.value === undefined ? "" : String(a.value)}
            onBlur={(ev) => {
              const v = ev.target.value;
              set({ [name]: { ...a, value: v === "true" ? true : v === "false" ? false : Number.isNaN(Number(v)) ? v : Number(v) } });
            }}
            className={cx(denseInput, "w-20")}
          />
        </>
      )}
      {name === "end_campaign" && <Pick label="ending" value={String(a.ending ?? "")} options={ix.endings} onChange={(v) => set({ end_campaign: { ending: v } })} />}
      {name === "open_door" && <Pick label="door" value={String(a.door ?? "")} options={ix.doors} onChange={(v) => set({ open_door: { door: v } })} />}
      {name === "reveal" && <Pick label="secret" value={String(a.secret ?? "")} options={ix.secrets} onChange={(v) => set({ reveal: { secret: v } })} />}
      {!known && <code className="font-mono text-code">{JSON.stringify(e)}</code>}
    </span>
  );
}

// Summary ------------------------------------------------------------------------------------------

function summary(t: Trigger, doc: Doc): string {
  const label = (id: unknown) => doc.npcs[String(id)]?.name ?? String(id ?? "?");
  const on = t.on;
  const when =
    on.type === "talked"
      ? `a player talks to ${label(on.npc)}${on.topic ? ` about ${doc.npcs[String(on.npc)]?.topics?.[String(on.topic)]?.label ?? String(on.topic)}` : ""}`
      : on.type === "interacted"
        ? `a player ${on.verb ? `${String(on.verb)}s` : "uses"} ${String(on.target ?? "something")}`
        : on.type === "item_taken"
          ? `a player picks up ${String(on.ref ?? "something")}`
          : on.type === "moved"
            ? `a player enters ${String(on.to ?? "a room")}`
            : on.type === "died"
              ? `${String(on.target ?? "a creature")} is defeated`
              : `${String(on.type ?? "an event")} happens`;
  const effects = t.effects
    .map((e) => {
      const [n] = Object.keys(e);
      const a = (e[n!] ?? {}) as Obj;
      if (n === "set_stage") return `${String(a.arc)} moves to ${String(a.stage)}`;
      if (n === "set_flag") return `${String(a.flag)} becomes ${String(a.value)}`;
      if (n === "add_flag") return `${String(a.flag)} changes by ${String(a.value)}`;
      if (n === "end_campaign") return `the adventure ends: ${doc.adventure.endings[String(a.ending)]?.label ?? String(a.ending)}`;
      if (n === "open_door") return `${String(a.door)} opens`;
      if (n === "reveal") return `the secret ${String(a.secret)} comes out`;
      if (n === "start_combat") return "combat starts";
      return n;
    })
    .join(", then ");
  return `When ${when}${t.when !== undefined ? ", if its conditions hold" : ""}: ${effects || "nothing happens"}.${t.once ? " Only once." : ""}`;
}

function RuleCard({ t, pointer, set, remove, doc, ix }: { t: Trigger; pointer: string; set: (t: Trigger) => void; remove: () => void; doc: Doc; ix: Index }) {
  const [yaml, setYaml] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems = useProblems().under(pointer);
  const id = fieldId(pointer);
  return (
    <Panel pointer={pointer} aria-labelledby={`${id}-title`} className={cx("flex flex-col gap-3", problems.some((p) => p.severity === "error") ? "border-danger" : "border-accent-line")}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={`${id}-title`} className="font-mono text-code font-semibold">
          {t.id}
        </h4>
        {t.once && <Badge dot={false}>Only once</Badge>}
        <span className="ml-auto flex items-center gap-1">
          <Button variant="quiet" size="sm" aria-pressed={yaml} icon={<Braces {...ICON_DENSE} />} onClick={() => setYaml(!yaml)}>
            {yaml ? "Edit as card" : "Edit as YAML"}
          </Button>
          <RemoveButton label={`Delete trigger ${t.id}`} onClick={remove} />
        </span>
      </div>
      <p className="font-prose text-prose-sm italic text-muted">{summary(t, doc)}</p>
      <InlineProblems id={`${id}-problems`} problems={problems} />
      {yaml ? (
        <>
          <label htmlFor={`${id}-yaml`} className="sr-only">
            {t.id} as YAML
          </label>
          <textarea
            id={`${id}-yaml`}
            defaultValue={stringify(t, { version: "1.2" })}
            rows={10}
            spellCheck={false}
            onBlur={(e) => {
              try {
                set(parse(e.target.value, { version: "1.2" }) as Trigger);
                setError(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            className={cx(denseArea, "font-mono text-code")}
          />
          {error && (
            <p role="alert" className="text-caption text-danger">
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Row word="When">
            <When on={t.on} ix={ix} set={(on) => set({ ...t, on })} />
          </Row>
          <If when={t.when} ix={ix} set={(w) => set(w === undefined ? (({ when, ...rest }) => (void when, rest))(t) : { ...t, when: w })} />
          <Row word="Then">
            {t.effects.length > 0 && (
              <ol className="flex flex-col gap-1.5">
                {t.effects.map((e, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="w-5 shrink-0 text-caption text-muted tabular">{i + 1}.</span>
                    <Effect e={e} ix={ix} set={(n) => set({ ...t, effects: t.effects.map((x, j) => (j === i ? n : x)) })} />
                    <span className="ml-auto flex shrink-0 items-center">
                      <IconButton dense label="Move up" icon={<ArrowUp {...ICON_DENSE} />} disabled={i === 0} className="disabled:opacity-40" onClick={() => set({ ...t, effects: t.effects.map((x, j) => (j === i - 1 ? t.effects[i]! : j === i ? t.effects[i - 1]! : x)) })} />
                      <IconButton dense label="Move down" icon={<ArrowDown {...ICON_DENSE} />} disabled={i === t.effects.length - 1} className="disabled:opacity-40" onClick={() => set({ ...t, effects: t.effects.map((x, j) => (j === i + 1 ? t.effects[i]! : j === i ? t.effects[i + 1]! : x)) })} />
                      <IconButton dense label="Remove effect" icon={<X {...ICON_DENSE} />} onClick={() => set({ ...t, effects: t.effects.filter((_, j) => j !== i) })} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <div>
              <Button variant="quiet" size="sm" icon={<Plus {...ICON_DENSE} />} onClick={() => set({ ...t, effects: [...t.effects, { set_flag: {} }] })}>
                Add effect
              </Button>
            </div>
          </Row>
          <Row word="Narrate">
            <input aria-label="Narrate" defaultValue={t.narrate ?? ""} placeholder="Optional line for the narrator" onBlur={(e) => set(e.target.value ? { ...t, narrate: e.target.value } : (({ narrate, ...rest }) => (void narrate, rest))(t))} className={cx(denseInput, "w-full font-prose italic")} />
          </Row>
          <label className="flex items-center gap-2 text-label @lg:pl-[6.25rem]">
            <input type="checkbox" checked={t.once === true} onChange={(e) => set({ ...t, once: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />
            Only once
          </label>
        </div>
      )}
    </Panel>
  );
}

// Graph --------------------------------------------------------------------------------------------

type Layout = Record<string, Record<string, { x: number; y: number }>>;

function ArcGraph({ arc, doc, selected, select, move }: { arc: Arc; doc: Doc; selected: string | null; select: (s: string) => void; move: (stage: string, x: number, y: number) => void }) {
  const g = useMemo(() => plotGraph(doc as unknown as Obj), [doc]);
  const info = g.arcs.find((a) => a.id === arc.id);
  const layout = ((doc.editor.layout as Layout)[arc.id] ?? {}) as Record<string, { x: number; y: number }>;
  const pos = (s: string, i: number) => layout[s] ?? { x: 20 + i * (NODE_W + 40), y: 40 + (i % 2) * 50 };
  const [drag, setDrag] = useState<{ stage: string; dx: number; dy: number } | null>(null);
  const edges = g.edges.filter((e) => e.arc === arc.id);
  const width = Math.max(...arc.stages.map((s, i) => pos(s, i).x + NODE_W + 20), 300);
  const height = Math.max(...arc.stages.map((s, i) => pos(s, i).y + NODE_H + 30), 140);
  return (
    <svg
      width={width}
      height={height}
      role="group"
      aria-label={`Stages of ${arc.title || arc.id}`}
      className="block"
      onMouseMove={(e) => {
        if (!drag) return;
        const r = e.currentTarget.getBoundingClientRect();
        move(drag.stage, Math.max(0, Math.round(e.clientX - r.left - drag.dx)), Math.max(0, Math.round(e.clientY - r.top - drag.dy)));
      }}
      onMouseUp={() => setDrag(null)}
      onMouseLeave={() => setDrag(null)}
    >
      <defs>
        <marker id={`arrow-${arc.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-muted)" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const ti = arc.stages.indexOf(e.to);
        if (ti < 0) return null;
        const to = pos(e.to, ti);
        const fi = e.from ? arc.stages.indexOf(e.from) : -1;
        const from = fi >= 0 ? { x: pos(e.from!, fi).x + NODE_W, y: pos(e.from!, fi).y + NODE_H / 2 } : { x: to.x - 30, y: to.y - 20 };
        return (
          <g key={i} aria-hidden="true">
            <path d={`M${from.x},${from.y} C${from.x + 30},${from.y} ${to.x - 30},${to.y + NODE_H / 2} ${to.x},${to.y + NODE_H / 2}`} fill="none" stroke="var(--color-muted)" strokeDasharray={fi < 0 ? "3 3" : undefined} markerEnd={`url(#arrow-${arc.id})`} />
            <text x={(from.x + to.x) / 2} y={(from.y + to.y + NODE_H / 2) / 2 - 4} fontSize="10" fill="var(--color-muted)" textAnchor="middle">
              {e.source.replace(/^trigger [^.]+\./, "").replace(/^topic /, "")}
            </text>
          </g>
        );
      })}
      {arc.stages.map((s, i) => {
        const p = pos(s, i);
        const reachable = info?.reachable.includes(s) ?? true;
        const on = s === selected;
        return (
          <g
            key={s}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`Stage ${s}${s === arc.initial ? ", initial" : ""}${reachable ? "" : ", unreachable"}`}
            transform={`translate(${p.x},${p.y})`}
            className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--color-accent)] [&:focus-visible>rect]:[stroke-width:3]"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select(s);
              }
            }}
            onMouseDown={(e) => {
              const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setDrag({ stage: s, dx: e.clientX - r.left - p.x, dy: e.clientY - r.top - p.y });
              select(s);
            }}
          >
            <rect width={NODE_W} height={NODE_H} rx={4} fill={on ? "var(--color-accent-soft)" : "var(--color-raised)"} stroke={reachable ? (on ? "var(--color-accent)" : "var(--color-border)") : "var(--color-warning)"} strokeDasharray={reachable ? undefined : "4 3"} strokeWidth={on ? 1.75 : 1} />
            <text x={NODE_W / 2} y={NODE_H / 2 + 4} fontSize="12" textAnchor="middle" fill={on ? "var(--color-accent)" : "var(--color-ink)"} fontWeight={on ? 600 : 400}>
              {s}
              {s === arc.initial ? " ●" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Arc ----------------------------------------------------------------------------------------------

function ArcEditor({ arc, doc, ix, edit, stage, setStage }: { arc: Arc; doc: Doc; ix: Index; edit: (f: (d: Doc) => void) => void; stage: string; setStage: (s: string) => void }) {
  const { under, rest } = useProblems();
  const base = `/arcs/${arc.id}`;
  const triggers = (arc.triggers as Trigger[]).map((t, i) => ({ t, i }));
  const acting = triggers.filter(({ t }) => {
    const req = stageOf(t, arc.id);
    return req ? req === stage : true;
  });
  // Triggers of other stages that have problems, so they can be found without switching stages blindly.
  const elsewhere = triggers.filter(({ t, i }) => !acting.some((a) => a.i === i) && under(`${base}/triggers/${i}`).length > 0).map(({ t, i }) => ({ t, i, stage: stageOf(t, arc.id)! }));
  const setTrigger = (i: number, t: Trigger) => edit((d) => void ((d.arcs[arc.id]!.triggers as Trigger[])[i] = t));
  const top = rest(base, ["title", "stages", "initial", "triggers"].map((k) => `${base}/${k}`));
  const stageSelect = fieldId(`${base}/stage-select`);
  return (
    <div className="flex flex-col gap-5">
      <Panel pointer={base} aria-labelledby={`${fieldId(base)}-title`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id={`${fieldId(base)}-title`} className="text-section font-semibold">
            {arc.title || arc.id}
          </h3>
          <span className="font-mono text-caption text-muted">{arc.id}</span>
          <Button variant="danger" size="sm" className="ml-auto" onClick={() => edit((d) => void delete d.arcs[arc.id])}>
            Delete arc
          </Button>
        </div>
        <InlineProblems problems={top} />
        <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)]">
          <EditorField pointer={`${base}/title`} label="Title">
            {(p) => <TextInput {...p} defaultValue={arc.title ?? ""} placeholder="title" onBlur={(e) => edit((d) => void (d.arcs[arc.id]!.title = e.target.value))} />}
          </EditorField>
          <EditorField pointer={`${base}/stages`} label="Stages" hint="In order, separated by commas. Applied when you leave the field.">
            {(p) => <TextInput {...p} defaultValue={arc.stages.join(", ")} spellCheck={false} onBlur={(e) => edit((d) => void (d.arcs[arc.id]!.stages = e.target.value.split(/[,\s]+/).filter(Boolean)))} className="font-mono text-code" />}
          </EditorField>
          <EditorField pointer={`${base}/initial`} label="Initial stage">
            {(p) => (
              <Select {...p} value={arc.initial} onChange={(e) => edit((d) => void (d.arcs[arc.id]!.initial = e.target.value))}>
                <option value="">Choose</option>
                {arc.stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            )}
          </EditorField>
        </div>
        <div className="flex flex-col gap-2">
          <div className="overflow-auto rounded-card border border-rule bg-desk/60">
            <ArcGraph
              arc={arc}
              doc={doc}
              selected={stage}
              select={setStage}
              move={(s, x, y) => edit((d) => void (d.editor.layout = { ...d.editor.layout, [arc.id]: { ...((d.editor.layout as Layout)[arc.id] ?? {}), [s]: { x, y } } }))}
            />
          </div>
          <p className="text-caption text-muted">Click or press Enter on a stage to show its triggers; drag a stage to move it. ● marks the initial stage; a dashed outline marks a stage nothing reaches.</p>
        </div>
      </Panel>

      <section aria-labelledby={`${stageSelect}-label`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${stageSelect}-label`} className="text-heading font-semibold">
            Triggers in
          </h3>
          <select id={stageSelect} aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className={cx(denseSelect, "font-mono")}>
            {arc.stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="text-caption text-muted">and in any stage · {acting.length}</span>
        </div>
        {elsewhere.length > 0 && (
          <ul className="flex flex-col gap-1">
            {elsewhere.map(({ t, i, stage: s }) => {
              const first = under(`${base}/triggers/${i}`)[0]!;
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 text-caption">
                  <SeverityIcon problem={first} />
                  <span>
                    <span className="font-mono">{t.id}</span> in <span className="font-mono">{s}</span>: {first.message}
                  </span>
                  <Button variant="quiet" size="sm" onClick={() => setStage(s)}>
                    Show {s}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {acting.length === 0 && <p className="text-caption text-muted">No triggers act in this stage.</p>}
        {acting.map(({ t, i }) => (
          <RuleCard key={`${t.id}:${i}`} t={t} pointer={`${base}/triggers/${i}`} doc={doc} ix={ix} set={(n) => setTrigger(i, n)} remove={() => edit((d) => void (d.arcs[arc.id]!.triggers as Trigger[]).splice(i, 1))} />
        ))}
        <div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus {...ICON_DENSE} />}
            onClick={() =>
              edit((d) => {
                const list = d.arcs[arc.id]!.triggers as Trigger[];
                const taken = Object.values(d.arcs).flatMap((a) => (a.triggers as Trigger[]).map((x) => x.id));
                list.push({ id: freshId("trigger", taken), on: { type: "moved" }, when: { stage: [arc.id, stage] }, effects: [], once: true });
              })
            }
          >
            Add trigger in this stage
          </Button>
        </div>
      </section>
    </div>
  );
}

// Plot section -------------------------------------------------------------------------------------

export function PlotSection({ doc, refs, edit, current, select, reveal }: { doc: Doc; refs: Refs; edit: (f: (d: Doc) => void) => void; current: string | null; select: (arc: string) => void; reveal?: Reveal }) {
  const ix = useMemo(() => index(doc, refs), [doc, refs]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const g = useMemo(() => plotGraph(doc as unknown as Obj), [doc]);
  const unreachable = g.endings.filter((e) => !e.reachable);
  const { rest } = useProblems();
  const top = rest("/arcs", Object.keys(doc.arcs).map((id) => `/arcs/${id}`));

  // A problem with a trigger shows the stage it acts in.
  const [revealed, setRevealed] = useState<number | null>(null);
  if (reveal && reveal.n !== revealed) {
    setRevealed(reveal.n);
    const [topKey, a, kind, i] = segments(reveal.pointer);
    const t = topKey === "arcs" && a && kind === "triggers" && i !== undefined ? (doc.arcs[a]?.triggers as Trigger[] | undefined)?.[Number(i)] : undefined;
    const s = t && a ? stageOf(t, a) : null;
    if (s && a) setSelected({ ...selected, [a]: s });
  }

  const arc = current ? doc.arcs[current] : undefined;
  const add = <NewId label="Add arc" noun="arc id" taken={Object.keys(doc.arcs)} onAdd={(id) => (edit((d) => void (d.arcs[id] = { id, title: id.replace(/_/g, " "), stages: ["inactive", "active", "done"], initial: "inactive", triggers: [] })), select(id))} />;
  return (
    <div className="flex flex-col gap-5">
      <InlineProblems problems={top} />
      {unreachable.length > 0 && (
        <Notice tone="warning" title="Unreachable endings">
          {unreachable.map((e) => doc.adventure.endings[e.id]?.label ?? e.id).join(", ")}. No trigger ends the adventure this way.
        </Notice>
      )}
      {arc ? <ArcEditor key={arc.id} arc={arc} doc={doc} ix={ix} edit={edit} stage={selected[arc.id] ?? arc.initial} setStage={(s) => setSelected({ ...selected, [arc.id]: s })} /> : <EmptyState action={add}>No plot arcs yet. An arc is a line of stages that triggers move along.</EmptyState>}
      {arc && <div className="border-t border-rule pt-4">{add}</div>}
    </div>
  );
}
