// The plot as a graph (app-flow.md, Adventure editor: Plot, one graph per arc with stages as nodes and
// `set_stage` effects as edges; Validation: ending reachability). A trigger or topic can act once
// every stage its condition requires is reachable; a stage is reachable from the arc's initial stage
// through `set_stage` effects of sources that can act; an ending is reachable when such a source ends
// the campaign with it. Flag, item, and position requirements are treated as satisfiable.

import type { DraftDiagnostic } from "./draft-io";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

export interface Source {
  /** Where it is defined: "trigger arc.id", "topic npc.topic", or "start". */
  label: string;
  pointer: string;
  when: unknown;
  effects: unknown[];
}

export interface Edge {
  arc: string;
  /** The stage the source requires of this arc, or null when it acts in any stage. */
  from: string | null;
  to: string;
  source: string;
}

export interface PlotGraph {
  arcs: { id: string; stages: string[]; initial: string; reachable: string[] }[];
  edges: Edge[];
  endings: { id: string; reachable: boolean; by: string[] }[];
}

/** Every trigger, topic, and the start effects, with the condition under which each can act. */
export function sources(draft: Obj): Source[] {
  const out: Source[] = [];
  const adventure = isObj(draft.adventure) ? draft.adventure : {};
  const start = isObj(adventure.start) ? adventure.start : {};
  out.push({ label: "start", pointer: "/adventure/start/effects", when: undefined, effects: Array.isArray(start.effects) ? start.effects : [] });
  for (const [arcId, arc] of Object.entries(isObj(draft.arcs) ? draft.arcs : {})) {
    const triggers = isObj(arc) && Array.isArray(arc.triggers) ? arc.triggers : [];
    triggers.forEach((t, i) => {
      if (isObj(t)) out.push({ label: `trigger ${arcId}.${String(t.id ?? i)}`, pointer: `/arcs/${arcId}/triggers/${i}`, when: t.when, effects: Array.isArray(t.effects) ? t.effects : [] });
    });
  }
  for (const [npcId, npc] of Object.entries(isObj(draft.npcs) ? draft.npcs : {})) {
    for (const [topicId, topic] of Object.entries(isObj(npc) && isObj(npc.topics) ? npc.topics : {})) {
      if (isObj(topic)) out.push({ label: `topic ${npcId}.${topicId}`, pointer: `/npcs/${npcId}/topics/${topicId}`, when: topic.when, effects: Array.isArray(topic.effects) ? topic.effects : [] });
    }
  }
  return out;
}

/** Each effect, including those inside `if` branches. */
function* walk(effects: unknown[]): Generator<[string, Obj]> {
  for (const e of effects) {
    if (!isObj(e)) continue;
    for (const [name, args] of Object.entries(e)) {
      if (!isObj(args)) continue;
      yield [name, args];
      if (name === "if") yield* walk([...(Array.isArray(args.then) ? args.then : []), ...(Array.isArray(args.else) ? args.else : [])]);
    }
  }
}

/** Whether a requirement can hold given the reachable stages; also the stages it requires, by arc. */
function possible(req: unknown, reach: Map<string, Set<string>>): boolean {
  if (!isObj(req)) return true;
  if (Array.isArray(req.all)) return req.all.every((r) => possible(r, reach));
  if (Array.isArray(req.any)) return req.any.some((r) => possible(r, reach));
  if ("not" in req) return true;
  if (Array.isArray(req.stage)) {
    const [arc, stage] = req.stage as [string, string];
    return reach.get(arc)?.has(stage) ?? false;
  }
  return true;
}

/** The stage a requirement demands of each arc, where it demands exactly one. */
function required(req: unknown, out = new Map<string, string>()): Map<string, string> {
  if (!isObj(req)) return out;
  if (Array.isArray(req.all)) for (const r of req.all) required(r, out);
  if (Array.isArray(req.stage)) out.set(String(req.stage[0]), String(req.stage[1]));
  return out;
}

export function plotGraph(draft: Obj): PlotGraph {
  const arcs = Object.entries(isObj(draft.arcs) ? draft.arcs : {}).map(([id, a]) => ({
    id,
    stages: isObj(a) && Array.isArray(a.stages) ? (a.stages as unknown[]).map(String) : [],
    initial: isObj(a) && typeof a.initial === "string" ? a.initial : "",
  }));
  const reach = new Map(arcs.map((a) => [a.id, new Set(a.initial ? [a.initial] : [])]));
  const list = sources(draft);
  const acted = new Set<number>();
  for (let changed = true; changed; ) {
    changed = false;
    list.forEach((s, i) => {
      if (!possible(s.when, reach)) return;
      acted.add(i);
      for (const [name, args] of walk(s.effects)) {
        if (name !== "set_stage") continue;
        const set = reach.get(String(args.arc));
        if (set && !set.has(String(args.stage))) {
          set.add(String(args.stage));
          changed = true;
        }
      }
    });
  }
  const edges: Edge[] = [];
  const endingsBy = new Map<string, string[]>();
  list.forEach((s, i) => {
    const req = required(s.when);
    for (const [name, args] of walk(s.effects)) {
      if (name === "set_stage") edges.push({ arc: String(args.arc), from: req.get(String(args.arc)) ?? null, to: String(args.stage), source: s.label });
      if (name === "end_campaign" && acted.has(i)) endingsBy.set(String(args.ending), [...(endingsBy.get(String(args.ending)) ?? []), s.label]);
    }
  });
  const declared = Object.keys(isObj(draft.adventure) && isObj(draft.adventure.endings) ? draft.adventure.endings : {});
  return {
    arcs: arcs.map((a) => ({ ...a, reachable: a.stages.filter((s) => reach.get(a.id)!.has(s)) })),
    edges,
    // The automatic ending `lost` needs no effect (adventure-packs.md, adventure.yaml).
    endings: declared.map((id) => ({ id, reachable: id === "lost" || endingsBy.has(id), by: endingsBy.get(id) ?? [] })),
  };
}

/** Warnings for endings and stages no possible sequence of triggers reaches. */
export function plotWarnings(draft: Obj): DraftDiagnostic[] {
  const g = plotGraph(draft);
  const out: DraftDiagnostic[] = [];
  for (const e of g.endings) {
    if (!e.reachable) out.push({ pointer: `/adventure/endings/${e.id}`, severity: "warning", code: "ending", message: `ending '${e.id}' cannot be reached: no trigger or topic that can act ends the campaign with it` });
  }
  for (const a of g.arcs) {
    a.stages.forEach((s, i) => {
      if (!a.reachable.includes(s)) out.push({ pointer: `/arcs/${a.id}/stages/${i}`, severity: "warning", code: "stage", message: `stage '${s}' of arc '${a.id}' cannot be reached from '${a.initial}'` });
    });
  }
  return out;
}
