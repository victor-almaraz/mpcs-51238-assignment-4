"use client";
// The adventure editor (app-flow.md, Adventure editor; docs/design/README.md, Adventure editor): a
// workspace with a toolbar (title, save state, Undo, Redo, Edit as YAML, Playtest, Snapshots, Export,
// Publish), the outline of sections on the left (a menu on compact screens), the selected section's
// editor in the centre, Playtest as a pane beside it, the Problems panel at the foot, and a status bar
// whose problem count toggles the panel. Saves 2 seconds after the last edit with the draft revision,
// one save at a time, retrying a failed save with backoff; a local backup in IndexedDB keeps unsaved
// changes across reloads, and the browser asks before leaving with changes unsaved. Publish and Export
// save first. Every edit is also validated in the browser after 400 ms (live-validation.ts); a save's
// diagnostics from the server replace the browser's.
import { Braces, ChevronDown, ChevronUp, CircleAlert, CircleCheck, CircleDot, Download, FileText, Flag, History, LoaderCircle, Map as MapIcon, Menu, Package, Play, Redo2, TriangleAlert, Undo2, Users, Workflow, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { copyDraftAction, requiredSettingsAction, saveDraftAction, type SaveResult } from "@/lib/server/draft-actions";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { TextInput } from "@/components/ui/field";
import { ICON, ICON_DENSE, IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { RemoveButton } from "./controls";
import { content, renameNamespace, type Doc, type Problem, type Refs } from "./doc";
import { EntitiesSection } from "./entities";
import { useLiveValidation } from "./live-validation";
import { PlotSection } from "./plot";
import { Playtest } from "./playtest";
import { counts, focusPointer, inside, isError, ProblemBadge, ProblemsPanel, ProblemsProvider, sectionOf, SECTIONS, segments, useRemembered, type Section } from "./problems";
import { Flags, Locations, Npcs, Overview, YamlPanel, type Reveal } from "./sections";
import type { SettingBundle } from "@/lib/bundle/setting";

const PROBLEMS_ID = "editor-problems";
/** The largest draft the server saves, as JSON (save_draft), and the size from which the editor warns. */
const MAX_DRAFT = 2_000_000;
const NEAR_MAX = 0.8 * MAX_DRAFT;
const megabytes = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;

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

/**
 * Applies a section's YAML. A new adventure id carries the refs into the old id's namespace with it, so
 * placements of the adventure's own entities keep pointing at them.
 */
function applySection(d: Doc, key: keyof Doc, value: unknown) {
  const before = d.adventure.id;
  (d as unknown as Record<string, unknown>)[key] = value;
  const after = d.adventure?.id;
  if (key === "adventure" && typeof after === "string" && after && before && after !== before) {
    const { adventure, ...rest } = renameNamespace(d, before, after);
    Object.assign(d, rest, { adventure: { ...adventure, id: after } });
  }
}

// Outline ------------------------------------------------------------------------------------------

const SECTION_ICONS: Record<Section, ReactNode> = {
  overview: <FileText {...ICON_DENSE} />,
  flags: <Flag {...ICON_DENSE} />,
  plot: <Workflow {...ICON_DENSE} />,
  locations: <MapIcon {...ICON_DENSE} />,
  npcs: <Users {...ICON_DENSE} />,
  entities: <Package {...ICON_DENSE} />,
};

const row = "flex w-full items-center gap-2 rounded-control text-left hover:bg-desk aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent";

function Outline({ doc, problems, section, location, arc, open }: { doc: Doc; problems: Problem[]; section: Section; location: string | null; arc: string | null; open: (s: Section, sub?: string) => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {SECTIONS.map((s) => {
        const mine = problems.filter((p) => sectionOf(p.pointer) === s.id);
        const subs = s.id === "plot" ? Object.values(doc.arcs).map((a) => ({ id: a.id, label: a.title || a.id, pointer: `/arcs/${a.id}` })) : s.id === "locations" ? Object.keys(doc.locations).map((id) => ({ id, label: id, pointer: `/locations/${id}` })) : [];
        const sub = s.id === "plot" ? arc : s.id === "locations" ? location : null;
        const here = section === s.id;
        return (
          <li key={s.id}>
            <button type="button" aria-current={here && subs.length === 0 ? "true" : undefined} onClick={() => open(s.id)} className={cx(row, "h-9 px-3 text-control", here && "font-semibold text-ink")}>
              <span className={cx("shrink-0", here ? "text-accent" : "text-muted")}>{SECTION_ICONS[s.id]}</span>
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <ProblemBadge problems={mine} />
              {s.id !== "overview" && (
                <span className="w-5 shrink-0 text-right text-caption font-normal text-muted tabular">
                  {Object.keys(doc[s.key]).length}
                  <span className="sr-only"> {Object.keys(doc[s.key]).length === 1 ? "entry" : "entries"}</span>
                </span>
              )}
            </button>
            {subs.length > 0 && (
              <ul className="mb-1 flex flex-col gap-0.5">
                {subs.map((x) => (
                  <li key={x.id}>
                    <button type="button" aria-current={here && sub === x.id ? "true" : undefined} onClick={() => open(s.id, x.id)} className={cx(row, "h-8 pl-9 pr-3 text-label")}>
                      <span className={cx("min-w-0 flex-1 truncate", s.id === "locations" && "font-mono text-code")}>{x.label}</span>
                      <ProblemBadge problems={problems.filter((p) => inside(p.pointer, x.pointer))} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Toolbar pieces -----------------------------------------------------------------------------------

type Status = { state: "saved" | "pending" | "saving" | "error" | "conflict"; at?: string; message?: string };

function SaveState({ status }: { status: Status }) {
  const s = status.state;
  const icon =
    s === "saved" ? <CircleCheck {...ICON_DENSE} className="text-success" /> : s === "pending" ? <CircleDot {...ICON_DENSE} /> : s === "saving" ? <LoaderCircle {...ICON_DENSE} className="animate-spin" /> : <CircleAlert {...ICON_DENSE} />;
  const text = s === "saved" ? (status.at ? `Saved ${new Date(status.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Saved") : s === "pending" ? "Unsaved changes" : s === "saving" ? "Saving…" : (status.message ?? "Not saved");
  return (
    <p role="status" title={text} className={cx("flex min-w-0 items-center gap-1.5 text-caption", s === "error" || s === "conflict" ? "text-danger" : "text-muted")}>
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{text}</span>
    </p>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-rule" />;

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
  const [location, setLocation] = useState<string | null>(null);
  const [arc, setArc] = useState<string | null>(null);
  const [yaml, setYaml] = useState(false);
  const [reveal, setReveal] = useState<Reveal>(null);
  const [picked, setPicked] = useState<Problem | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [problemsOpen, setProblemsOpen] = useRemembered("cadmium-editor-problems-open", false);
  // The required settings' bundles for validation and playtest; reloaded when requires_settings changes.
  const [settings, setSettings] = useState<SettingBundle[]>(props.settings);
  const [refs, setRefs] = useState<Refs>(props.refs);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const live = useLiveValidation(props.diagnostics, loadingSettings ? null : settings);
  const problems = live.problems;
  const [status, setStatus] = useState<Status>({ state: "saved" });
  const [restorable, setRestorable] = useState<Doc | null>(null);
  const [playtest, setPlaytest] = useState(false);
  const revision = useRef(props.revision);
  const latest = useRef(doc);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Increases with every change of the document, so results apply only to the edit they checked. */
  const seq = useRef(0);
  /** The `seq` of the document the server holds. */
  const savedSeq = useRef(0);
  /** The save in flight, and whether another should follow it for edits made meanwhile. */
  const running = useRef<Promise<boolean> | null>(null);
  const queued = useRef(false);
  const failures = useRef(0);
  const conflicted = useRef(false);
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);
  const requires = useRef(JSON.stringify(props.document.adventure.requires_settings));
  const settingsRequest = useRef(0);
  const pane = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Offer unsaved changes from the local backup, when it is newer than the server's copy.
  useEffect(() => {
    void backup.get(props.draftId).then((b) => {
      if (b && b.revision >= props.revision && JSON.stringify(b.doc) !== JSON.stringify(props.document)) setRestorable(b.doc);
    });
  }, [props.draftId, props.revision, props.document]);

  const { check, fromServer } = live;
  /** One save of the current document; false when it failed, after scheduling a retry with backoff. */
  const saveOnce = useCallback(async (): Promise<boolean> => {
    if (conflicted.current) return false;
    if (savedSeq.current === seq.current) return true;
    setStatus({ state: "saving" });
    const at = seq.current;
    let r: SaveResult;
    try {
      r = await saveDraftAction({ draft_id: props.draftId, document: latest.current as unknown as Record<string, unknown>, revision: revision.current });
    } catch {
      r = { error: "Not saved: the connection failed." };
    }
    if (r.error) {
      if (r.conflict) {
        conflicted.current = true;
        setStatus({ state: "conflict", message: r.error });
        return false;
      }
      failures.current += 1;
      const wait = Math.min(60_000, 2000 * 2 ** (failures.current - 1));
      setStatus({ state: "error", message: `${r.error} Trying again in ${Math.round(wait / 1000)} s.` });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveRef.current?.(), wait);
      return false;
    }
    failures.current = 0;
    revision.current = r.revision!;
    savedSeq.current = at;
    fromServer(r.diagnostics ?? [], at);
    // Edits made while this save ran are still unsaved, and stay in the backup.
    if (seq.current === at) {
      setStatus({ state: "saved", at: r.saved_at });
      void backup.drop(props.draftId);
    } else setStatus({ state: "pending" });
    return true;
  }, [props.draftId, fromServer]);

  /**
   * Saves now, one save at a time: called during a save, it runs another after it. Resolves true when
   * the document as it was at the call is saved.
   */
  const save = useCallback((): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (running.current) {
      queued.current = true;
      return running.current;
    }
    const run = (async () => {
      let ok: boolean;
      do {
        queued.current = false;
        ok = await saveOnce();
      } while (ok && queued.current);
      running.current = null;
      return ok;
    })();
    running.current = run;
    return run;
  }, [saveOnce]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // The browser asks before leaving with changes not yet saved (app-flow.md, Redirect rules).
  useEffect(() => {
    if (status.state === "saved") return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [status.state]);

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
        void requiredSettingsAction(props.draftId, next.adventure?.requires_settings)
          .catch(() => null)
          .then((r) => {
            if (n !== settingsRequest.current) return;
            if (r) {
              setSettings(r.settings);
              setRefs(r.refs);
            }
            setLoadingSettings(false);
          });
      }
      check(next as unknown as Record<string, unknown>, seq.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), 2000);
    },
    [props.draftId, check, save],
  );

  /** An unsaved document: backed up in this browser, then validated and saved. */
  const unsaved = useCallback(
    (next: Doc) => {
      if (!conflicted.current) setStatus({ state: "pending" });
      void backup.put(props.draftId, { revision: revision.current, doc: next });
      changed(next);
    },
    [props.draftId, changed],
  );

  const commit = useCallback(
    (next: Doc, from: Doc) => {
      setPast((p) => [...p.slice(-99), from]);
      setFuture([]);
      unsaved(next);
    },
    [unsaved],
  );

  /** Applies `f` to a copy of the document; an edit that changes nothing is not recorded. */
  const edit = useCallback(
    (f: (d: Doc) => void) => {
      const from = latest.current;
      const next = structuredClone(from);
      f(next);
      if (JSON.stringify(next) === JSON.stringify(from)) return;
      commit(next, from);
    },
    [commit],
  );

  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([latest.current, ...future]);
    unsaved(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, latest.current]);
    unsaved(next);
  };

  /** Saves, then runs `then`; when the save fails, the save state says why and nothing else happens. */
  const [leaving, setLeaving] = useState(false);
  const afterSave = async (then: () => void) => {
    setLeaving(true);
    const ok = await save();
    setLeaving(false);
    if (ok) then();
  };
  /** The export, downloaded through a link so the editor stays open. */
  const download = () => {
    const link = document.createElement("a");
    link.href = `/v1/drafts/${props.draftId}/export.zip`;
    link.download = "";
    link.click();
  };
  const size = useMemo(() => JSON.stringify(doc).length, [doc]);

  /** Opens a section, and for Plot arcs and Locations one of its arcs or locations. */
  const open = (s: Section, sub?: string) => {
    setSection(s);
    setYaml(false);
    if (s === "locations" && sub) setLocation(sub);
    if (s === "plot" && sub) setArc(sub);
    setOutlineOpen(false);
  };
  const navigate = (s: Section, sub?: string) => {
    setReveal(null);
    open(s, sub);
    // On compact screens Playtest replaces the editor; choosing a section shows the editor again.
    if (window.matchMedia("(max-width: 639px)").matches) setPlaytest(false);
  };

  /** A problem from the panel: open its section and focus its field. */
  const jump = (p: Problem) => {
    const [top, id] = segments(p.pointer);
    open(sectionOf(p.pointer), top === "locations" || top === "arcs" ? id : undefined);
    if (window.matchMedia("(max-width: 639px)").matches) setPlaytest(false);
    setReveal((r) => ({ pointer: p.pointer, n: (r?.n ?? 0) + 1 }));
    setPicked(p);
  };
  useEffect(() => {
    if (!reveal) return;
    const f = requestAnimationFrame(() => {
      const root = pane.current;
      if (root && !focusPointer(root, reveal.pointer)) heading.current?.focus();
    });
    return () => cancelAnimationFrame(f);
  }, [reveal]);

  const errors = problems.filter(isError);
  const warnings = problems.length - errors.length;
  const meta = SECTIONS.find((s) => s.id === section)!;
  const key = meta.key;
  const currentLocation = location && doc.locations[location] ? location : (Object.keys(doc.locations)[0] ?? null);
  const currentArc = arc && doc.arcs[arc] ? arc : (Object.keys(doc.arcs)[0] ?? null);
  const general = problems.filter((p) => sectionOf(p.pointer) === "overview" && !inside(p.pointer, "/adventure"));
  const checking =
    live.state === "checking" || loadingSettings
      ? "Checking…"
      : live.state === "off"
        ? "Checked when saved"
        : live.state === "failed"
          ? "The live check failed; showing the last results"
          : live.source === "browser"
            ? "Checked as you edit"
            : "Checked";
  const title = doc.adventure.title || doc.adventure.id;
  const publishWhy = errors.length ? `Fix ${errors.length} error${errors.length === 1 ? "" : "s"} to publish.` : undefined;

  /** Publish, disabled with its reason while the draft has errors; in the title row on compact screens. */
  const publish = (where: string) =>
    publishWhy ? (
      <>
        <Button variant="primary" disabled aria-describedby={`editor-publish-why-${where}`} title={publishWhy}>
          Publish
        </Button>
        <span id={`editor-publish-why-${where}`} className="sr-only">
          {publishWhy}
        </span>
      </>
    ) : (
      <Button variant="primary" disabled={leaving} onClick={() => void afterSave(() => router.push(`/adventures/${props.draftId}/publish`))}>
        Publish
      </Button>
    );

  const outline = <Outline doc={doc} problems={problems} section={section} location={currentLocation} arc={currentArc} open={navigate} />;

  return (
    <div data-workspace="editor" className="flex h-[calc(100dvh-var(--size-topbar)-1px)] min-h-[28rem] flex-col">
      {restorable && (
        <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning bg-warning-soft px-4 py-2 text-body">
          <TriangleAlert {...ICON_DENSE} className="text-warning" />
          <span>This browser holds unsaved changes to this draft.</span>
          <Button variant="secondary" size="sm" onClick={() => (commit(restorable, latest.current), setRestorable(null))}>
            Restore them
          </Button>
          <Button variant="quiet" size="sm" onClick={() => (setRestorable(null), void backup.drop(props.draftId))}>
            Discard
          </Button>
        </div>
      )}
      {status.state === "conflict" && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-danger bg-danger-soft px-4 py-2 text-body">
          <CircleAlert {...ICON_DENSE} className="text-danger" />
          <span>{status.message}</span>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onClick={async () => {
              const a = latest.current.adventure;
              const r = await copyDraftAction({ document: latest.current as unknown as Record<string, unknown>, title: `${a.title} (copy)`.slice(0, 80) }).catch(() => ({ error: "The copy failed: the connection failed.", id: undefined }));
              if (r.id) router.push(`/adventures/${r.id}/edit`);
              else setStatus({ state: "conflict", message: r.error ?? "The copy failed." });
            }}
          >
            Keep mine as a new draft
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-page px-4 py-2">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <h1 className="min-w-0 truncate text-heading font-semibold text-ink" title={title}>
            <span className="sr-only">Editing </span>
            {title}
          </h1>
          <SaveState status={status} />
          {size >= NEAR_MAX && (
            <button type="button" onClick={() => setSnapshotsOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-control px-1 text-caption text-warning hover:bg-desk">
              <TriangleAlert {...ICON_DENSE} />
              {megabytes(size)} of 2 MB
            </button>
          )}
          <span className="ml-auto shrink-0 sm:hidden">{publish("compact")}</span>
        </div>
        <div className="-mx-1 flex items-center gap-1 relative overflow-x-auto px-1 py-0.5 max-sm:w-full">
          <IconButton label="Undo" icon={<Undo2 {...ICON} />} onClick={undo} disabled={!past.length} className="disabled:opacity-40 disabled:hover:bg-transparent" />
          <IconButton label="Redo" icon={<Redo2 {...ICON} />} onClick={redo} disabled={!future.length} className="disabled:opacity-40 disabled:hover:bg-transparent" />
          <span className="hidden sm:contents">
            <Divider />
          </span>
          <IconButton label="Edit as YAML" tone="outline" icon={<Braces {...ICON} />} aria-pressed={yaml} onClick={() => setYaml(!yaml)} />
          <Button variant="secondary" aria-pressed={playtest} aria-controls={playtest ? "editor-playtest" : undefined} icon={<Play {...ICON_DENSE} className="hidden sm:block" />} onClick={() => setPlaytest(!playtest)} className="aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent">
            Playtest
          </Button>
          <IconButton label="Snapshots" icon={<History {...ICON} />} aria-haspopup="dialog" onClick={() => setSnapshotsOpen(true)} />
          <IconButton label="Export as a ZIP of YAML files" icon={<Download {...ICON} />} disabled={leaving} onClick={() => void afterSave(download)} />
          <span className="hidden items-center gap-1 sm:flex">
            <Divider />
            {publish("wide")}
          </span>
        </div>
      </div>

      {/* Panes */}
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Sections" className="relative hidden w-64 shrink-0 overflow-y-auto overscroll-contain border-r border-rule bg-page p-2 lg:block">
          {outline}
        </nav>

        <section aria-labelledby="editor-section-title" className={cx("min-w-0 flex-1 overflow-y-auto overscroll-contain", playtest ? "hidden sm:block" : "block")}>
          <div ref={pane} className="@container flex flex-col gap-5 px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" icon={<Menu {...ICON_DENSE} />} aria-haspopup="dialog" onClick={() => setOutlineOpen(true)} className="lg:hidden">
                Sections
              </Button>
              <h2 id="editor-section-title" ref={heading} tabIndex={-1} className="text-section font-semibold text-ink focus:outline-none focus-visible:outline-2">
                {meta.label}
                {yaml && <span className="font-normal text-muted"> as YAML</span>}
              </h2>
              <ProblemBadge problems={problems.filter((p) => sectionOf(p.pointer) === section)} />
            </div>
            <ProblemsProvider problems={problems}>
              {yaml ? (
                <YamlPanel key={`${section}:${past.length}:${future.length}`} label={`${meta.label} as YAML`} pointer={`/${key}`} value={doc[key]} onApply={(v) => edit((d) => applySection(d, key, v))} />
              ) : section === "overview" ? (
                <Overview doc={doc} refs={refs} edit={edit} general={general} />
              ) : section === "flags" ? (
                <Flags doc={doc} edit={edit} />
              ) : section === "plot" ? (
                <PlotSection doc={doc} refs={refs} edit={edit} current={currentArc} select={(id) => setArc(id)} reveal={reveal} />
              ) : section === "locations" ? (
                <Locations doc={doc} refs={refs} edit={edit} current={currentLocation} select={(id) => setLocation(id)} reveal={reveal} />
              ) : section === "npcs" ? (
                <Npcs doc={doc} refs={refs} edit={edit} />
              ) : (
                <EntitiesSection doc={doc} edit={edit} />
              )}
            </ProblemsProvider>
          </div>
        </section>

        {playtest && (
          <aside id="editor-playtest" aria-labelledby="editor-playtest-title" className="relative flex w-full shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-rule bg-page sm:w-1/2 lg:w-[28rem] xl:w-[34rem] 2xl:w-[40rem]">
            <div className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2 border-b border-rule bg-page pl-4 pr-1">
              <h2 id="editor-playtest-title" className="text-heading font-semibold">
                Playtest
              </h2>
              <span className="text-caption text-muted">No models; the rules run in this browser.</span>
              <IconButton dense label="Close playtest" icon={<X {...ICON_DENSE} />} onClick={() => setPlaytest(false)} className="ml-auto" />
            </div>
            <div className="p-4">
              <Playtest doc={doc} settings={settings} onShowProblems={() => setProblemsOpen(true)} />
            </div>
          </aside>
        )}
      </div>

      {problemsOpen && <ProblemsPanel id={PROBLEMS_ID} problems={problems} checking={checking} selected={picked} onSelect={jump} onClose={() => setProblemsOpen(false)} />}

      {/* Status bar */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-t border-rule bg-page px-2 text-caption text-muted">
        <button
          type="button"
          aria-expanded={problemsOpen}
          aria-controls={PROBLEMS_ID}
          title={problemsOpen ? "Hide problems" : "Show problems"}
          onClick={() => setProblemsOpen(!problemsOpen)}
          className="inline-flex h-7 items-center gap-2 rounded-control px-2 text-ink hover:bg-desk"
        >
          <span className="sr-only">Problems: </span>
          <span className={cx("inline-flex items-center gap-1 tabular", errors.length ? "text-danger" : "text-muted")}>
            <CircleAlert {...ICON_DENSE} />
            {errors.length}
            <span className="sr-only"> error{errors.length === 1 ? "" : "s"},</span>
          </span>
          <span className={cx("inline-flex items-center gap-1 tabular", warnings ? "text-warning" : "text-muted")}>
            <TriangleAlert {...ICON_DENSE} />
            {warnings}
            <span className="sr-only"> warning{warnings === 1 ? "" : "s"}</span>
          </span>
          <span aria-hidden="true" className="hidden sm:inline">
            {counts(problems) === "No problems" ? "No problems" : "Problems"}
          </span>
          {problemsOpen ? <ChevronDown {...ICON_DENSE} className="text-muted" /> : <ChevronUp {...ICON_DENSE} className="text-muted" />}
        </button>
        <span className="truncate">{checking}</span>
        {publishWhy && <span className="ml-auto hidden truncate pr-2 md:inline">{publishWhy}</span>}
      </div>

      <Sheet open={outlineOpen} onClose={() => setOutlineOpen(false)} title="Sections" side="bottom">
        <nav aria-label="Sections">{outline}</nav>
      </Sheet>

      <Sheet open={snapshotsOpen} onClose={() => setSnapshotsOpen(false)} title="Snapshots">
        <div className="flex flex-col gap-5">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = snapshotName.trim();
              if (!name) return;
              edit((d) => void d.editor.snapshots.push({ name: name.slice(0, 80), saved_at: new Date().toISOString(), document: content(d) }));
              setSnapshotName("");
            }}
          >
            <label htmlFor="snapshot-name" className="text-label font-medium">
              Snapshot name
            </label>
            <p id="snapshot-name-hint" className="text-caption text-muted">
              A copy of the whole draft, kept with it, that you can restore later. Snapshots count toward the draft&rsquo;s 2 MB limit; the draft is {megabytes(size)}.
            </p>
            <div className="flex gap-2">
              <TextInput id="snapshot-name" aria-describedby="snapshot-name-hint" value={snapshotName} maxLength={80} onChange={(e) => setSnapshotName(e.target.value)} />
              <Button type="submit" disabled={!snapshotName.trim()}>
                Take snapshot
              </Button>
            </div>
          </form>
          {size >= NEAR_MAX && (
            <Notice tone="warning" live>
              The draft is {megabytes(size)} of the 2 MB it may hold, and saving stops at the limit. Delete snapshots you no longer need.
            </Notice>
          )}
          {doc.editor.snapshots.length === 0 ? (
            <p className="text-caption text-muted">No snapshots yet.</p>
          ) : (
            <ul className="divide-y divide-rule rounded-card border border-rule">
              {doc.editor.snapshots.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-body">{s.name}</p>
                    <p className="text-caption text-muted">{new Date(s.saved_at).toLocaleString()}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button variant="secondary" size="sm" aria-label={`Restore ${s.name}`} onClick={() => edit((d) => Object.assign(d, structuredClone(s.document as object)))}>
                      Restore
                    </Button>
                    <RemoveButton label={`Delete snapshot ${s.name}`} onClick={() => edit((d) => void d.editor.snapshots.splice(i, 1))} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </div>
  );
}
