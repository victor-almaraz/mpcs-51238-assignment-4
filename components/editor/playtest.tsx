"use client";
// Playtest (app-flow.md, Adventure editor: Playtest): the engine and rules system run in the browser
// against the draft and its required settings, with no models. An event palette fires actions as a
// chosen character; a state inspector shows flags, stages, inventories, and every entity, hidden ones
// included; a trace lists the triggers each action matched and fired, and for a matched trigger that
// did not fire, the parts of its `when` that failed (lib/engine/why.ts); Start from here sets stages and
// flags; a party selector plays up to the adventure's maximum; Preview 20 seeds draws generated maps.
// Clicking a cell of the acting character's map moves to what the cell holds (lib/map/click.ts).
import { useMemo, useState } from "react";
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

const small = "rounded-control border border-border bg-page px-1 font-ui text-caption";
const chip = "rounded-control border border-border px-2 py-0.5 font-ui text-caption hover:bg-accent-soft";

function matches(on: Record<string, unknown>, e: GameEvent): boolean {
  const p = e as unknown as Record<string, unknown>;
  return Object.entries(on).every(([k, v]) => p[k] === v);
}

function testSheet(name: string, n: number) {
  return { name, role: ["fighter", "spy", "wizard", "doctor"][n % 4], hp: { value: 10, max: 10 }, ap: 10, abilities: [], inventory: [], status: "active" };
}

export function Playtest({ doc, settings }: { doc: Doc; settings: SettingBundle[] }) {
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
    return (
      <div className="font-ui text-caption">
        <p className="text-danger">
          Fix {compiled.diagnostics.length} problem{compiled.diagnostics.length === 1 ? "" : "s"} to playtest.
        </p>
      </div>
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

  return (
    <div className="flex flex-col gap-4 font-ui text-caption">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col">
          Party
          <select value={party} onChange={(e) => setParty(Number(e.target.value))} className={small}>
            {Array.from({ length: max }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Seed
          <input type="number" min={0} value={seed} onChange={(e) => setSeed(Math.max(0, Number(e.target.value)))} className={`${small} w-20`} />
        </label>
        {adventure.arcs.map((a) => (
          <label key={a.id} className="flex flex-col">
            {a.id}
            <select value={stages[a.id] ?? ""} onChange={(e) => setStages({ ...stages, [a.id]: e.target.value })} className={small}>
              <option value="">{a.initial} (initial)</option>
              {a.stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        ))}
        {Object.entries(adventure.flags)
          .filter(([, f]) => f.scope !== "character")
          .map(([id, f]) => (
            <label key={id} className="flex flex-col">
              {id}
              <input placeholder={String(f.initial)} value={flags[id] ?? ""} onChange={(e) => setFlags({ ...flags, [id]: e.target.value })} className={`${small} w-20`} />
            </label>
          ))}
        <button type="button" onClick={begin} className="rounded-control bg-accent px-3 py-1 text-page">
          {state ? "Start again from here" : "Start from here"}
        </button>
      </div>

      {state && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="font-ui text-label">
              Act as{" "}
              <select
                value={actor}
                onChange={(e) => {
                  setActor(e.target.value);
                  setNote(null);
                }}
                className={small}
              >
                {Object.keys(state.characters).map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>{" "}
              {state.ended && <span className="text-accent">Ended: {state.ended.ending ?? "no ending"}</span>}
            </p>
            {v && (
              <>
                <div className="flex flex-wrap gap-1">
                  {v.destinations.map((d) => (
                    <button key={d.id} type="button" className={chip} onClick={() => run(`move to ${d.label}`, { tool: "move", args: { to_id: d.id } })}>
                      Move: {d.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
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
                <div className="flex flex-wrap gap-1">
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
              </>
            )}
            <p className="mt-2 font-ui text-label">Trace</p>
            <ol className="flex max-h-96 flex-col gap-2 overflow-auto">
              {trace.map((t, i) => (
                <li key={i} className="border-b border-rule pb-1">
                  <span className={t.ok ? "" : "text-danger"}>
                    {t.actor && `${t.actor}: `}
                    {t.label}
                    {t.error && ` — ${t.error}`}
                  </span>
                  {t.fired.length > 0 && <div className="text-accent">fired: {t.fired.join(", ")}</div>}
                  {t.held.map((h) => (
                    <div key={h.id} className="text-warning">
                      matched, did not fire: <span className="font-mono">{h.id}</span>
                      {h.why.length > 0 && ` — ${h.why.join("; ")}`}
                    </div>
                  ))}
                  {t.changes.map((c, j) => (
                    <div key={j} className="font-mono text-muted">
                      {c}
                    </div>
                  ))}
                  {t.narration && <div className="font-prose italic">{t.narration}</div>}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-ui text-label">State</p>
            <div>
              Stages:{" "}
              {Object.entries(state.stages)
                .map(([a, s]) => `${a} = ${s}`)
                .join(", ") || "none"}
            </div>
            <div>
              Flags:{" "}
              {Object.entries(state.flags)
                .map(([f, x]) => `${f} = ${String(x)}`)
                .join(", ") || "none"}
            </div>
            {Object.entries(state.characters).map(([id, c]) => (
              <div key={id}>
                {id} in {c.location} at {c.at.join(",")}, {(c.sheet as { hp?: { value: number } }).hp?.value} HP, carrying {c.items.map((i) => state.entities[i]?.ref ?? i).join(", ") || "nothing"}
              </div>
            ))}
            <details>
              <summary className="cursor-pointer">Every entity ({Object.keys(state.entities).length})</summary>
              <ul className="font-mono">
                {Object.entries(state.entities).map(([id, e]) => (
                  <li key={id}>
                    {id} {e.ref} {e.location ?? `carried by ${e.carrier}`} {e.at?.join(",")} {e.kind === "door" ? (e.open ? "open" : e.locked ? "locked" : "closed") : ""}
                    {(e as { hidden?: unknown }).hidden ? " hidden" : ""}
                  </li>
                ))}
              </ul>
            </details>
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
                <details key={id} open={state.characters[actor]?.location === id}>
                  <summary className="cursor-pointer">Map: {id}</summary>
                  {clickable && <p className="text-muted">Click a cell to move {actor} to the entity, door, link, or room on it.</p>}
                  <pre className="font-mono text-[10px] leading-3">
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
                  {clickable && note && <p className="text-warning">{note}</p>}
                </details>
              );
            })}
          </div>
        </div>
      )}

      {generated.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-ui text-label">Generated locations</p>
          <div className="flex flex-wrap gap-2">
            {generated.map(([id, spec]) => (
              <button key={id} type="button" className={chip} onClick={() => previewSeeds(id, spec)}>
                Preview 20 seeds: {id}
              </button>
            ))}
          </div>
          {preview && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {preview.results.map((r) => (
                <div key={r.seed} className={`rounded-control border p-1 ${r.ok ? "border-rule" : "border-danger"}`}>
                  <p>
                    Seed {r.seed}: {r.ok ? "ok" : "failed"}
                  </p>
                  <pre className="overflow-auto font-mono text-[6px] leading-[6px]">{r.text}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
