"use client";
// Playtest (app-flow.md, Adventure editor: Playtest): the engine and rules system run in the browser
// against the draft and its required settings, with no models. An event palette fires actions as a
// chosen character; a state inspector shows flags, stages, inventories, and every entity, hidden ones
// included; a trace lists the triggers each action matched and fired, and for a matched trigger that
// did not fire, the parts of its `when` that failed (lib/engine/why.ts); Start from here sets stages and
// flags; a party selector plays up to the adventure's maximum; Preview 20 seeds draws generated maps.
// Clicking a cell of the acting character's map moves to what the cell holds (lib/map/click.ts).
// It opens as a pane beside the editor: setup, actions, the trace, and the state, stacked, side by side
// when the pane is wide.
import { CircleAlert, CircleCheck, CircleDot, CircleSlash, Play, RotateCcw } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import type { AdventureBundle, GeneratedLocation } from "@/lib/bundle/adventure";
import type { SettingBundle } from "@/lib/bundle/setting";
import { advance, labelsFor, startInstance, submit, view, type Bundles, type GameEvent, type State } from "@/lib/engine";
import { whyHeld } from "@/lib/engine/why";
import { generate } from "@/lib/generator";
import { cellMove } from "@/lib/map/click";
import { compileDraft } from "@/lib/materials";
import { templateNarration } from "@/lib/narrator/template";
import { Rng } from "@/lib/rng";
import { SYSTEMS } from "@/lib/systems";
import { denseInput, denseSelect, Labelled } from "./controls";
import type { Doc } from "./doc";

type Call = { tool: string; args: Record<string, unknown> };
interface TraceEntry {
  actor: string;
  label: string;
  ok: boolean;
  error?: string;
  fired: string[];
  /** Triggers whose event matched but which did not fire, with why: the failed conditions, or `once`. */
  held: { id: string; why: string[] }[];
  changes: string[];
  narration: string | null;
}

const chip = buttonClass("secondary", "sm", "max-w-full overflow-hidden text-ellipsis");

/** A titled group of the pane. */
function Group({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex flex-col gap-2", className)}>
      <h3 className="text-label font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function matches(on: Record<string, unknown>, e: GameEvent): boolean {
  const p = e as unknown as Record<string, unknown>;
  return Object.entries(on).every(([k, v]) => p[k] === v);
}

function testSheet(name: string, n: number) {
  return { name, role: ["fighter", "spy", "wizard", "doctor"][n % 4], hp: { value: 10, max: 10 }, ap: 10, abilities: [], inventory: [], status: "active" };
}

export function Playtest({ doc, settings, onShowProblems }: { doc: Doc; settings: SettingBundle[]; onShowProblems?: () => void }) {
  const compiled = useMemo(() => compileDraft(doc, settings), [doc, settings]);
  const adventure = compiled.bundle as AdventureBundle | undefined;
  const bundles: Bundles | null = useMemo(() => (adventure ? { system: SYSTEMS[adventure.manifest.system.id]!.configure(adventure.manifest.system.modules), settings, adventure } : null), [adventure, settings]);
  const [party, setParty] = useState(1);
  const [seed, setSeed] = useState(1);
  const [stages, setStages] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [state, setState] = useState<State | null>(null);
  const [actor, setActor] = useState("pc_1");
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ location: string; results: { seed: number; ok: boolean; text: string }[] } | null>(null);

  if (!compiled.ok || !bundles || !adventure) {
    const n = compiled.diagnostics.length;
    return (
      <Notice tone="danger" title="The draft does not compile">
        <p>
          Fix {n} problem{n === 1 ? "" : "s"} to playtest.
        </p>
        {onShowProblems && (
          <Button variant="quiet" size="sm" className="-ml-3 mt-1" onClick={onShowProblems}>
            Show problems
          </Button>
        )}
      </Notice>
    );
  }
  const max = adventure.manifest.players[1];

  const begin = () => {
    const characters = Array.from({ length: party }, (_, i) => ({ id: `pc_${i + 1}`, sheet: testSheet(`Tester ${i + 1}`, i) as never }));
    const r = startInstance({ bundles, characters, seed: BigInt(seed) });
    if (!r.ok) return setTrace([{ actor: "", label: "start", ok: false, error: `${r.error.code}: ${r.error.detail}`, fired: [], held: [], changes: [], narration: null }]);
    const s = r.state;
    for (const [arc, stage] of Object.entries(stages)) if (stage) s.stages[arc] = stage;
    for (const [flag, raw] of Object.entries(flags)) {
      if (raw === "") continue;
      s.flags[flag] = raw === "true" ? true : raw === "false" ? false : Number.isNaN(Number(raw)) ? raw : Number(raw);
    }
    setState(s);
    setActor("pc_1");
    setNote(null);
    setTrace([{ actor: "", label: "start", ok: true, fired: r.events.filter((e) => e.type === "trigger_fired").map((e) => String((e as { trigger?: string }).trigger)), held: [], changes: [], narration: templateNarration(r.events, labelsFor([s], bundles)) }]);
  };

  const run = (label: string, call: Call | "advance") => {
    if (!state) return;
    const rng = new Rng(BigInt(seed), state.rng_counter);
    const r = call === "advance" ? advance(state, bundles, rng) : submit(state, bundles, actor, call, rng);
    if (!r.ok) return setTrace((t) => [...t, { actor, label, ok: false, error: `${r.error.code}: ${r.error.detail}`, fired: [], held: [], changes: [], narration: null }]);
    const fired = r.events.filter((e) => e.type === "trigger_fired").map((e) => String((e as { trigger?: string }).trigger));
    const held = adventure.arcs.flatMap((a) =>
      a.triggers.flatMap((t) => {
        if (fired.includes(t.id)) return [];
        const event = r.events.find((e) => matches(t.on as Record<string, unknown>, e));
        return event ? [{ id: t.id, why: whyHeld(t, event, state, r.state, bundles) }] : [];
      }),
    );
    const changes = r.events.filter((e) => e.type === "flag_set" || e.type === "stage_set" || e.type === "instance_ended").map((e) => JSON.stringify(e));
    setState(r.state);
    setTrace((t) => [...t, { actor, label, ok: true, fired, held, changes, narration: templateNarration(r.events, labelsFor([r.state, state], bundles)) }]);
  };

  const previewSeeds = (location: string, spec: GeneratedLocation) => {
    const results = Array.from({ length: 20 }, (_, i) => {
      const g = generate(spec, settings, adventure, bundles.system.SPATIAL.metric, BigInt(i + 1));
      return g.ok ? { seed: i + 1, ok: true, text: g.location.rows.join("\n") } : { seed: i + 1, ok: false, text: g.error };
    });
    setPreview({ location, results });
  };

  const v = state && state.characters[actor] && !state.ended ? view(state, bundles, actor) : null;

  const clickCell = (x: number, y: number) => {
    if (!v) return;
    const m = cellMove(v, [x, y]);
    if (!m.ok) return setNote(m.note);
    setNote(null);
    run(`move to ${m.label} (clicked ${x},${y})`, m.call);
  };
  const generated = Object.entries(adventure.locations).filter(([, l]) => l.kind === "generated") as [string, GeneratedLocation][];



  const stageOf = (a: string) => state?.stages[a];
  return (
    <div className="@container flex flex-col gap-6">
      <Group title="Start from">
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4">
          <Labelled label="Party">
            <select value={party} onChange={(e) => setParty(Number(e.target.value))} className={denseSelect}>
              {Array.from({ length: max }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Seed">
            <input type="number" min={0} value={seed} onChange={(e) => setSeed(Math.max(0, Number(e.target.value)))} className={cx(denseInput, "tabular")} />
          </Labelled>
          {adventure.arcs.map((a) => (
            <Labelled key={a.id} label={<span className="font-mono">{a.id}</span>}>
              <select value={stages[a.id] ?? ""} onChange={(e) => setStages({ ...stages, [a.id]: e.target.value })} className={denseSelect}>
                <option value="">{a.initial} (initial)</option>
                {a.stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Labelled>
          ))}
          {Object.entries(adventure.flags)
            .filter(([, f]) => f.scope !== "character")
            .map(([id, f]) => (
              <Labelled key={id} label={<span className="font-mono">{id}</span>}>
                <input placeholder={String(f.initial)} value={flags[id] ?? ""} onChange={(e) => setFlags({ ...flags, [id]: e.target.value })} className={denseInput} />
              </Labelled>
            ))}
        </div>
        <div>
          <Button size="sm" icon={state ? <RotateCcw {...ICON_DENSE} /> : <Play {...ICON_DENSE} />} onClick={begin}>
            {state ? "Start again from here" : "Start from here"}
          </Button>
        </div>
      </Group>

      {state && (
        <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-6">
            <Group title="Act">
              <div className="flex flex-wrap items-center gap-2 text-label">
                <label htmlFor="playtest-actor">Act as</label>
                <select
                  id="playtest-actor"
                  value={actor}
                  onChange={(e) => {
                    setActor(e.target.value);
                    setNote(null);
                  }}
                  className={denseSelect}
                >
                  {Object.keys(state.characters).map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>
                {state.ended && (
                  <span role="status" className="font-medium text-accent">
                    Ended: {state.ended.ending ?? "no ending"}
                  </span>
                )}
              </div>
              {v && (
                <div className="flex flex-col gap-3">
                  {v.destinations.length > 0 && (
                    <div role="group" aria-label="Move" className="flex flex-wrap gap-1.5">
                      {v.destinations.map((d) => (
                        <button key={d.id} type="button" className={chip} onClick={() => run(`move to ${d.label}`, { tool: "move", args: { to_id: d.id } })}>
                          Move: {d.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {v.visible.length > 0 && (
                    <div role="group" aria-label="Things in view" className="flex flex-wrap gap-1.5">
                      {v.visible.flatMap((e) => [
                        <button key={`x${e.id}`} type="button" className={chip} onClick={() => run(`examine ${e.label}`, { tool: "examine", args: { target_id: e.id } })}>
                          Examine {e.label}
                        </button>,
                        ...(e.kind === "creature" ? [<button key={`a${e.id}`} type="button" className={chip} onClick={() => run(`attack ${e.label}`, { tool: "attack", args: { target_id: e.id } })}>Attack {e.label}</button>] : []),
                        ...(e.kind === "item" && e.in_reach ? [<button key={`t${e.id}`} type="button" className={chip} onClick={() => run(`take ${e.label}`, { tool: "take", args: { entity_id: e.id } })}>Take {e.label}</button>] : []),
                        ...(e.verbs ?? []).map((verb) => (
                          <button key={`${verb}${e.id}`} type="button" className={chip} onClick={() => run(`${verb} ${e.label}`, { tool: "interact", args: { target_id: e.id, verb } })}>
                            {verb} {e.label}
                          </button>
                        )),
                      ])}
                    </div>
                  )}
                  <div role="group" aria-label="People and turn" className="flex flex-wrap gap-1.5">
                    {v.actions.npcs.flatMap((n) => [
                      <button key={n.id} type="button" className={chip} onClick={() => run(`talk to ${n.name}`, { tool: "talk", args: { npc_id: n.id, utterance: "Hello." } })}>
                        Talk: {n.name}
                      </button>,
                      ...n.topics.map((t) => (
                        <button key={`${n.id}.${t.id}`} type="button" className={chip} onClick={() => run(`ask ${n.name} about ${t.label}`, { tool: "talk", args: { npc_id: n.id, topic_id: t.id, utterance: "Tell me." } })}>
                          Ask {n.name}: {t.label}
                        </button>
                      )),
                    ])}
                    {v.pending_choice?.options.map((o) => (
                      <button key={o.id} type="button" className={chip} onClick={() => run(`choose ${o.label}`, { tool: "choose", args: { option_id: o.id } })}>
                        Choose: {o.label}
                      </button>
                    ))}
                    <button type="button" className={chip} onClick={() => run("search", { tool: "search", args: {} })}>
                      Search
                    </button>
                    <button type="button" className={chip} onClick={() => run("wait", { tool: "wait", args: {} })}>
                      Wait
                    </button>
                    <button type="button" className={chip} onClick={() => run("advance the round", "advance")}>
                      Advance round
                    </button>
                  </div>
                </div>
              )}
            </Group>

            <Group title={`Trace · ${trace.length} step${trace.length === 1 ? "" : "s"}`}>
              <div role="log" aria-label="Playtest trace">
              <ol className="flex flex-col divide-y divide-rule rounded-card border border-rule">
                {trace.map((t, i) => (
                  <li key={i} className="flex gap-3 px-3 py-2">
                    <span className="w-5 shrink-0 pt-px text-right text-caption text-muted tabular">{i + 1}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className={cx("flex items-start gap-1.5 text-label", t.ok ? "text-ink" : "text-danger")}>
                        {!t.ok ? <CircleAlert {...ICON_DENSE} className="mt-0.5 shrink-0" /> : t.fired.length ? <CircleCheck {...ICON_DENSE} className="mt-0.5 shrink-0 text-success" /> : <CircleDot {...ICON_DENSE} className="mt-0.5 shrink-0 text-muted" />}
                        <span>
                          <span className="sr-only">{!t.ok ? "Rejected: " : t.fired.length ? "Fired triggers: " : "No trigger fired: "}</span>
                          {t.actor && <span className="font-mono">{t.actor}: </span>}
                          {t.label}
                          {t.error && ` — ${t.error}`}
                        </span>
                      </p>
                      {t.fired.length > 0 && (
                        <p className="text-caption text-success">
                          Fired: <span className="font-mono">{t.fired.join(", ")}</span>
                        </p>
                      )}
                      {t.held.map((h) => (
                        <p key={h.id} className="flex items-start gap-1.5 text-caption text-warning">
                          <CircleSlash {...ICON_DENSE} className="mt-px size-3.5 shrink-0" />
                          <span>
                            Matched, did not fire: <span className="font-mono">{h.id}</span>
                            {h.why.length > 0 && ` — ${h.why.join("; ")}`}
                          </span>
                        </p>
                      ))}
                      {t.changes.map((c, j) => (
                        <p key={j} className="break-all font-mono text-caption text-muted">
                          {c}
                        </p>
                      ))}
                      {t.narration && <p className="font-prose text-prose-sm italic">{t.narration}</p>}
                    </div>
                  </li>
                ))}
              </ol>
              </div>
            </Group>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Group title="State">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-label">
                <dt className="text-muted">Stages</dt>
                <dd className="font-mono text-caption">
                  {Object.keys(state.stages)
                    .map((a) => `${a} = ${stageOf(a)}`)
                    .join(", ") || "none"}
                </dd>
                <dt className="text-muted">Flags</dt>
                <dd className="font-mono text-caption">
                  {Object.entries(state.flags)
                    .map(([f, x]) => `${f} = ${String(x)}`)
                    .join(", ") || "none"}
                </dd>
                {Object.entries(state.characters).map(([id, c]) => (
                  <div key={id} className="contents">
                    <dt className="font-mono text-muted">{id}</dt>
                    <dd>
                      In {c.location} at {c.at.join(",")}, {(c.sheet as { hp?: { value: number } }).hp?.value} HP, carrying {c.items.map((i) => state.entities[i]?.ref ?? i).join(", ") || "nothing"}
                    </dd>
                  </div>
                ))}
              </dl>
              <details className="rounded-card border border-rule px-3 py-2">
                <summary className="cursor-pointer text-label">Every entity ({Object.keys(state.entities).length})</summary>
                <ul className="mt-2 flex flex-col gap-0.5 font-mono text-caption">
                  {Object.entries(state.entities).map(([id, e]) => (
                    <li key={id}>
                      {id} {e.ref} {e.location ?? `carried by ${e.carrier}`} {e.at?.join(",")} {e.kind === "door" ? (e.open ? "open" : e.locked ? "locked" : "closed") : ""}
                      {(e as { hidden?: unknown }).hidden ? " hidden" : ""}
                    </li>
                  ))}
                </ul>
              </details>
            </Group>
            <Group title="Maps">
              {Object.entries(state.locations).map(([id, l]) => {
                const glyph = (ch: string, x: number, y: number) => {
                  const pc = Object.entries(state.characters).find(([, c]) => c.location === id && c.at[0] === x && c.at[1] === y);
                  if (pc) return pc[0].slice(-1);
                  const e = Object.values(state.entities).find((en) => en.location === id && en.at && en.at[0] === x && en.at[1] === y);
                  return e ? (e.kind === "creature" ? "c" : e.kind === "door" ? (e.open ? "/" : "+") : "*") : ch;
                };
                // Only the acting character's map takes clicks; its cells resolve against that character's view.
                // The Move buttons above are the keyboard route to the same calls.
                const clickable = v !== null && v.character.location === id;
                return (
                  <details key={id} open={state.characters[actor]?.location === id} className="rounded-card border border-rule px-3 py-2">
                    <summary className="cursor-pointer text-label">
                      <span className="font-mono">{id}</span>
                    </summary>
                    {clickable && <p className="mt-1 text-caption text-muted">Click a cell to move {actor} to the entity, door, link, or room on it.</p>}
                    <pre className="mt-2 overflow-auto font-mono text-[10px] leading-3">
                      {clickable
                        ? l.rows.map((row, y) => (
                            <span key={y}>
                              {[...row].map((ch, x) => (
                                <span key={x} title={`${x},${y}`} className="cursor-pointer hover:bg-accent-soft" onClick={() => clickCell(x, y)}>
                                  {glyph(ch, x, y)}
                                </span>
                              ))}
                              {"\n"}
                            </span>
                          ))
                        : l.rows.map((row, y) => [...row].map((ch, x) => glyph(ch, x, y)).join("")).join("\n")}
                    </pre>
                    {clickable && note && (
                      <p role="status" className="text-caption text-warning">
                        {note}
                      </p>
                    )}
                  </details>
                );
              })}
            </Group>
          </div>
        </div>
      )}

      {generated.length > 0 && (
        <Group title="Generated locations">
          <div className="flex flex-wrap gap-2">
            {generated.map(([id, spec]) => (
              <button key={id} type="button" className={chip} onClick={() => previewSeeds(id, spec)}>
                Preview 20 seeds: {id}
              </button>
            ))}
          </div>
          {preview && (
            <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
              {preview.results.map((r) => (
                <div key={r.seed} className={cx("rounded-card border p-2", r.ok ? "border-rule" : "border-danger")}>
                  <p className="text-caption">
                    Seed {r.seed}: {r.ok ? "ok" : "failed"}
                  </p>
                  <pre className="overflow-auto font-mono text-[6px] leading-[6px]">{r.text}</pre>
                </div>
              ))}
            </div>
          )}
        </Group>
      )}
    </div>
  );
}
