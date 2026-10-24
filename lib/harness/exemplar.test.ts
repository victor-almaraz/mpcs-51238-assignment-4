// The exemplar adventure (briefs/example-adventure.md): sunken_archive 1.0.0 on lantern_coast. The
// golden scenarios play it to every ending; these tests cover the required mechanics the scenarios do
// not reach, and check the coverage list against the pack files.

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Cell } from "../grid";
import { compileAdventure, compileSetting } from "../materials";
import { readPackDir } from "../materials/fs";
import { Rng } from "../rng";
import { CADMIUM } from "../systems/cadmium";
import { begin, step, type Session } from "./harness";
import { exemplarBundles } from "./scenarios";
import { parse } from "yaml";

const MATERIALS = join(process.cwd(), "materials");

function party(n: number): Session {
  const sheet = CADMIUM.configure(["armor", "stash"]).create_character("Wren", { role: "fighter", abilities: ["a", "b", "c", "d", "e", "f"].map((a) => `starter:${a}`) }, new Rng(0n));
  const characters = Array.from({ length: n }, (_, i) => ({ id: `c_${i + 1}`, user_id: `u_${i + 1}`, sheet: { ...sheet, name: `Wren ${i + 1}`, abilities: [] } }));
  return begin(exemplarBundles(), 11, characters);
}

function place(s: Session, id: string, location: string, at: Cell): void {
  Object.assign(s.state.characters[id]!, { location, at });
}

function act(s: Session, actor: string, tool: string, args: Record<string, unknown>) {
  const out = step(s, { actor, tool, args });
  if (!("version" in out)) throw new Error(`${tool} ${JSON.stringify(args)}: ${JSON.stringify(out)}`);
  const events = out.events as { type: string; [k: string]: unknown }[];
  // With several characters the round waits for every declaration; close it.
  if (s.state.round.declarations?.[actor]) events.push(...((step(s, { advance: true }) as { events: typeof events }).events ?? []));
  return events;
}

function rejection(s: Session, actor: string, tool: string, args: Record<string, unknown>): string | undefined {
  const out = step(s, { actor, tool, args }) as { error?: { code: string } };
  if (s.state.round.declarations?.[actor]) step(s, { advance: true });
  return out.error?.code;
}

const purse = (s: Session, id: string) => s.state.character_flags[id]!.purse;
const holding = (s: Session, id: string, ref: string) => Object.keys(s.state.entities).find((e) => s.state.entities[e]!.carrier === id && s.state.entities[e]!.ref === ref);
const talk = (s: Session, actor: string, npc: string, topic: string) => act(s, actor, "talk", { npc_id: npc, topic_id: topic, utterance: "Hello." });

describe("exemplar mechanics", () => {
  it("compiles both packs without diagnostics", () => {
    const coast = compileSetting(readPackDir(join(MATERIALS, "lantern_coast/pack")));
    expect(coast.diagnostics).toEqual([]);
    expect(compileAdventure(readPackDir(join(MATERIALS, "sunken_archive/pack")), [coast.bundle!]).diagnostics).toEqual([]);
  });

  it("pays errands to everyone in the room, charges only the buyer, and widens a stash", () => {
    const s = party(2);
    place(s, "c_1", "orvelle", [6, 10]);
    talk(s, "c_1", "tilo", "errand");
    expect(holding(s, "c_1", "sunken_archive:cobbler_parcel")).toBeDefined();
    place(s, "c_1", "vessaro", [12, 2]);
    place(s, "c_2", "vessaro", [12, 3]);
    talk(s, "c_1", "lydia", "parcel");
    expect([purse(s, "c_1"), purse(s, "c_2")]).toEqual([20, 20]);
    expect(holding(s, "c_1", "sunken_archive:lydia_reply")).toBeDefined();
    // Affordability: c_2 cannot buy a harpoon for 32.
    place(s, "c_2", "vessaro", [4, 2]);
    expect(rejection(s, "c_2", "talk", { npc_id: "gerasimos", topic_id: "harpoon", utterance: "The harpoon." })).toBe("requirement_unmet");
    place(s, "c_1", "vessaro", [4, 3]);
    talk(s, "c_1", "gerasimos", "satchel");
    expect([purse(s, "c_1"), purse(s, "c_2")]).toEqual([12, 20]);
    const sheet = () => s.state.characters.c_1!.sheet;
    expect(holding(s, "c_1", "coast:canvas_satchel")).toBeDefined();
    expect(CADMIUM.configure(["armor", "stash"]).can_carry(sheet() as never, Array.from({ length: 15 }, (_, i) => ({ ref: `x:${i}`, stats: {} })).concat([{ ref: "coast:canvas_satchel", stats: { slots: 4 } }]) as never)).toBe(true);
  });

  it("opens the guild strongbox only for a writ holder", () => {
    const s = party(1);
    act(s, "c_1", "move", { to_id: "plaza_lamp" });
    act(s, "c_1", "take", { entity_id: "plaza_lamp" });
    place(s, "c_1", "orvelle", [2, 1]);
    expect(rejection(s, "c_1", "give", { item_id: "plaza_lamp", target_id: "strongbox" })).toBe("requirement_unmet");
    talk(s, "c_1", "hallek", "contract");
    act(s, "c_1", "give", { item_id: "plaza_lamp", target_id: "strongbox" });
    expect(s.state.entities.strongbox!.contents).toEqual(["plaza_lamp"]);
    expect(s.state.flags.path).toBe("contract");
  });

  it("parts the fog only for a carried, lit lamp", () => {
    const s = party(1);
    act(s, "c_1", "move", { to_id: "plaza_lamp" });
    act(s, "c_1", "take", { entity_id: "plaza_lamp" });
    act(s, "c_1", "use", { item_id: "plaza_lamp" });
    expect(s.state.entities.plaza_lamp!.lit).toBe(false);
    place(s, "c_1", "boat_deck", [21, 4]);
    expect(rejection(s, "c_1", "interact", { target_id: "fog_stair", verb: "open" })).toBe("requirement_unmet");
    act(s, "c_1", "use", { item_id: "plaza_lamp" });
    act(s, "c_1", "interact", { target_id: "fog_stair", verb: "open" });
    expect(s.state.entities.fog_stair!.open).toBe(true);
  });

  it("delivers the instrument case with item_given, and turns the rent collectors hostile", () => {
    const s = party(1);
    place(s, "c_1", "roccavela", [12, 3]);
    talk(s, "c_1", "kleon", "case");
    const box = holding(s, "c_1", "sunken_archive:instrument_case")!;
    place(s, "c_1", "lamp_shoal", [11, 2]);
    const events = act(s, "c_1", "give", { item_id: box, target_id: "lamp_cabinet" });
    expect(events).toContainEqual(expect.objectContaining({ type: "trigger_fired", trigger: "case_delivered" }));
    expect(purse(s, "c_1")).toBe(20);
    expect(s.state.entities.thug_1!.hostile).toBeUndefined();
    talk(s, "c_1", "phaidon", "rent");
    expect([s.state.entities.thug_1!.hostile, s.state.entities.thug_2!.hostile, s.state.mode]).toEqual([true, true, "combat"]);
  });

  it("moves the troupe and the fortune teller between locations", () => {
    const s = party(1);
    act(s, "c_1", "move", { to_id: "x_salinara" });
    expect(s.state.characters.c_1!.location).toBe("salinara");
    expect(["aristea", "wolfram", "pelagia"].map((n) => s.state.entities[n]!.location)).toEqual(["salinara", "salinara", "salinara"]);
    place(s, "c_1", "roccavela", [2, 5]);
    act(s, "c_1", "move", { to_id: "kapelis" });
    expect(s.state.entities.kassiani!.location).toBe("roccavela");
  });

  // An item put straight into a character's hands, standing in for the route that raises it.
  const grant = (s: Session, id: string, ref: string) => {
    s.state.entities[`granted_${ref.replace(":", "_")}`] = { ref, kind: "item", conditions: [], carrier: id } as never;
    s.state.characters[id]!.items.push(`granted_${ref.replace(":", "_")}`);
  };

  // Beside the keeper, with a lit lamp to see her by in the dark holds.
  const atKeeper = (s: Session) => {
    act(s, "c_1", "move", { to_id: "plaza_lamp" });
    act(s, "c_1", "take", { entity_id: "plaza_lamp" });
    const keeper = s.state.entities.vantane!;
    place(s, "c_1", keeper.location!, [keeper.at![0] + 1, keeper.at![1]]);
  };

  it.each([
    ["escaped", "contract", false, "coda_escaped_paid"],
    ["escaped", "contract", true, "coda_escaped_refused"],
    ["escaped", "rumor", false, "coda_escaped_rumor"],
    ["archive_sealed", "contract", true, "coda_sealed_refused"],
    ["archive_sealed", "rumor", true, "coda_sealed_rumor"],
  ] as const)("ends %s on the %s path, ward sealed %s, with %s", (ending, path, sealed, coda) => {
    const s = party(1);
    Object.assign(s.state.flags, { path, ward_sealed: sealed, ring_taken: sealed });
    let events;
    if (ending === "escaped") {
      grant(s, "c_1", "sunken_archive:book_of_weeping");
      place(s, "c_1", "perpetua_deck", [9, 2]);
      if (!s.state.entities.chart_door!.open) act(s, "c_1", "interact", { target_id: "chart_door", verb: "open" });
      events = act(s, "c_1", "move", { to_id: "mooring" });
    } else {
      atKeeper(s);
      events = talk(s, "c_1", "vantane", "seal");
    }
    const fired = events.filter((e) => e.type === "trigger_fired").map((e) => e.trigger as string);
    expect(fired.filter((t) => t.startsWith("coda_"))).toEqual([coda]);
    expect(s.state.ended).toEqual({ ending });
  });

  it("trades a ration for the keeper's account of the ring", () => {
    const s = party(1);
    atKeeper(s);
    expect(s.state.flags.clues).toBe(0);
    expect(rejection(s, "c_1", "talk", { npc_id: "vantane", topic_id: "ring", utterance: "The ring." })).toBe("requirement_unmet");
    if (!holding(s, "c_1", "coast:ration")) grant(s, "c_1", "coast:ration");
    talk(s, "c_1", "vantane", "ration");
    expect([holding(s, "c_1", "coast:ration"), s.state.flags.keeper_fed]).toEqual([undefined, true]);
    talk(s, "c_1", "vantane", "ring");
    talk(s, "c_1", "vantane", "plan");
    expect(s.state.flags.ward_known).toBe(true);
    expect(rejection(s, "c_1", "talk", { npc_id: "vantane", topic_id: "visitor", utterance: "The visitor." })).toBe("requirement_unmet");
  });
});

// The brief's required coverage, checked against the pack sources.
describe("exemplar coverage", () => {
  const files = [...readPackDir(join(MATERIALS, "sunken_archive/pack")), ...readPackDir(join(MATERIALS, "lantern_coast/pack"))]
    .filter(([p]) => p.endsWith(".yaml"))
    .map(([path, text]) => ({ path, data: parse(typeof text === "string" ? text : new TextDecoder().decode(text)) as unknown }));
  const nodes: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      nodes.push(v as Record<string, unknown>);
      Object.values(v).forEach(walk);
    }
  };
  files.forEach((f) => walk(f.data));
  const triggers = nodes.filter((n) => typeof n.id === "string" && n.on && typeof n.on === "object") as { on: Record<string, unknown>; when?: unknown; effects: unknown[]; narrate?: string }[];
  const json = JSON.stringify(files.map((f) => f.data));

  it.each([
    ["a door whose lock combines has_item and illumination", () => nodes.some((n) => n.kind === "door" && JSON.stringify(n.lock ?? "").includes("has_item") && JSON.stringify(n.lock).includes("illumination"))],
    ["a door with both lock and system_stats", () => nodes.some((n) => n.kind === "door" && n.lock && n.system_stats)],
    ["containers with capacity, one with a lock", () => nodes.some((n) => n.kind === "container" && n.capacity && n.lock)],
    ["armor and stash items", () => nodes.some((n) => (n.system_stats as { armor?: number })?.armor) && nodes.some((n) => (n.system_stats as { slots?: number })?.slots)],
    ["a currency with a denomination of value 1", () => json.includes('"currency":{"id":"floret"') && json.includes('"value":1')],
    ["income with target: room", () => nodes.some((n) => (n.add_flag as { target?: string })?.target === "room")],
    ["set_hostile and move_entity to a qualified room", () => json.includes('"set_hostile"') && nodes.some((n) => typeof (n.move_entity as { room?: string })?.room === "string" && (n.move_entity as { room: string }).room.includes("."))],
    ["a generated alias in trigger effects", () => json.includes('"room":"perpetua_holds.box_folio"')],
    ["spawn with at, then start_combat", () => triggers.some((t) => JSON.stringify(t.effects).includes('"at"') && JSON.stringify(t.effects).includes("start_combat"))],
    ["near in a trigger's when", () => triggers.some((t) => JSON.stringify(t.when ?? "").includes('"near"'))],
    ["a trigger that omits a payload key to match many", () => triggers.some((t) => t.on.type === "talked" && t.on.topic && !t.on.npc)],
    ["a reveal of a hidden entity and of a secret", () => json.includes('"reveal":{"target"') && json.includes('"reveal":{"secret"')],
  ])("has %s", (_, check) => {
    expect(check()).toBe(true);
  });

  it("triggers on every required event type, with moved carrying a location", () => {
    const types = new Set(triggers.map((t) => t.on.type));
    for (const t of ["interacted", "item_taken", "item_given", "talked", "moved", "died"]) expect(types).toContain(t);
    expect(triggers.some((t) => t.on.type === "moved" && t.on.location)).toBe(true);
  });

  it("keeps narration guidance within 500 characters", () => {
    const texts = nodes.flatMap((n) => [n.narrate, n.brief].filter((t): t is string => typeof t === "string"));
    const secrets = nodes.flatMap((n) => (n.secrets ? Object.values(n.secrets as Record<string, string>) : []));
    expect(texts.length).toBeGreaterThan(100);
    for (const t of [...texts, ...secrets]) expect(t.length).toBeLessThanOrEqual(500);
  });
});

describe("exemplar view", () => {
  it("marks hostile creatures, and only those", () => {
    const s = party(1);
    place(s, "c_1", "lamp_shoal", [11, 2]);
    const hostile = (id: string) => (step(s, { view: "c_1" }) as { view: { visible: { id: string; hostile?: true }[] } }).view.visible.find((e) => e.id === id)?.hostile;
    expect([hostile("thug_1"), hostile("phaidon")]).toEqual([undefined, undefined]);
    talk(s, "c_1", "phaidon", "rent");
    expect(hostile("thug_1")).toBe(true);
  });
});
