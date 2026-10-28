"use client";
// The play workspace (app-flow.md, Play interface; docs/design/README.md, Play): a turn tracker bar
// across the top; the log as the centre pane with the composer pinned under it; the map as the right
// pane; the character and the party as a left pane with tabs. Medium screens show the log and one side
// pane (Map, Character, or Party); compact screens show one pane at a time, switched by a tab bar at the
// foot, with the composer above it. Every pane stays mounted and CSS shows the ones each size class
// needs, so map zoom and form input survive a switch. Messages arrive on Realtime; while the channel is
// down the client polls get_history, so play continues either way.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Map as MapIcon, ScrollText, Send, User, Users, X } from "lucide-react";
import { useClerkSession } from "@/components/clerk";
import type { InstanceView } from "@/lib/store";
import type { View } from "@/lib/engine";
import type { Message } from "@/lib/broadcast";
import { realtimeClient, subscribeInstance, subscribeUser, type StreamStatus } from "@/lib/broadcast/client";
import { Sequencer, type HistoryItem } from "@/lib/broadcast/sequencer";
import { actAction, advanceAction, historyAction, inputAction, pauseAction, refreshAction } from "@/lib/server/play-actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { ICON, ICON_DENSE, IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { cx } from "@/components/ui/cx";
import { formatWhen } from "@/components/when";
import { QuickActions, TargetActions } from "./action-bar";
import { MapPanel } from "./map-panel";
import { PaneTabs } from "./pane-tabs";
import { CharacterPane, PartyPane } from "./panes";
import { TurnTracker, type Round } from "./turn-tracker";

interface LogEntry {
  version: number;
  text: string;
}

export interface PlayProps {
  instance: InstanceView;
  view: View;
  history: HistoryItem[];
  deadline: string | null;
  author: boolean;
  userId: string;
  /** Character id to name, for the turn order and the composer. */
  names: Record<string, string>;
  endings: Record<string, string>;
  realtime: { url: string; key: string } | null;
  /** Whether a parser is configured for free-text input. */
  textInput: boolean;
  /** Character portraits by character id. */
  portraits: Record<string, { hash: string; alt: string }>;
  /** The start of the next session, for the Paused banner, and the user's time zone. */
  nextSession: string | null;
  timezone: string;
}

/** How often to poll history while the Realtime channel is down. */
const POLL_MS = 4000;
/** The error for a call that did not reach the server. */
const OFFLINE = "Not sent: the connection failed.";

function logOf(items: readonly HistoryItem[]): LogEntry[] {
  return items.filter((h) => h.narration).map((h) => ({ version: h.version, text: h.narration!.text }));
}

/** The character whose turn it is: in a sequential round, the one the round waits on. */
const currentOf = (round: View["round"]) => (round.resolution === "sequential" ? round.waiting_on[0] : undefined);

/** Sentences for `input_rejected` reasons, for a message without a detail. */
const REASONS: Record<string, string> = {
  not_your_turn: "It is not your turn.",
  choice_pending: "Choose an option first.",
  rate_limited: "Your last input is still being worked on.",
};

type Pane = "log" | "map" | "character" | "party";
type Side = "map" | "character" | "party";
type Left = "character" | "party";

const SIDE_TABS = [
  { id: "map", label: "Map", Icon: MapIcon, controls: "pane-map" },
  { id: "character", label: "Character", Icon: User, controls: "pane-character" },
  { id: "party", label: "Party", Icon: Users, controls: "pane-party" },
] as const;

/** The side panes' tabs, with icons at `size`: dense above a pane, full size in the compact tab bar. */
function sideTabs(size: typeof ICON | typeof ICON_DENSE) {
  return SIDE_TABS.map(({ Icon, ...t }) => ({ ...t, icon: <Icon {...size} /> }));
}

export function PlayClient(props: PlayProps) {
  const router = useRouter();
  const { session } = useClerkSession();
  const [view, setView] = useState(props.view);
  const [status, setStatus] = useState(props.instance.status);
  const [ending, setEnding] = useState<string | null>(props.instance.ending);
  const [log, setLog] = useState<LogEntry[]>(() => logOf(props.history));
  const [round, setRound] = useState<Round>({ declared: view.round.declared, waiting_on: view.round.waiting_on, current: currentOf(view.round), deadline: props.deadline });
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
  const logBox = useRef<HTMLDivElement>(null);
  const characterId = view.character_id;
  const instanceId = props.instance.id;

  const refresh = useCallback(async () => {
    const r = await refreshAction(instanceId, characterId);
    if (!r) return;
    setStatus(r.instance.status);
    setEnding(r.instance.ending);
    if (r.view) {
      const next = r.view.round;
      setView(r.view);
      setRound({ declared: next.declared, waiting_on: next.waiting_on, current: currentOf(next), deadline: r.deadline });
      // The stored declaration, for clients without the user channel's `declaration` message.
      setDeclaration((d) => (next.declared.includes(characterId) ? (d ?? { tool: "", label: lastLabel.current || "your action" }) : null));
    }
  }, [instanceId, characterId]);

  const onMessage = useCallback(
    (m: Message) => {
      if (m.type === "narration") setLog((l) => (l.some((e) => e.version === m.version) ? l : [...l, { version: m.version, text: String(m.text) }]));
      if (m.type === "commit") {
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
      if (m.type === "input_rejected") setError(typeof m.detail === "string" ? m.detail : (REASONS[String(m.reason)] ?? "That did not work."));
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

  // At the deadline the next request advances the round (coordinator catchUp); this one is it, so a
  // client without Realtime sees the new round too.
  useEffect(() => {
    if (status !== "active" || !round.deadline) return;
    const t = setTimeout(() => void refresh(), Math.max(0, Date.parse(round.deadline) - Date.now()) + 1000);
    return () => clearTimeout(t);
  }, [status, round.deadline, refresh]);

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
      try {
        const r = await actAction({ instance_id: instanceId, character_id: characterId, tool, args, idempotency_key: crypto.randomUUID() });
        if (r.error) setError(r.error);
        else if (r.rejected) setError(r.rejected);
        else {
          setSelected(null);
          void refresh();
        }
      } catch {
        setError(OFFLINE);
      } finally {
        setBusy(false);
      }
    },
    [instanceId, characterId, refresh],
  );

  const notMyTurn = view.round.resolution === "sequential" && round.waiting_on.length > 0 && !round.waiting_on.includes(characterId);
  // A character that is not active (dead, retired) takes no actions and sends no input; the server refuses them too.
  const inactive = (view.character.sheet as { status?: string }).status !== "active";
  const live = status === "active";
  const yourTurn = live && round.waiting_on.includes(characterId);
  const names = props.names;
  const myName = names[characterId] ?? characterId;
  const reconnecting = stream === "reconnecting" && props.realtime !== null;

  const showPane = (next: Pane) => {
    if (pane === "log" && next !== "log") setSeen(log.length);
    setPane(next);
  };
  const unseen = pane === "log" ? 0 : Math.max(0, log.length - seen);

  const members = [{ id: characterId, name: myName }, ...view.party.map((p) => ({ id: p.id, name: p.name }))];
  const mine = new Set(props.instance.characters.filter((c) => c.user_id === props.userId).map((c) => c.id));

  const advance = async () => {
    try {
      const r = await advanceAction(instanceId);
      if (r.error) setError(r.error);
      else await refresh();
    } catch {
      setError(OFFLINE);
    }
  };

  const pause = async () => {
    try {
      const r = await pauseAction(instanceId);
      if (r.error) setError(r.error);
      else setStatus("paused");
    } catch {
      setError(OFFLINE);
    }
  };

  const notice =
    status === "paused" ? (
      <Notice tone="warning" live title="The game is paused.">
        {props.nextSession ? `Next session: ${formatWhen(props.nextSession, props.timezone)}. ` : "No session is scheduled. "}
        Returning to the lobby…
      </Notice>
    ) : status === "ended" ? (
      <Notice tone="info" live title={`The adventure has ended${ending && props.endings[ending] ? `: ${props.endings[ending]}` : ""}.`}>
        <Link href={`/instances/${instanceId}/history`} className="font-medium text-accent underline">
          Read the history
        </Link>
      </Notice>
    ) : null;

  const placeholder = !live
    ? "The game is not running."
    : inactive
      ? `${myName} is ${view.character.summary.status.toLowerCase()} and can no longer act.`
      : view.pending_choice
      ? "Choose an option first."
      : notMyTurn
        ? `It is ${names[round.current ?? ""] ?? "another character"}'s turn.`
        : busy
          ? "Working on your last action…"
          : props.textInput
            ? "What do you do?"
            : "Use the actions below.";
  const typing = live && props.textInput && !busy && !view.pending_choice && !notMyTurn && !inactive;

  const say = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    lastLabel.current = t;
    // A rejected input keeps its text, so the player can change it and send again.
    try {
      const r = await inputAction({ instance_id: instanceId, character_id: characterId, text: t, idempotency_key: crypto.randomUUID() });
      if (r.error) setError(r.error);
      else if (r.rejected) setError(r.rejected);
      else {
        setText("");
        void refresh();
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  };

  const composer = (
    <section aria-labelledby="composer-title" aria-busy={busy} className="relative col-start-1 row-start-2 flex max-h-[45dvh] min-h-0 flex-col overflow-y-auto bg-page py-3 sm:row-start-3 lg:col-start-2">
      <h2 id="composer-title" className="sr-only">
        Your action
      </h2>
      {/* The log's prose column, so the composer starts on the narration's edge. */}
      <div className="mx-auto flex w-full max-w-prose flex-col px-4 sm:px-6">
        {/* Rejected actions and failed calls; always mounted, so a new message is announced. */}
        <div role="alert" className="[&:not(:empty)]:mb-2">
          {error && (
            <div className="flex items-start gap-2 rounded-card border border-danger bg-danger-soft py-1.5 pr-1 pl-3 text-body text-ink">
              <CircleAlert {...ICON_DENSE} className="mt-[3px] shrink-0 text-danger" />
              <p className="min-w-0 flex-1 py-0.5">{error}</p>
              <IconButton label="Dismiss" icon={<X {...ICON_DENSE} />} dense tip="end" onClick={() => setError(null)} className="text-muted hover:bg-page hover:text-ink" />
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
          {live && !notMyTurn && !inactive && <TargetActions view={view} selected={selected} onSelect={setSelected} act={act} busy={busy} />}
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
          {live && !notMyTurn && !inactive && <QuickActions view={view} act={act} busy={busy} declaration={declaration} />}
        </div>
      </div>
    </section>
  );

  const paneBase = "col-start-1 row-start-1 min-h-0 flex-col bg-page";

  return (
    <div data-workspace="play" className="flex h-[calc(100dvh-var(--size-topbar)-1px)] min-h-[30rem] flex-col">
      <TurnTracker
        title={props.instance.name}
        instanceId={instanceId}
        view={view}
        round={round}
        characterId={characterId}
        members={members}
        mine={mine}
        yourTurn={yourTurn}
        reconnecting={reconnecting}
        onAdvance={props.author && live ? () => void advance() : undefined}
        onPause={props.author && live ? () => void pause() : undefined}
        sandbox={props.instance.sandbox}
      />
      {/* "Your turn" for screen readers; the tracker shows it as a badge. */}
      <div role="alert" className="sr-only">
        {yourTurn ? "Your turn." : ""}
      </div>
      {notice && <div className="shrink-0 border-b border-rule bg-desk px-3 py-2 sm:px-4">{notice}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-px bg-rule sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] sm:grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Expanded: the left pane's tabs. */}
        <div className="col-start-1 row-start-1 hidden bg-page lg:block">
          <PaneTabs label="Character and party" current={left} onChange={setLeft} tabs={sideTabs(ICON_DENSE).filter((t): t is typeof t & { id: Left } => t.id !== "map")} className="border-b border-rule" />
        </div>
        {/* Medium: the side pane's tabs. */}
        <div className="col-start-2 row-start-1 hidden bg-page sm:block lg:hidden">
          <PaneTabs label="Side pane" current={side} onChange={setSide} tabs={sideTabs(ICON_DENSE)} className="border-b border-rule" />
        </div>

        <section id="pane-log" aria-labelledby="log-title" className={cx(paneBase, pane === "log" ? "flex" : "hidden", "sm:col-start-1 sm:row-span-2 sm:flex lg:col-start-2")}>
          <h2 id="log-title" className="sr-only">
            Log
          </h2>
          <div ref={logBox} role="log" aria-label="Game log" tabIndex={0} className="relative min-h-0 flex-1 overflow-y-auto focus-visible:outline-offset-[-2px]">
            <div className="mx-auto flex max-w-prose flex-col gap-5 px-4 py-6 sm:px-6">
              {log.length === 0 && <p className="font-prose text-prose text-muted italic">The adventure begins.</p>}
              {/* A commit's narration covers every action resolved in it, so entries carry no actor name; the text names who acted. */}
              {log.map((e) => (
                <p key={e.version} className="font-prose text-prose text-ink">
                  {e.text}
                </p>
              ))}
            </div>
          </div>
        </section>

        {composer}

        <section
          id="pane-map"
          aria-labelledby="map-title"
          className={cx(paneBase, pane === "map" ? "flex" : "hidden", side === "map" ? "sm:flex" : "sm:hidden", "sm:col-start-2 sm:row-start-2 sm:row-span-2 lg:col-start-3 lg:row-start-1 lg:row-span-3 lg:flex")}
        >
          <MapPanel view={view} onPick={setSelected} portraits={props.portraits} selected={selected} headingId="map-title" />
        </section>

        <section
          id="pane-character"
          aria-labelledby="character-title"
          className={cx(paneBase, pane === "character" ? "flex" : "hidden", side === "character" ? "sm:flex" : "sm:hidden", left === "character" ? "lg:flex" : "lg:hidden", "sm:col-start-2 sm:row-start-2 sm:row-span-2 lg:col-start-1")}
        >
          <CharacterPane name={myName} view={view} selected={selected} onPick={setSelected} />
        </section>

        <section
          id="pane-party"
          aria-labelledby="party-title"
          className={cx(paneBase, pane === "party" ? "flex" : "hidden", side === "party" ? "sm:flex" : "sm:hidden", left === "party" ? "lg:flex" : "lg:hidden", "sm:col-start-2 sm:row-start-2 sm:row-span-2 lg:col-start-1")}
        >
          <PartyPane view={view} round={round} />
        </section>
      </div>

      {/* Compact: one pane at a time. */}
      <div className="shrink-0 border-t border-rule bg-page pb-[env(safe-area-inset-bottom)] sm:hidden">
        <PaneTabs
          variant="bar"
          label="Panes"
          current={pane}
          onChange={showPane}
          tabs={[{ id: "log", label: "Log", icon: <ScrollText {...ICON} />, controls: "pane-log", count: unseen }, ...sideTabs(ICON)]}
        />
      </div>
    </div>
  );
}
