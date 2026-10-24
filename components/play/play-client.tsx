"use client";
// The play interface (app-flow.md, Play interface; design/screens.md, Play): desk (character, map,
// party), page (log and action bar), margin (round status). Below 1024 px the log fills the screen
// and the other panels open as sheets from a top bar. Messages arrive on Realtime; while the channel
// is down the client polls get_history, so play continues either way.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@clerk/nextjs";
import type { InstanceView } from "@/lib/store";
import type { View } from "@/lib/engine";
import type { Message } from "@/lib/broadcast";
import { realtimeClient, subscribeInstance, subscribeUser, type StreamStatus } from "@/lib/broadcast/client";
import { Sequencer, type HistoryItem } from "@/lib/broadcast/sequencer";
import { actAction, advanceAction, historyAction, inputAction, refreshAction } from "@/lib/server/play-actions";
import { ActionBar } from "./action-bar";
import { MapPanel } from "./map-panel";
import { ArtIcon } from "@/components/art";

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

function Countdown({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const left = Math.max(0, Math.round((new Date(deadline).getTime() - now) / 1000));
  return (
    <span>
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left
    </span>
  );
}

type Sheet = "map" | "character" | "party" | "round" | null;

export function PlayClient(props: PlayProps) {
  const router = useRouter();
  const { session } = useSession();
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
  const [sheet, setSheet] = useState<Sheet>(null);
  const [text, setText] = useState("");
  const lastLabel = useRef<string>("");
  // The actor of each commit, for the heading of its narration.
  const actors = useRef(new Map(props.history.map((h) => [h.version, h.actor_id])));
  const logEnd = useRef<HTMLDivElement>(null);
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
        if (m.actor_id === characterId) setDeclaration(null);
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

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [log.length]);

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
  const names = props.names;
  const s = view.character.summary;

  const roundStatus = (
    <div className="flex flex-col gap-1 font-ui text-caption">
      <p className="font-ui text-label">
        Round {view.round.number} · {view.mode} · {view.round.resolution}
      </p>
      {round.current && <p>Turn: {names[round.current] ?? round.current}</p>}
      {round.declared.length > 0 && <p>Declared: {round.declared.map((id) => names[id] ?? id).join(", ")}</p>}
      {round.waiting_on.length > 0 && <p>Waiting on: {round.waiting_on.map((id) => names[id] ?? id).join(", ")}</p>}
      <Countdown deadline={round.deadline} />
      {props.author && live && (
        <button type="button" className="mt-1 self-start text-accent" onClick={() => void advanceAction(instanceId).then((r) => (r.error ? setError(r.error) : refresh()))}>
          Advance
        </button>
      )}
    </div>
  );

  const characterPanel = (
    <div className="flex flex-col gap-2 font-ui text-caption">
      <h2 className="font-ui text-label">{names[characterId] ?? characterId}</h2>
      <p>
        {s.health} · {s.status.replace("_", " ")}
        {Object.entries(s.resources ?? {}).map(([k, v]) => ` · ${k} ${v}`)}
      </p>
      <div>
        <h3 className="font-ui text-label">Inventory</h3>
        {view.actions.inventory.length === 0 ? (
          <p className="text-muted">Empty</p>
        ) : (
          <ul>
            {view.actions.inventory.map((i) => (
              <li key={i.id}>
                <button type="button" className={`flex items-center gap-1 ${selected === i.id ? "text-accent" : ""}`} onClick={() => pick(i.id)}>
                  <ArtIcon art={i.art} /> {i.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="font-ui text-label">Abilities</h3>
        <ul>
          {view.actions.abilities.map((a) => (
            <li key={a.id}>
              <button type="button" className={`flex items-center gap-1 ${selected === a.id ? "text-accent" : ""}`} onClick={() => pick(a.id)}>
                <ArtIcon art={a.art} /> {a.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const partyPanel = (
    <div className="font-ui text-caption">
      <h2 className="font-ui text-label">Party</h2>
      {view.party.length === 0 ? (
        <p className="text-muted">You are alone.</p>
      ) : (
        <ul>
          {view.party.map((p) => (
            <li key={p.id}>
              {p.name} · {p.summary.health}
              {round.declared.includes(p.id) ? " · declared" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const places = (
    <div className="font-ui text-caption">
      <h2 className="font-ui text-label">Ways on</h2>
      <ul>
        {view.destinations.map((d) => (
          <li key={d.id}>
            <button type="button" className={selected === d.id ? "text-accent" : ""} onClick={() => pick(d.id)}>
              {d.label} · {d.distance} {d.direction}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const mapPanel = <MapPanel view={view} onPick={(id) => pick(id)} portraits={props.portraits} />;
  const sheetContent: Record<Exclude<Sheet, null>, React.ReactNode> = { map: mapPanel, character: characterPanel, party: partyPanel, round: roundStatus };

  const banner =
    status === "paused" ? (
      <p className="rounded-control border border-warning bg-warning-soft p-2 font-ui text-control">The game is paused. Returning to the lobby…</p>
    ) : status === "ended" ? (
      <p className="rounded-control border border-accent-line bg-accent-soft p-2 font-ui text-control">
        The adventure has ended{ending ? `: ${props.endings[ending] ?? ending}` : ""}.{" "}
        <Link href={`/instances/${instanceId}`} className="text-accent underline">
          Back to the lobby
        </Link>
      </p>
    ) : stream === "reconnecting" && props.realtime ? (
      <p className="font-ui text-caption text-muted">Reconnecting…</p>
    ) : null;

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

  return (
    <div className="mx-auto grid max-w-[90rem] grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[16rem_minmax(0,48rem)_14rem]">
      {/* Narrow screens: a top bar with the round status and four panel buttons. */}
      <div className="flex items-center justify-between gap-2 border-b border-rule pb-2 font-ui text-caption lg:hidden">
        <span>
          Round {view.round.number} · <Countdown deadline={round.deadline} />
        </span>
        <span className="flex gap-3">
          {(["map", "character", "party", "round"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={sheet === k} className={sheet === k ? "text-accent" : ""} onClick={() => setSheet(sheet === k ? null : k)}>
              {k[0]!.toUpperCase() + k.slice(1)}
            </button>
          ))}
        </span>
      </div>
      {sheet && (
        <div className="rounded-t-control border border-border bg-raised p-3 lg:hidden">
          {sheetContent[sheet]}
          <button type="button" className="mt-2 font-ui text-caption text-muted" onClick={() => setSheet(null)}>
            Close
          </button>
        </div>
      )}

      <aside className="hidden flex-col gap-6 lg:flex">
        {characterPanel}
        {mapPanel}
        {places}
        {partyPanel}
      </aside>

      <section className="flex min-h-[70vh] flex-col gap-4">
        {banner}
        <div className="flex-1 overflow-y-auto rounded-control bg-page" aria-live="polite">
          {log.length === 0 && <p className="text-muted">The adventure begins.</p>}
          {log.map((e) => (
            <div key={e.version} className="mb-4">
              {e.actor && <p className="pl-4 font-ui text-label text-muted">{names[e.actor] ?? e.actor}</p>}
              <p className="font-prose text-prose">{e.text}</p>
            </div>
          ))}
          <div ref={logEnd} />
        </div>
        {error && <p className="text-danger">{error}</p>}
        {live && !notMyTurn && <ActionBar view={view} selected={selected} onSelect={setSelected} act={act} busy={busy} declaration={declaration} />}
        <div className="lg:hidden">{places}</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void say();
          }}
        >
          <input
            disabled={!typing}
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            aria-label="What do you do?"
            placeholder={placeholder}
            className="w-full rounded-control border border-border bg-page px-3 py-2 font-prose text-prose disabled:bg-desk"
          />
        </form>
      </section>

      <aside className="hidden lg:block">{roundStatus}</aside>
    </div>
  );
}
