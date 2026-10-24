"use client";
// The play workspace (app-flow.md, Play interface; docs/design/README.md, Play): a turn tracker bar
// across the top; the log as the centre pane with the composer pinned under it; the map as the right
// pane; the character and the party as a left pane with tabs. Medium screens show the log and one side
// pane (Map, Character, or Party); compact screens show one pane at a time, switched by a tab bar at the
// foot, with the composer above it. Every pane stays mounted and CSS shows the ones each size class
// needs, so map zoom and form input survive a switch. Messages arrive on Realtime; while the channel is
// down the client polls get_history, so play continues either way.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Compass, Hourglass, Map as MapIcon, Play, ScrollText, Send, SkipForward, Swords, Timer, User, Users, WifiOff, X } from "lucide-react";
import { useClerkSession } from "@/components/clerk";
import type { InstanceView } from "@/lib/store";
import type { View } from "@/lib/engine";
import type { Message } from "@/lib/broadcast";
import { realtimeClient, subscribeInstance, subscribeUser, type StreamStatus } from "@/lib/broadcast/client";
import { Sequencer, type HistoryItem } from "@/lib/broadcast/sequencer";
import { actAction, advanceAction, historyAction, inputAction, refreshAction } from "@/lib/server/play-actions";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { cx } from "@/components/ui/cx";
import { ArtIcon } from "@/components/art";
import { QuickActions, TargetActions } from "./action-bar";
import { MapPanel } from "./map-panel";
import { PaneTabs } from "./pane-tabs";

interface LogEntry {
  version: number;
  actor: string | null;
  text: string;
}

export interface PlayProps {
  instance: InstanceView;
  view: View;
  history: HistoryItem[];
  deadline: string | null;
  author: boolean;
  userId: string;
  /** Character id to name, for log headings. */
  names: Record<string, string>;
  endings: Record<string, string>;
  realtime: { url: string; key: string } | null;
  /** Whether a parser is configured for free-text input. */
  textInput: boolean;
  /** Character portraits by character id. */
  portraits: Record<string, { hash: string; alt: string }>;
}

/** How often to poll history while the Realtime channel is down. */
const POLL_MS = 4000;

function logOf(items: readonly HistoryItem[]): LogEntry[] {
  return items.filter((h) => h.narration).map((h) => ({ version: h.version, actor: h.actor_id, text: h.narration!.text }));
}

// The clock, as an external store: the server snapshot is null, so the server and the first client
// render agree, and the countdown fills in after hydration and ticks every second.
function subscribeClock(tick: () => void) {
  const t = setInterval(tick, 1000);
  return () => clearInterval(t);
}
const clockNow = () => Math.floor(Date.now() / 1000);
const clockServer = () => null;

function Countdown({ deadline }: { deadline: string | null }) {
  const now = useSyncExternalStore(subscribeClock, clockNow, clockServer);
  if (!deadline) return null;
  const left = now === null ? null : Math.max(0, Math.round(new Date(deadline).getTime() / 1000 - now));
  return (
    <span className={cx("tabular inline-flex items-center gap-1.5 text-label", left !== null && left <= 30 ? "text-warning" : "text-ink")}>
      <Timer {...ICON_DENSE} />
      <span className="sr-only">Time left: </span>
      {left === null ? "–:––" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
      <span aria-hidden="true" className="text-muted">
        left
      </span>
    </span>
  );
}

type Pane = "log" | "map" | "character" | "party";
type Side = "map" | "character" | "party";
type Left = "character" | "party";
type Mark = "current" | "declared" | "waiting" | null;

const MARKS: Record<Exclude<Mark, null>, { word: string; icon: ReactNode; className: string }> = {
  current: { word: "current turn", icon: <Play {...ICON_DENSE} />, className: "border-accent bg-accent-soft text-accent" },
  declared: { word: "declared", icon: <Check {...ICON_DENSE} />, className: "border-rule bg-desk text-muted" },
  waiting: { word: "waiting", icon: <Hourglass {...ICON_DENSE} />, className: "border-border bg-page text-ink" },
};

function Avatar({ name, mine }: { name: string; mine?: boolean }) {
  return (
    <span aria-hidden="true" className={cx("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-label font-semibold", mine ? "bg-accent text-page" : "bg-accent-soft text-accent")}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** A health string such as "7/10 HP" as a fraction, for its bar. */
function healthFraction(health: string): number | null {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(health);
  if (!m || Number(m[2]) <= 0) return null;
  return Math.max(0, Math.min(1, Number(m[1]) / Number(m[2])));
}

function HealthBar({ health }: { health: string }) {
  const f = healthFraction(health);
  if (f === null) return null;
  return (
    <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-desk">
      <span className={cx("block h-full rounded-full", f <= 0.25 ? "bg-danger" : f <= 0.5 ? "bg-warning" : "bg-success")} style={{ width: `${f * 100}%` }} />
    </span>
  );
}

export function PlayClient(props: PlayProps) {
  const router = useRouter();
  const { session } = useClerkSession();
  const [view, setView] = useState(props.view);
  const [status, setStatus] = useState(props.instance.status);
  const [ending, setEnding] = useState<string | null>(props.instance.ending);
  const [log, setLog] = useState<LogEntry[]>(() => logOf(props.history));
  const [round, setRound] = useState<{ declared: string[]; waiting_on: string[]; current?: string; deadline: string | null }>({ declared: view.round.declared, waiting_on: view.round.waiting_on, deadline: props.deadline });
  const [stream, setStream] = useState<StreamStatus>("connecting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [declaration, setDeclaration] = useState<{ tool: string; label: string } | null>(null);
  const [text, setText] = useState("");
  // Which panes show: compact (one pane), medium (the side pane beside the log), expanded (the left pane).
  const [pane, setPane] = useState<Pane>("log");
  const [side, setSide] = useState<Side>("map");
  const [left, setLeft] = useState<Left>("character");
  // The log length when the compact log pane was last shown, for the tab bar's new-event count.
  const [seen, setSeen] = useState(log.length);
  // Action menu (tools.md, improvise: at a streak of 4, or in action-menu mode): valid calls as chips.
  const [menu, setMenu] = useState<{ label: string; tool: string; args: Record<string, unknown> }[]>([]);
  const lastLabel = useRef<string>("");
  // The actor of each commit, for the heading of its narration.
  const actors = useRef(new Map(props.history.map((h) => [h.version, h.actor_id])));
  const logBox = useRef<HTMLDivElement>(null);
  const characterId = view.character_id;
  const instanceId = props.instance.id;

  const refresh = useCallback(async () => {
    const r = await refreshAction(instanceId, characterId);
    if (!r) return;
    setStatus(r.instance.status);
    setEnding(r.instance.ending);
    if (r.view) {
      setView(r.view);
      setRound((x) => ({ ...x, declared: r.view!.round.declared, waiting_on: r.view!.round.waiting_on }));
    }
  }, [instanceId, characterId]);

  const onMessage = useCallback(
    (m: Message) => {
      if (m.type === "narration") setLog((l) => (l.some((e) => e.version === m.version) ? l : [...l, { version: m.version, actor: actors.current.get(m.version) ?? null, text: String(m.text) }]));
      if (m.type === "commit") {
        actors.current.set(m.version, (m.actor_id as string | null) ?? null);
        if (m.actor_id === characterId) {
          setDeclaration(null);
          setMenu([]);
        }
        void refresh();
      }
      if (m.type === "round") setRound({ declared: (m.declared as string[]) ?? [], waiting_on: (m.waiting_on as string[]) ?? [], current: m.current as string | undefined, deadline: (m.deadline as string | undefined) ?? null });
      if (m.type === "instance_status") {
        setStatus(m.status as InstanceView["status"]);
        if (m.ending) setEnding(String(m.ending));
      }
    },
    [characterId, refresh],
  );

  // Commits arrive on Realtime when it is configured; otherwise, and whenever the channel drops, the
  // sequencer polls history.
  useEffect(() => {
    const history = (after: number) => historyAction(instanceId, after);
    const last = props.history.at(-1)?.version ?? props.instance.version;
    if (!props.realtime || !session) {
      const s = new Sequencer(last, instanceId, onMessage, history);
      const t = setInterval(() => void s.backfill(), POLL_MS);
      return () => clearInterval(t);
    }
    const client = realtimeClient(props.realtime.url, props.realtime.key, () => session.getToken());
    let down = true;
    const s = subscribeInstance(client, instanceId, last, history, onMessage, (st) => {
      down = st !== "live";
      setStream(st);
    });
    const stopUser = subscribeUser(client, props.userId, (m) => {
      if (m.instance_id !== instanceId) return;
      if (m.type === "declaration" && m.character_id === characterId) setDeclaration({ tool: String(m.tool), label: lastLabel.current || String(m.label) });
      if (m.type === "choice") void refresh();
      if (m.type === "action_menu" && m.character_id === characterId) setMenu((m.options as { label: string; tool: string; args: Record<string, unknown> }[]) ?? []);
      if (m.type === "input_rejected") setError(`That did not work: ${String(m.detail ?? m.reason)}.`);
    });
    const t = setInterval(() => {
      if (down) void s.backfill();
    }, POLL_MS);
    return () => {
      clearInterval(t);
      s.stop();
      stopUser();
    };
  }, [instanceId, characterId, props.realtime, props.userId, props.history, props.instance.version, session, onMessage, refresh]);

  // Paused: back to the lobby after 5 seconds.
  useEffect(() => {
    if (status !== "paused") return;
    const t = setTimeout(() => router.push(`/instances/${instanceId}`), 5000);
    return () => clearTimeout(t);
  }, [status, router, instanceId]);

  // The log keeps its newest entry in view, and so does the compact log pane when it is shown again.
  useEffect(() => {
    const el = logBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, pane]);

  const act = useCallback(
    async (tool: string, args: Record<string, unknown>, label: string) => {
      setBusy(true);
      setError(null);
      lastLabel.current = label;
      const r = await actAction({ instance_id: instanceId, character_id: characterId, tool, args, idempotency_key: crypto.randomUUID() });
      setBusy(false);
      if (r.error) setError(r.error);
      else {
        setSelected(null);
        void refresh();
      }
    },
    [instanceId, characterId, refresh],
  );

  const pick = useCallback((id: string) => setSelected(id), []);
  const notMyTurn = view.round.resolution === "sequential" && round.waiting_on.length > 0 && !round.waiting_on.includes(characterId);
  const live = status === "active";
  const yourTurn = live && round.waiting_on.includes(characterId);
  const names = props.names;
  const s = view.character.summary;
  const myName = names[characterId] ?? characterId;
  const reconnecting = stream === "reconnecting" && props.realtime !== null;

  const showPane = (next: Pane) => {
    if (pane === "log" && next !== "log") setSeen(log.length);
    setPane(next);
  };
  const unseen = pane === "log" ? 0 : Math.max(0, log.length - seen);

  const markOf = (id: string): Mark => (round.current === id ? "current" : round.declared.includes(id) ? "declared" : round.waiting_on.includes(id) ? "waiting" : null);
  const members = [{ id: characterId, name: myName }, ...view.party.map((p) => ({ id: p.id, name: p.name }))];
  const roomLabel = (id: string | null) => (id ? view.map.rooms.find((r) => r.id === id)?.label : undefined);

  const tracker = (
    <section aria-label="Turn tracker" className="relative flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b border-rule bg-page px-3 whitespace-nowrap sm:px-4">
      <h1 className="max-w-56 shrink-0 truncate text-label font-semibold text-ink max-lg:sr-only">{props.instance.name}</h1>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-rule max-lg:hidden" />
      <span className="tabular shrink-0 text-label font-semibold text-ink">Round {view.round.number}</span>
      <span className="flex shrink-0 items-center gap-2 max-sm:order-3">
        <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium", view.mode === "combat" ? "bg-danger-soft text-danger" : "bg-desk text-muted")}>
          {view.mode === "combat" ? <Swords {...ICON_DENSE} /> : <Compass {...ICON_DENSE} />}
          {view.mode}
        </span>
        <span className="text-caption text-muted max-lg:sr-only">{view.round.resolution}</span>
      </span>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-rule max-sm:hidden" />
      <ul aria-label="Turn order" className="flex shrink-0 items-center gap-1.5 max-sm:order-2">
        {members.map((m) => {
          const mark = markOf(m.id);
          const meta = mark ? MARKS[mark] : null;
          return (
            <li key={m.id} title={meta ? `${m.name}: ${meta.word}` : m.name} className={cx("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption font-medium", meta?.className ?? "border-rule bg-page text-ink")}>
              {meta?.icon}
              {m.name}
              {m.id === characterId && <span className="font-normal text-muted max-lg:sr-only">(you)</span>}
              {meta && <span className="sr-only">, {meta.word}</span>}
            </li>
          );
        })}
      </ul>
      <span className="flex shrink-0 items-center gap-3 max-sm:order-1 sm:ml-auto sm:pl-2">
        {yourTurn && <Badge tone="accent">Your turn</Badge>}
        {reconnecting && (
          <span className="inline-flex items-center gap-1.5 text-label text-warning">
            <WifiOff {...ICON_DENSE} />
            Reconnecting
          </span>
        )}
        <Countdown deadline={round.deadline} />
      </span>
      {props.author && live && (
        <Button size="sm" icon={<SkipForward {...ICON_DENSE} />} className="shrink-0 max-sm:order-4" onClick={() => void advanceAction(instanceId).then((r) => (r.error ? setError(r.error) : refresh()))}>
          Advance
        </Button>
      )}
    </section>
  );

  const notice =
    status === "paused" ? (
      <Notice tone="warning" live title="The game is paused.">
        Returning to the lobby…
      </Notice>
    ) : status === "ended" ? (
      <Notice tone="info" live title={`The adventure has ended${ending ? `: ${props.endings[ending] ?? ending}` : ""}.`}>
        <Link href={`/instances/${instanceId}`} className="font-medium text-accent underline">
          Back to the lobby
        </Link>
      </Notice>
    ) : null;

  const pickRow = (id: string, label: ReactNode, art: Parameters<typeof ArtIcon>[0]["art"]) => {
    const on = selected === id;
    return (
      <li key={id}>
        <button type="button" aria-pressed={on} onClick={() => pick(id)} className={cx("flex min-h-10 w-full items-center gap-3 rounded-control px-2 py-1.5 text-left text-label", on ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-desk")}>
          <ArtIcon art={art} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
      </li>
    );
  };

  const characterPane = (
    <div className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <div className="flex items-center gap-3">
        <Avatar name={myName} mine />
        <div className="min-w-0 flex-1">
          <h2 id="character-title" className="truncate text-heading font-semibold text-ink">
            {myName}
          </h2>
        </div>
        <StatusBadge status={s.status} />
      </div>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
        <div className="col-span-full flex flex-col gap-1.5 rounded-card border border-rule p-3">
          <dt className="text-caption text-muted">Health</dt>
          <dd className="tabular text-heading font-semibold text-ink">{s.health}</dd>
          <HealthBar health={s.health} />
        </div>
        {Object.entries(s.resources ?? {}).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 rounded-card border border-rule p-3">
            <dt className="text-caption text-muted">{k}</dt>
            <dd className="tabular text-heading font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="inventory-title">
        <h3 id="inventory-title" className="mb-1 px-2 text-caption font-medium text-muted">
          Inventory
        </h3>
        {view.actions.inventory.length === 0 ? <p className="px-2 text-caption text-muted">Empty</p> : <ul className="flex flex-col">{view.actions.inventory.map((i) => pickRow(i.id, i.label, i.art))}</ul>}
      </section>
      <section aria-labelledby="abilities-title">
        <h3 id="abilities-title" className="mb-1 px-2 text-caption font-medium text-muted">
          Abilities
        </h3>
        {view.actions.abilities.length === 0 ? <p className="px-2 text-caption text-muted">None</p> : <ul className="flex flex-col">{view.actions.abilities.map((a) => pickRow(a.id, a.label, a.art))}</ul>}
      </section>
    </div>
  );

  const partyPane = (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <h2 id="party-title" className="sr-only">
        Party
      </h2>
      {view.party.length === 0 ? (
        <p className="text-muted">You are alone.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.party.map((p) => {
            const mark = markOf(p.id);
            const where = roomLabel(p.room);
            return (
              <li key={p.id} className="flex flex-col gap-2 rounded-card border border-rule p-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label font-semibold text-ink">{p.name}</p>
                    <p className="text-caption text-muted">
                      <span className="tabular">{p.summary.health}</span>
                      {where && ` · ${where}`}
                    </p>
                  </div>
                  {mark && (
                    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium", MARKS[mark].className)}>
                      {MARKS[mark].icon}
                      {MARKS[mark].word}
                    </span>
                  )}
                </div>
                <HealthBar health={p.summary.health} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const placeholder = !live
    ? "The game is not running."
    : view.pending_choice
      ? "Choose an option first."
      : notMyTurn
        ? `It is ${names[round.current ?? ""] ?? "another character"}'s turn.`
        : busy
          ? "Working on your last action…"
          : props.textInput
            ? "What do you do?"
            : "Text input is not available; use the actions.";
  const typing = live && props.textInput && !busy && !view.pending_choice && !notMyTurn;

  const say = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    lastLabel.current = t;
    const r = await inputAction({ instance_id: instanceId, character_id: characterId, text: t, idempotency_key: crypto.randomUUID() });
    setBusy(false);
    if (r.error) setError(r.error);
    else {
      setText("");
      void refresh();
    }
  };

  const composer = (
    <section aria-labelledby="composer-title" aria-busy={busy} className="relative col-start-1 row-start-2 flex max-h-[45dvh] min-h-0 flex-col overflow-y-auto bg-page px-3 py-3 sm:row-start-3 sm:px-4 lg:col-start-2">
      <h2 id="composer-title" className="sr-only">
        Your action
      </h2>
      {/* Rejected actions and failed calls; always mounted, so a new message is announced. */}
      <div role="alert" className="[&:not(:empty)]:mb-2">
        {error && (
          <div className="flex items-start gap-2 rounded-card border border-danger bg-danger-soft py-1.5 pr-1 pl-3 text-body text-ink">
            <CircleAlert {...ICON_DENSE} className="mt-[3px] shrink-0 text-danger" />
            <p className="min-w-0 flex-1 py-0.5">{error}</p>
            <button type="button" aria-label="Dismiss" title="Dismiss" onClick={() => setError(null)} className="inline-flex size-7 shrink-0 items-center justify-center rounded-control text-muted hover:bg-page hover:text-ink">
              <X {...ICON_DENSE} />
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {live && menu.length > 0 && (
          <div role="group" aria-label="Suggested actions" className="flex flex-wrap gap-2">
            {menu.map((o, i) => (
              <button key={i} type="button" disabled={busy} onClick={() => void act(o.tool, o.args, o.label)} className="inline-flex h-8 items-center rounded-full border border-accent-line bg-accent-soft px-3 text-label font-medium text-accent hover:border-accent disabled:cursor-not-allowed disabled:opacity-55">
                {o.label}
              </button>
            ))}
          </div>
        )}
        {live && !notMyTurn && <TargetActions view={view} selected={selected} onSelect={setSelected} act={act} busy={busy} />}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void say();
          }}
        >
          <TextInput disabled={!typing} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} aria-label="What do you do?" placeholder={placeholder} className="min-w-0 flex-1" />
          <Button type="submit" variant="primary" disabled={!typing || !text.trim()} icon={<Send {...ICON_DENSE} />} className="h-10">
            <span className="max-sm:sr-only">Send</span>
          </Button>
        </form>
        {live && !notMyTurn && <QuickActions view={view} act={act} busy={busy} declaration={declaration} />}
      </div>
    </section>
  );

  const paneBase = "col-start-1 row-start-1 min-h-0 flex-col bg-page";
  const sideTabs = [
    { id: "map" as const, label: "Map", icon: <MapIcon {...ICON_DENSE} />, controls: "pane-map" },
    { id: "character" as const, label: "Character", icon: <User {...ICON_DENSE} />, controls: "pane-character" },
    { id: "party" as const, label: "Party", icon: <Users {...ICON_DENSE} />, controls: "pane-party" },
  ];

  return (
    <div data-workspace="play" className="flex h-[calc(100dvh-var(--size-topbar)-1px)] min-h-[30rem] flex-col">
      {tracker}
      {/* "Your turn" for screen readers; the tracker shows it as a badge. */}
      <div role="alert" className="sr-only">
        {yourTurn ? "Your turn." : ""}
      </div>
      {notice && <div className="shrink-0 border-b border-rule bg-desk px-3 py-2 sm:px-4">{notice}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-px bg-rule sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] sm:grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Expanded: the left pane's tabs. */}
        <div className="col-start-1 row-start-1 hidden bg-page lg:block">
          <PaneTabs label="Character and party" current={left} onChange={setLeft} tabs={sideTabs.slice(1).map((t) => ({ ...t, id: t.id as Left }))} className="border-b border-rule" />
        </div>
        {/* Medium: the side pane's tabs. */}
        <div className="col-start-2 row-start-1 hidden bg-page sm:block lg:hidden">
          <PaneTabs label="Side pane" current={side} onChange={setSide} tabs={sideTabs} className="border-b border-rule" />
        </div>

        <section id="pane-log" aria-labelledby="log-title" className={cx(paneBase, pane === "log" ? "flex" : "hidden", "sm:col-start-1 sm:row-span-2 sm:flex lg:col-start-2")}>
          <h2 id="log-title" className="sr-only">
            Log
          </h2>
          <div ref={logBox} role="log" aria-label="Game log" tabIndex={0} className="relative min-h-0 flex-1 overflow-y-auto focus-visible:outline-offset-[-2px]">
            <div className="mx-auto flex max-w-prose flex-col gap-5 px-4 py-6 sm:px-6">
              {log.length === 0 && <p className="font-prose text-prose text-muted italic">The adventure begins.</p>}
              {log.map((e) => {
                const mine = e.actor === characterId;
                return (
                  <div key={e.version}>
                    {e.actor && (
                      <p className={cx("mb-1 flex items-center gap-2 text-caption font-medium", mine ? "text-accent" : "text-muted")}>
                        <span aria-hidden="true" className={cx("inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold", mine ? "bg-accent text-page" : "bg-accent-soft text-accent")}>
                          {(names[e.actor] ?? e.actor).charAt(0).toUpperCase()}
                        </span>
                        {names[e.actor] ?? e.actor}
                      </p>
                    )}
                    <p className="font-prose text-prose text-ink">{e.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {composer}

        <section
          id="pane-map"
          aria-labelledby="map-title"
          className={cx(paneBase, pane === "map" ? "flex" : "hidden", side === "map" ? "sm:flex" : "sm:hidden", "sm:col-start-2 sm:row-start-2 sm:row-span-2 lg:col-start-3 lg:row-start-1 lg:row-span-3 lg:flex")}
        >
          <MapPanel view={view} onPick={(id) => pick(id)} portraits={props.portraits} selected={selected} headingId="map-title" />
        </section>

        <section
          id="pane-character"
          aria-labelledby="character-title"
          className={cx(paneBase, pane === "character" ? "flex" : "hidden", side === "character" ? "sm:flex" : "sm:hidden", left === "character" ? "lg:flex" : "lg:hidden", "sm:col-start-2 sm:row-start-2 sm:row-span-2 lg:col-start-1")}
        >
          {characterPane}
        </section>

        <section
          id="pane-party"
          aria-labelledby="party-title"
          className={cx(paneBase, pane === "party" ? "flex" : "hidden", side === "party" ? "sm:flex" : "sm:hidden", left === "party" ? "lg:flex" : "lg:hidden", "sm:col-start-2 sm:row-start-2 sm:row-span-2 lg:col-start-1")}
        >
          {partyPane}
        </section>
      </div>

      {/* Compact: one pane at a time. */}
      <div className="shrink-0 border-t border-rule bg-page pb-[env(safe-area-inset-bottom)] sm:hidden">
        <PaneTabs
          variant="bar"
          label="Panes"
          current={pane}
          onChange={showPane}
          tabs={[{ id: "log", label: "Log", icon: <ScrollText {...ICON} />, controls: "pane-log", count: unseen }, ...sideTabs.map((t) => ({ ...t, icon: t.id === "map" ? <MapIcon {...ICON} /> : t.id === "character" ? <User {...ICON} /> : <Users {...ICON} /> }))]}
        />
      </div>
    </div>
  );
}
