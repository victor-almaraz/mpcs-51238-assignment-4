"use client";
// Plot (app-flow.md, Adventure editor: Plot; design/components.md, Graphs and Rule inserts): one graph
// per arc with stages as nodes and `set_stage` effects as edges, and the triggers that act in the
// selected stage as rule cards: When, If, Then, Narrate, Only once, with a plain-English summary.
import { useMemo, useState } from "react";
import { parse, stringify } from "yaml";
import { plotGraph } from "@/lib/materials/plot";
import { freshId, ID, type Arc, type AuthoredLocation, type Doc, type Refs } from "./doc";

type Obj = Record<string, unknown>;
type Trigger = { id: string; on: Obj; when?: unknown; effects: Obj[]; narrate?: string; once?: boolean };

const small = "rounded-control border border-border bg-page px-1 font-ui text-caption";
const quiet = "font-ui text-caption text-accent";
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
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={small}>
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
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-16 font-ui text-label">WHEN</span>
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
          <input aria-label="verb" placeholder="verb" defaultValue={String(on.verb ?? "")} onBlur={(e) => set(e.target.value ? { ...on, verb: e.target.value } : { type: on.type, target: on.target })} className={`${small} w-20`} />
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
      {!kind && on.type !== undefined && <span className="font-mono text-code">{JSON.stringify(on)}</span>}
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

const COND_KINDS = ["stage", "flag", "has_item", "room", "defeated"] as const;

function Condition({ c, set, ix }: { c: Cond; set: (c: Cond) => void; ix: Index }) {
  const kind = COND_KINDS.find((k) => k in c) ?? "";
  const stage = Array.isArray(c.stage) ? (c.stage as string[]) : ["", ""];
  const arc = ix.arcs.find((a) => a.id === stage[0]);
  const op = ["eq", "gte", "lte"].find((o) => o in c) ?? "";
  return (
    <span className="flex flex-wrap items-center gap-1">
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
              className={`${small} w-16`}
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
      <div className="flex items-center gap-1">
        <span className="w-16 font-ui text-label">IF</span>
        <span className="font-mono text-code">{JSON.stringify(when)}</span>
        <span className="font-ui text-caption text-muted">(nested deeper than the builder shows; edit as YAML)</span>
      </div>
    );
  const put = (next: Group) => set(whenOf(next));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="w-16 font-ui text-label">IF</span>
        <Pick label="all of" value={g.mode} options={[{ value: "all", label: "all of" }, { value: "any", label: "any of" }, { value: "none", label: "none of" }]} onChange={(m) => put({ ...g, mode: (m || "all") as Group["mode"] })} />
        <button type="button" className={quiet} onClick={() => put({ ...g, items: [...g.items, { stage: ["", ""] }] })}>
          Add condition
        </button>
      </div>
      {g.items.map((c, i) => (
        <div key={i} className="ml-16 flex items-center gap-1">
          <Condition c={c} ix={ix} set={(n) => put({ ...g, items: g.items.map((x, j) => (j === i ? n : x)) })} />
          <button type="button" className="font-ui text-caption text-danger" onClick={() => put({ ...g, items: g.items.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
    </div>
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
    <span className="flex flex-wrap items-center gap-1">
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
            className={`${small} w-16`}
          />
        </>
      )}
      {name === "end_campaign" && <Pick label="ending" value={String(a.ending ?? "")} options={ix.endings} onChange={(v) => set({ end_campaign: { ending: v } })} />}
      {name === "open_door" && <Pick label="door" value={String(a.door ?? "")} options={ix.doors} onChange={(v) => set({ open_door: { door: v } })} />}
      {name === "reveal" && <Pick label="secret" value={String(a.secret ?? "")} options={ix.secrets} onChange={(v) => set({ reveal: { secret: v } })} />}
      {!known && <span className="font-mono text-code">{JSON.stringify(e)}</span>}
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

function RuleCard({ t, set, remove, doc, ix }: { t: Trigger; set: (t: Trigger) => void; remove: () => void; doc: Doc; ix: Index }) {
  const [yaml, setYaml] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-control border border-accent-line bg-raised p-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-code">{t.id}</span>
        <span className="flex gap-3">
          <button type="button" className={quiet} onClick={() => setYaml(!yaml)}>
            {yaml ? "Card" : "YAML"}
          </button>
          <button type="button" className="font-ui text-caption text-danger" onClick={remove}>
            Delete
          </button>
        </span>
      </div>
      {yaml ? (
        <>
          <textarea
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
            className="rounded-control border border-border bg-page px-2 py-1 font-mono text-code"
          />
          {error && <p className="font-ui text-caption text-danger">{error}</p>}
        </>
      ) : (
        <>
          <When on={t.on} ix={ix} set={(on) => set({ ...t, on })} />
          <If when={t.when} ix={ix} set={(w) => set(w === undefined ? (({ when, ...rest }) => (void when, rest))(t) : { ...t, when: w })} />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="w-16 font-ui text-label">THEN</span>
              <button type="button" className={quiet} onClick={() => set({ ...t, effects: [...t.effects, { set_flag: {} }] })}>
                Add effect
              </button>
            </div>
            {t.effects.map((e, i) => (
              <div key={i} className="ml-16 flex items-center gap-1">
                <span className="font-ui text-caption text-muted">{i + 1}.</span>
                <Effect e={e} ix={ix} set={(n) => set({ ...t, effects: t.effects.map((x, j) => (j === i ? n : x)) })} />
                <button type="button" aria-label="Move up" disabled={i === 0} className="font-ui text-caption disabled:text-muted" onClick={() => set({ ...t, effects: t.effects.map((x, j) => (j === i - 1 ? t.effects[i]! : j === i ? t.effects[i - 1]! : x)) })}>
                  ↑
                </button>
                <button type="button" aria-label="Move down" disabled={i === t.effects.length - 1} className="font-ui text-caption disabled:text-muted" onClick={() => set({ ...t, effects: t.effects.map((x, j) => (j === i + 1 ? t.effects[i]! : j === i ? t.effects[i + 1]! : x)) })}>
                  ↓
                </button>
                <button type="button" className="font-ui text-caption text-danger" onClick={() => set({ ...t, effects: t.effects.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="w-16 font-ui text-label">NARRATE</span>
            <input aria-label="Narrate" defaultValue={t.narrate ?? ""} onBlur={(e) => set(e.target.value ? { ...t, narrate: e.target.value } : (({ narrate, ...rest }) => (void narrate, rest))(t))} className={`${small} flex-1 font-prose italic`} />
          </div>
          <label className="flex items-center gap-2 font-ui text-caption">
            <input type="checkbox" checked={t.once === true} onChange={(e) => set({ ...t, once: e.target.checked })} /> Only once
          </label>
        </>
      )}
      <p className="font-prose text-prose-sm italic text-muted">{summary(t, doc)}</p>
    </div>
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
      className="rounded-control border border-rule bg-page"
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
          <g key={i}>
            <path d={`M${from.x},${from.y} C${from.x + 30},${from.y} ${to.x - 30},${to.y + NODE_H / 2} ${to.x},${to.y + NODE_H / 2}`} fill="none" stroke="var(--color-muted)" strokeDasharray={fi < 0 ? "3 3" : undefined} markerEnd={`url(#arrow-${arc.id})`} />
            <text x={(from.x + to.x) / 2} y={(from.y + to.y + NODE_H / 2) / 2 - 4} fontSize="9" fill="var(--color-muted)" textAnchor="middle">
              {e.source.replace(/^trigger [^.]+\./, "").replace(/^topic /, "")}
            </text>
          </g>
        );
      })}
      {arc.stages.map((s, i) => {
        const p = pos(s, i);
        const reachable = info?.reachable.includes(s) ?? true;
        return (
          <g
            key={s}
            transform={`translate(${p.x},${p.y})`}
            className="cursor-pointer"
            onMouseDown={(e) => {
              const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setDrag({ stage: s, dx: e.clientX - r.left - p.x, dy: e.clientY - r.top - p.y });
              select(s);
            }}
          >
            <rect width={NODE_W} height={NODE_H} rx={3} fill={s === selected ? "var(--color-accent-soft)" : "var(--color-raised)"} stroke={reachable ? (s === selected ? "var(--color-accent)" : "var(--color-border)") : "var(--color-warning)"} strokeDasharray={reachable ? undefined : "4 3"} strokeWidth={s === selected ? 1.6 : 1} />
            <text x={NODE_W / 2} y={NODE_H / 2 + 4} fontSize="12" textAnchor="middle" fill="var(--color-ink)">
              {s}
              {s === arc.initial ? " ●" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Plot section -------------------------------------------------------------------------------------

export function PlotSection({ doc, refs, edit }: { doc: Doc; refs: Refs; edit: (f: (d: Doc) => void) => void }) {
  const ix = useMemo(() => index(doc, refs), [doc, refs]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const g = useMemo(() => plotGraph(doc as unknown as Obj), [doc]);
  const unreachable = g.endings.filter((e) => !e.reachable);
  return (
    <div className="flex flex-col gap-8">
      {unreachable.length > 0 && <p className="font-ui text-caption text-warning">Unreachable endings: {unreachable.map((e) => doc.adventure.endings[e.id]?.label ?? e.id).join(", ")}.</p>}
      {Object.values(doc.arcs).map((arc) => {
        const stage = selected[arc.id] ?? arc.initial;
        const triggers = (arc.triggers as Trigger[]).map((t, i) => ({ t, i }));
        const acting = triggers.filter(({ t }) => {
          const g2 = groupOf(t.when);
          const req = (g2?.mode === "all" ? g2.items : []).find((c) => Array.isArray(c.stage) && c.stage[0] === arc.id) as { stage?: string[] } | undefined;
          return req ? req.stage![1] === stage : true;
        });
        const setTrigger = (i: number, t: Trigger) => edit((d) => void ((d.arcs[arc.id]!.triggers as Trigger[])[i] = t));
        return (
          <section key={arc.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="font-display text-heading">{arc.title || arc.id}</h2>
              <span className="font-mono text-code text-muted">{arc.id}</span>
              <input aria-label="Arc title" defaultValue={arc.title ?? ""} onBlur={(e) => edit((d) => void (d.arcs[arc.id]!.title = e.target.value))} className={small} placeholder="title" />
              <input aria-label="Stages" defaultValue={arc.stages.join(", ")} onBlur={(e) => edit((d) => void (d.arcs[arc.id]!.stages = e.target.value.split(/[,\s]+/).filter(Boolean)))} className={`${small} w-64 font-mono`} />
              <Pick label="initial" value={arc.initial} options={arc.stages} onChange={(v) => edit((d) => void (d.arcs[arc.id]!.initial = v))} />
              <button type="button" className="font-ui text-caption text-danger" onClick={() => edit((d) => void delete d.arcs[arc.id])}>
                Delete arc
              </button>
            </div>
            <div className="overflow-auto">
              <ArcGraph
                arc={arc}
                doc={doc}
                selected={stage}
                select={(s) => setSelected({ ...selected, [arc.id]: s })}
                move={(s, x, y) => edit((d) => void (d.editor.layout = { ...d.editor.layout, [arc.id]: { ...((d.editor.layout as Layout)[arc.id] ?? {}), [s]: { x, y } } }))}
              />
            </div>
            <p className="font-ui text-label">
              Triggers acting in <span className="font-mono">{stage}</span> or in any stage
            </p>
            {acting.map(({ t, i }) => (
              <RuleCard key={`${t.id}:${i}`} t={t} doc={doc} ix={ix} set={(n) => setTrigger(i, n)} remove={() => edit((d) => void (d.arcs[arc.id]!.triggers as Trigger[]).splice(i, 1))} />
            ))}
            <button
              type="button"
              className={`${quiet} self-start`}
              onClick={() =>
                edit((d) => {
                  const list = d.arcs[arc.id]!.triggers as Trigger[];
                  const taken = Object.values(d.arcs).flatMap((a) => (a.triggers as Trigger[]).map((x) => x.id));
                  list.push({ id: freshId("trigger", taken), on: { type: "moved" }, when: { stage: [arc.id, stage] }, effects: [], once: true });
                })
              }
            >
              Add trigger in this stage
            </button>
          </section>
        );
      })}
      <NewArc taken={Object.keys(doc.arcs)} onAdd={(id) => edit((d) => void (d.arcs[id] = { id, title: id.replace(/_/g, " "), stages: ["inactive", "active", "done"], initial: "inactive", triggers: [] }))} />
    </div>
  );
}

function NewArc({ taken, onAdd }: { taken: string[]; onAdd: (id: string) => void }) {
  const [id, setId] = useState("");
  const ok = ID.test(id) && !taken.includes(id);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) (onAdd(id), setId(""));
      }}
    >
      <input aria-label="New arc id" value={id} placeholder="new_arc" onChange={(e) => setId(e.target.value)} className={`${small} w-40 font-mono`} />
      <button type="submit" disabled={!ok} className={`${quiet} disabled:text-muted`}>
        Add arc
      </button>
    </form>
  );
}
