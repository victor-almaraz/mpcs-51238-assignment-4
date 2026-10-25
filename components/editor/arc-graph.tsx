"use client";
// An arc's graph in React Flow (app-flow.md, Adventure editor: Plot; design/components.md, Graphs):
// stages as nodes and `set_stage` effects as transitions, left to right, drawn on the page with no grid
// or minimap. A transition carries an accent dot whose hover shows its rule sentences; a transition
// from any stage starts at a small open circle. Dragging a stage stores its position in the draft's
// `editor.layout` when the drag ends. The stage list beside the graph edits the same selection.
import { applyNodeChanges, BaseEdge, EdgeLabelRenderer, getBezierPath, Handle, MarkerType, Position, ReactFlow, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import { cx } from "@/components/ui/cx";
import { useDark } from "./dark";

export const NODE_W = 132;
export const NODE_H = 36;

type Position2 = { x: number; y: number };
type StageData = { stage: string; initial: boolean; reachable: boolean; selected: boolean; select: (s: string) => void };
type StageNode = Node<StageData, "stage">;
type EntryNode = Node<Record<string, never>, "entry">;
type RuleEdge = Edge<{ rules: string[] }, "rule">;

function Stage({ data }: NodeProps<StageNode>) {
  return (
    <button
      type="button"
      aria-pressed={data.selected}
      aria-label={`Stage ${data.stage}${data.initial ? ", initial" : ""}${data.reachable ? "" : ", unreachable"}`}
      onClick={() => data.select(data.stage)}
      style={{ width: NODE_W, height: NODE_H }}
      className={cx(
        "flex items-center justify-center gap-1 rounded-[2px] px-2 font-ui text-label outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        data.selected ? "border-[1.4px] border-accent bg-accent-soft font-semibold text-accent" : data.reachable ? "border-[0.7px] border-ink bg-page text-ink" : "border border-dashed border-warning bg-page italic text-muted",
      )}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <span className="truncate">{data.stage}</span>
      {data.initial && <span aria-hidden="true">●</span>}
      <Handle type="source" position={Position.Right} isConnectable={false} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
    </button>
  );
}

function Entry() {
  return (
    <span aria-hidden="true" className="block size-2.5 rounded-full border border-muted bg-page">
      <Handle type="source" position={Position.Right} isConnectable={false} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
    </span>
  );
}

function Rule({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, source }: EdgeProps<RuleEdge>) {
  const [path, x, y] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const fromAny = source.startsWith("entry:");
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: "var(--color-ink)", strokeWidth: 0.7, strokeDasharray: fromAny ? "3 3" : undefined }} />
      <EdgeLabelRenderer>
        <span
          aria-hidden="true"
          title={data?.rules.join("\n")}
          style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
          className="nodrag nopan pointer-events-auto absolute size-2 cursor-help rounded-full bg-accent"
        />
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { stage: Stage, entry: Entry };
const edgeTypes = { rule: Rule };

export interface ArcGraphProps {
  label: string;
  stages: string[];
  initial: string;
  reachable: string[];
  /** Transitions: `from` null for a transition from any stage; `rule` is the sentence shown on hover. */
  transitions: { from: string | null; to: string; rule: string }[];
  layout: Record<string, Position2>;
  selected: string | null;
  select: (stage: string) => void;
  move: (stage: string, x: number, y: number) => void;
}

const defaultPos = (i: number): Position2 => ({ x: 40 + i * (NODE_W + 48), y: 30 + (i % 2) * 56 });

export default function ArcGraph({ label, stages, initial, reachable, transitions, layout, selected, select, move }: ArcGraphProps) {
  const dark = useDark();
  const pos = useMemo(() => new Map(stages.map((s, i) => [s, layout[s] ?? defaultPos(i)])), [stages, layout]);

  const built = useMemo(() => {
    const nodes: (StageNode | EntryNode)[] = stages.map((s) => ({
      id: s,
      type: "stage",
      position: pos.get(s)!,
      data: { stage: s, initial: s === initial, reachable: reachable.includes(s), selected: s === selected, select },
      width: NODE_W,
      height: NODE_H,
    }));
    // Parallel transitions between the same stages share one edge and list every rule.
    const merged = new Map<string, { from: string | null; to: string; rules: string[] }>();
    for (const t of transitions) {
      if (!pos.has(t.to) || (t.from !== null && !pos.has(t.from))) continue;
      const key = `${t.from ?? "*"}>${t.to}`;
      const m = merged.get(key) ?? { from: t.from, to: t.to, rules: [] };
      m.rules.push(t.rule);
      merged.set(key, m);
    }
    const edges: RuleEdge[] = [];
    for (const [key, m] of merged) {
      let source = m.from;
      if (source === null) {
        source = `entry:${m.to}`;
        const p = pos.get(m.to)!;
        nodes.push({ id: source, type: "entry", position: { x: p.x - 40, y: p.y - 22 }, data: {}, draggable: false, selectable: false, focusable: false });
      }
      edges.push({ id: key, type: "rule", source, target: m.to, data: { rules: m.rules }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--color-ink)" }, focusable: false });
    }
    return { nodes, edges };
  }, [stages, initial, reachable, transitions, pos, selected, select]);

  // Nodes move freely during a drag; a change to the draft resets them to its layout.
  const [local, setLocal] = useState({ from: built.nodes, nodes: built.nodes });
  if (local.from !== built.nodes) setLocal({ from: built.nodes, nodes: built.nodes });
  const nodes = local.from === built.nodes ? local.nodes : built.nodes;

  const height = Math.min(480, Math.max(160, ...[...pos.values()].map((p) => p.y + NODE_H + 48)));
  return (
    <div role="group" aria-label={label} style={{ height }} className="w-full">
      <ReactFlow
        nodes={nodes}
        edges={built.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={(changes: NodeChange<StageNode | EntryNode>[]) => setLocal((l) => ({ ...l, nodes: applyNodeChanges(changes, l.nodes) }))}
        onNodeDragStop={(_, node) => {
          if (node.type === "stage") move(node.id, Math.max(0, Math.round(node.position.x)), Math.max(0, Math.round(node.position.y)));
        }}
        colorMode={dark ? "dark" : "light"}
        className="[--xy-background-color:transparent]"
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        minZoom={0.5}
        maxZoom={1.5}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling={false}
        zoomOnDoubleClick={false}
      />
    </div>
  );
}
