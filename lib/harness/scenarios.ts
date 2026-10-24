// Scripted scenarios: the trial adventure, the guide's sunken_archive, and the exemplar sunken_archive
// with lantern_coast, played to every ending. An autopilot
// authors each scenario's input lines from state once; the lines, and the log they produce, are kept
// as golden files under lib/harness/golden and replayed by the tests.

import { findPath, type Cell } from "../grid";
import { join } from "node:path";
import { compileAdventure, compileSetting, formatDiagnostic } from "../materials";
import { readPackDir } from "../materials/fs";
import { derelictStation, guideAdventure } from "../materials/testing/fixtures";
import { Rng } from "../rng";
import { CADMIUM } from "../systems/cadmium";
import { QUEST } from "../systems/quest";
import type { Bundles, JoiningCharacter, State } from "../engine";
import { content } from "../engine/content";
import { character, trialBundles } from "../engine/testing/world";
import { begin, step, type Input, type Session } from "./harness";

export interface Scenario {
  name: string;
  ending: string;
  seed: number;
  bundles: () => Bundles;
  characters: () => JoiningCharacter[];
  /** Authors the input lines by playing the session. */
  author: (session: Session) => void;
}

let sunken: Bundles | undefined;
export function sunkenBundles(): Bundles {
  if (!sunken) {
    const setting = derelictStation();
    const adventure = compileAdventure(guideAdventure(), [setting]).bundle!;
    sunken = { system: QUEST, settings: [setting], adventure };
  }
  return sunken;
}

const vale = () => [character("c_1", "Vale", { abilities: [] })];

const MATERIALS = join(process.cwd(), "materials");
let exemplar: Bundles | undefined;
/** The exemplar: sunken_archive 1.0.0 on lantern_coast, for Cadmium with armor and stash. */
export function exemplarBundles(): Bundles {
  if (!exemplar) {
    const coast = compileSetting(readPackDir(join(MATERIALS, "lantern_coast/pack")));
    if (!coast.bundle) throw new Error(coast.diagnostics.map(formatDiagnostic).join("\n"));
    const adventure = compileAdventure(readPackDir(join(MATERIALS, "sunken_archive/pack")), [coast.bundle]);
    if (!adventure.bundle) throw new Error(adventure.diagnostics.map(formatDiagnostic).join("\n"));
    exemplar = { system: CADMIUM.configure(["armor", "stash"]), settings: [coast.bundle], adventure: adventure.bundle };
  }
  return exemplar;
}

/** A Cadmium fighter. The runs give her more hit points than creation does, so one character survives every fight. */
function wren(hp: number) {
  const sheet = CADMIUM.configure(["armor", "stash"]).create_character("Wren", { role: "fighter", abilities: ["a", "b", "c", "d", "e", "f"].map((a) => `starter:${a}`) }, new Rng(0n));
  return () => [{ id: "c_1", user_id: "u_c_1", sheet: { ...sheet, abilities: [], hp: { value: hp, max: hp } } }];
}

// ---------------------------------------------------------------------------------------------
// Autopilot

function send(session: Session, input: Input): boolean {
  const out = step(session, input);
  if (process.env.HARNESS_DEBUG && !("version" in out)) console.error("rejected", JSON.stringify(input), JSON.stringify(out));
  return "version" in out;
}

/** Submits a tool call; a pending choice it leaves (a Quest tough choice) takes its first option. */
function act(session: Session, tool: string, args: Record<string, unknown> = {}): boolean {
  const ok = send(session, { actor: "c_1", tool, args });
  const choice = session.state.pending_choices.c_1;
  if (choice) {
    if (process.env.HARNESS_DEBUG) console.error("choice", JSON.stringify(choice.options.map((o) => o.id)));
    send(session, { actor: "c_1", tool: "choose", args: { option_id: choice.options[0]!.id } });
  }
  return ok;
}

/** Repeats a move until the character stops moving or the destination is reached. */
function moveTo(session: Session, to: string, limit = 12): boolean {
  for (let i = 0; i < limit; i++) {
    const before = JSON.stringify(session.state.characters.c_1);
    if (!act(session, "move", { to_id: to })) return false;
    const moved = session.log.at(-1)!.events.find((e) => e.type === "moved");
    if (!moved || moved.stopped === "arrived") return true;
    if (JSON.stringify(session.state.characters.c_1) === before) return false;
  }
  return false;
}

function locationOf(state: State, id: string): string | undefined {
  return state.characters[id]?.location ?? state.entities[id]?.location;
}

/** Path length over passable terrain, ignoring entities: the planner's estimate of nearness. */
function distanceBetween(state: State, location: string, from: Cell, to: Cell): number {
  const loc = state.locations[location]!;
  const open = (c: Cell) => {
    const ch = loc.rows[c[1]]?.[c[0]];
    const t = loc.terrain[loc.legend[ch ?? " "] ?? "void"];
    return t !== undefined && !t.obstructs.includes("movement");
  };
  const path = findPath(from, [to], { metric: "chebyshev", open, blocksMovement: (c) => !open(c), cost: () => 1 });
  return path ? path.length : Infinity;
}

/**
 * Moves toward `target`, an entity or link in the character's location: to the target once it is visible, otherwise to
 * the seen, unvisited room or the seen, closed door nearest to it, opening each door it reaches.
 */
function pursue(session: Session, target: string, limit = 60): boolean {
  const doorsTried = new Set<string>();
  const roomsSkipped = new Set<string>();
  for (let i = 0; i < limit; i++) {
    const s = session.state;
    const here = s.characters.c_1!;
    const link = s.locations[here.location]!.links[target];
    const goal = link ? link.at : s.entities[target]?.at;
    if (!goal || (!link && locationOf(s, target) !== here.location)) return false;
    if (moveTo(session, target)) return true;
    const loc = s.locations[here.location]!;
    const candidates: { id: string; cell: Cell; door: boolean }[] = [];
    for (const [id, room] of Object.entries(loc.rooms)) {
      if (room.visited || roomsSkipped.has(id)) continue;
      const [x, y, w, h] = room.area[0]!;
      if (loc.seen.slice(y, y + h).some((row) => row.slice(x, x + w).includes("1"))) candidates.push({ id, cell: [x + Math.floor(w / 2), y + Math.floor(h / 2)], door: false });
    }
    for (const [id, e] of Object.entries(s.entities)) {
      if (e.kind !== "door" || e.open || doorsTried.has(id) || e.location !== here.location || !e.at || loc.seen[e.at[1]]?.[e.at[0]] !== "1") continue;
      candidates.push({ id, cell: e.at, door: true });
    }
    candidates.sort((a, b) => distanceBetween(s, here.location, a.cell, goal) - distanceBetween(s, here.location, b.cell, goal) || (a.id < b.id ? -1 : 1));
    const next = candidates[0];
    if (!next) return false;
    if (next.door) {
      doorsTried.add(next.id);
      // A door seen earlier may be out of sight now: walk back into the room that holds it first.
      let there = moveTo(session, next.id);
      if (!there) {
        const room = Object.entries(loc.rooms).find(([, r]) => r.area.some(([x, y, w, h]) => next.cell[0] >= x && next.cell[0] < x + w && next.cell[1] >= y && next.cell[1] < y + h))?.[0];
        there = room !== undefined && moveTo(session, room, 30) && moveTo(session, next.id);
      }
      if (there) act(session, "interact", { target_id: next.id, verb: "open" });
    } else if (!moveTo(session, next.id)) roomsSkipped.add(next.id);
  }
  return false;
}

function entityWithRef(state: State, ref: string, location?: string): string | undefined {
  return Object.keys(state.entities)
    .sort()
    .find((id) => state.entities[id]!.ref === ref && (location === undefined || state.entities[id]!.location === location));
}

/** Waits for the round to close until the instance ends. */
function waitForEnd(session: Session, limit = 200): void {
  for (let i = 0; i < limit && !session.state.ended; i++) send(session, { advance: true });
}

const active = (state: State, id: string) => (state.entities[id]?.sheet as { status?: string } | undefined)?.status === "active";

/** Attacks `target` until it is no longer active, approaching it when out of reach. */
function fight(session: Session, target: string, limit = 120): boolean {
  for (let i = 0; i < limit && !session.state.ended; i++) {
    if (!active(session.state, target)) return true;
    if (!act(session, "attack", { target_id: target })) {
      if (!act(session, "move", { to_id: target })) send(session, { advance: true });
    }
    if (session.state.round.declarations?.c_1) send(session, { advance: true });
  }
  return !active(session.state, target);
}

/** Fights every hostile creature in the character's location, nearest id first. */
function clear(session: Session, limit = 8): void {
  const c = content(session.bundles);
  for (let n = 0; n < limit && !session.state.ended; n++) {
    const here = session.state.characters.c_1!.location;
    const foe = Object.keys(session.state.entities)
      .sort()
      .find((id) => {
        const e = session.state.entities[id]!;
        return e.location === here && e.kind === "creature" && !e.conditions.some((x) => x.id === "hidden") && (e.hostile ?? (c.template(e.ref).tags ?? []).includes("hostile")) && active(session.state, id);
      });
    if (!foe) return;
    fight(session, foe);
  }
}

/** Advances rounds until combat ends. */
function waitForCalm(session: Session, limit = 20): void {
  for (let i = 0; i < limit && session.state.mode === "combat" && !session.state.ended; i++) send(session, { advance: true });
}

/** Rests at length once no hostile creature is visible. */
const recover = (session: Session) => act(session, "rest", { kind: "long" });

/** Searches until `target` is no longer hidden. */
function searchFor(session: Session, target: string, limit = 30): void {
  for (let i = 0; i < limit && session.state.entities[target]?.conditions.some((c) => c.id === "hidden"); i++) act(session, "search");
}

/** Walks through `door`, opening it if it is closed, into `room`. */
function enter(session: Session, door: string, room: string): boolean {
  moveTo(session, door, 30);
  if (session.state.entities[door] && !session.state.entities[door]!.open) act(session, "interact", { target_id: door, verb: "open" });
  return moveTo(session, room, 30);
}

const talk = (session: Session, npc: string, topic: string) => {
  moveTo(session, npc, 20);
  return act(session, "talk", { npc_id: npc, topic_id: topic, utterance: `Tell me about ${topic.replaceAll("_", " ")}.` });
};

const carried = (state: State, ref: string) => Object.keys(state.entities).sort().find((id) => state.entities[id]!.ref === ref && state.entities[id]!.carrier === "c_1");

// ---------------------------------------------------------------------------------------------
// Scenarios

export const SCENARIOS: Scenario[] = [
  {
    name: "trial_escaped",
    ending: "escaped",
    seed: 7,
    bundles: () => trialBundles(),
    characters: () => [character("c_1", "Vale")],
    author(session) {
      moveTo(session, "card");
      act(session, "take", { entity_id: "card" });
      moveTo(session, "panel");
      act(session, "interact", { target_id: "panel", verb: "operate" });
      moveTo(session, "hold");
      while (session.state.entities.cache!.conditions.length > 0 && session.version < 60) act(session, "search");
      moveTo(session, "cache");
      act(session, "take", { entity_id: "cache" });
    },
  },
  {
    name: "trial_lost",
    ending: "lost",
    seed: 7,
    bundles: () => trialBundles(),
    characters: () => [character("c_1", "Vale")],
    author(session) {
      moveTo(session, "hold");
      act(session, "attack", { target_id: "drone" });
      waitForEnd(session);
    },
  },
  {
    name: "sunken_escaped",
    ending: "escaped",
    seed: 11,
    bundles: sunkenBundles,
    characters: vale,
    author(session) {
      const card = entityWithRef(session.state, "base:keycard", "dock")!;
      moveTo(session, "hangar");
      moveTo(session, card);
      act(session, "take", { entity_id: card });
      moveTo(session, "lift_panel");
      act(session, "interact", { target_id: "lift_panel", verb: "operate" });
      moveTo(session, "x_lift");
      const core = entityWithRef(session.state, "sunken_archive:reactor_core")!;
      pursue(session, core);
      act(session, "take", { entity_id: core });
      moveTo(session, "x_up", 30);
      moveTo(session, "airlock", 30);
    },
  },
  {
    name: "sunken_lost",
    ending: "lost",
    seed: 11,
    bundles: sunkenBundles,
    characters: vale,
    author(session) {
      const card = entityWithRef(session.state, "base:keycard", "dock")!;
      moveTo(session, "hangar");
      moveTo(session, card);
      act(session, "take", { entity_id: card });
      moveTo(session, "lift_panel");
      act(session, "interact", { target_id: "lift_panel", verb: "operate" });
      moveTo(session, "x_lift");
      const drone = Object.keys(session.state.entities)
        .sort()
        .find((id) => session.state.entities[id]!.ref === "base:maintenance_drone" && session.state.entities[id]!.location === "lower_archive")!;
      pursue(session, drone);
      act(session, "attack", { target_id: drone });
      waitForEnd(session);
    },
  },
  {
    name: "exemplar_escaped",
    ending: "escaped",
    seed: 11,
    bundles: exemplarBundles,
    characters: wren(40),
    author(session) {
      // Orvelle: the contract path, a lamp, and three hints.
      moveTo(session, "plaza_lamp");
      act(session, "take", { entity_id: "plaza_lamp" });
      enter(session, "guildhall_door", "guildhall");
      talk(session, "hallek", "contract");
      talk(session, "hallek", "seal");
      enter(session, "guildhall_door", "plaza");
      enter(session, "tavern_door", "tavern");
      moveTo(session, "ledger");
      act(session, "interact", { target_id: "ledger", verb: "read" });
      enter(session, "tavern_door", "plaza");
      enter(session, "lane_gate", "lane");
      talk(session, "osk", "tide");
      enter(session, "lane_gate", "plaza");
      // Vessaro: the clue, the fragment, armor, and passage.
      moveTo(session, "x_vessaro", 30);
      enter(session, "office_door", "harbor_office");
      talk(session, "ostrakis", "clue");
      enter(session, "office_door", "quay");
      enter(session, "loft_door", "net_loft");
      searchFor(session, "fragment_vessaro");
      moveTo(session, "fragment_vessaro");
      act(session, "take", { entity_id: "fragment_vessaro" });
      enter(session, "loft_door", "quay");
      enter(session, "market_gate", "market");
      talk(session, "gerasimos", "jerkin");
      act(session, "use", { item_id: carried(session.state, "coast:leather_jerkin")! });
      enter(session, "market_gate", "quay");
      enter(session, "office_door", "harbor_office");
      talk(session, "ostrakis", "passage");
      enter(session, "office_door", "quay");
      moveTo(session, "vessaro_gate", 30);
      act(session, "interact", { target_id: "vessaro_gate", verb: "open" });
      moveTo(session, "x_boat");
      // The fog, the octopus, and the deck.
      moveTo(session, "fog_stair", 30);
      act(session, "interact", { target_id: "fog_stair", verb: "open" });
      moveTo(session, "x_stair");
      fight(session, "octopus");
      moveTo(session, "x_perpetua", 30);
      enter(session, "chart_door", "chart_room");
      moveTo(session, "winch", 30);
      act(session, "interact", { target_id: "winch", verb: "operate" });
      enter(session, "gallery_door", "gallery");
      clear(session);
      moveTo(session, "x_down", 30);
      // The holds: bring one box to light, and leave.
      pursue(session, "box_book", 80);
      act(session, "interact", { target_id: "box_book", verb: "open" });
      moveTo(session, "x_up", 40);
      enter(session, "gallery_door", "chart_room");
      enter(session, "chart_door", "mooring");
    },
  },
  {
    name: "exemplar_archive_sealed",
    ending: "archive_sealed",
    seed: 11,
    bundles: exemplarBundles,
    characters: wren(40),
    author(session) {
      // Orvelle: the rumor path, a lamp, a lead to Salinara, and the ledger.
      moveTo(session, "plaza_lamp");
      act(session, "take", { entity_id: "plaza_lamp" });
      enter(session, "tavern_door", "tavern");
      moveTo(session, "back_booth");
      act(session, "interact", { target_id: "back_booth", verb: "listen" });
      moveTo(session, "ledger");
      act(session, "interact", { target_id: "ledger", verb: "read" });
      enter(session, "tavern_door", "plaza");
      enter(session, "lane_gate", "lane");
      talk(session, "osk", "tide");
      enter(session, "lane_gate", "plaza");
      // Salinara: the reeves' route, the marsh fragment, the Gull crew, and passage.
      moveTo(session, "x_salinara", 30);
      enter(session, "reed_door", "reed_house");
      talk(session, "dassos", "route");
      talk(session, "dassos", "clue");
      enter(session, "reed_door", "row");
      enter(session, "marsh_gate", "marsh");
      clear(session);
      recover(session);
      searchFor(session, "fragment_salinara");
      moveTo(session, "fragment_salinara");
      act(session, "take", { entity_id: "fragment_salinara" });
      enter(session, "marsh_gate", "row");
      enter(session, "quay_gate", "quay");
      clear(session);
      recover(session);
      talk(session, "sarantis", "passage");
      moveTo(session, "salinara_gate", 30);
      act(session, "interact", { target_id: "salinara_gate", verb: "open" });
      moveTo(session, "x_boat");
      // The boat: tools from the chest, then the fog and the octopus.
      moveTo(session, "tool_chest", 30);
      for (const ref of ["coast:prybar", "coast:cold_chisel"]) {
        const tool = Object.keys(session.state.entities).find((id) => session.state.entities[id]!.ref === ref && session.state.entities[id]!.carrier === "tool_chest")!;
        act(session, "take", { entity_id: tool });
      }
      moveTo(session, "fog_stair", 30);
      act(session, "interact", { target_id: "fog_stair", verb: "open" });
      moveTo(session, "x_stair");
      fight(session, "octopus");
      recover(session);
      moveTo(session, "x_perpetua", 30);
      enter(session, "chart_door", "chart_room");
      moveTo(session, "winch", 30);
      act(session, "interact", { target_id: "winch", verb: "operate" });
      enter(session, "gallery_door", "gallery");
      clear(session);
      recover(session);
      moveTo(session, "x_down", 30);
      // The ward chamber: the false seal, read and sealed.
      pursue(session, "x_ward", 80);
      moveTo(session, "x_ward", 30);
      moveTo(session, "open_iron_box", 30);
      act(session, "interact", { target_id: "open_iron_box", verb: "read" });
      const ring = Object.keys(session.state.entities).find((id) => session.state.entities[id]!.ref === "sunken_archive:antique_priest_ring")!;
      act(session, "take", { entity_id: ring });
      act(session, "interact", { target_id: "open_iron_box", verb: "seal" });
      waitForCalm(session);
      recover(session);
      moveTo(session, "x_in", 30);
      // The keeper: the vault key, her account, and the archive sealed.
      const key = entityWithRef(session.state, "coast:vault_key", "perpetua_holds")!;
      pursue(session, key, 80);
      act(session, "take", { entity_id: key });
      pursue(session, "vantane", 80);
      for (const topic of ["rising", "ring", "plan", "visitor", "seal"]) talk(session, "vantane", topic);
    },
  },
  {
    name: "exemplar_lost",
    ending: "lost",
    seed: 11,
    bundles: exemplarBundles,
    characters: wren(3),
    author(session) {
      // The rumor path puts the Gull Company ahead; on the Vessaro quay its crew attacks.
      enter(session, "tavern_door", "tavern");
      moveTo(session, "back_booth");
      act(session, "interact", { target_id: "back_booth", verb: "listen" });
      enter(session, "tavern_door", "plaza");
      moveTo(session, "x_vessaro", 30);
      waitForEnd(session);
    },
  },
];

/** Plays a scenario's autopilot; returns the session with its log. */
export function author(scenario: Scenario): Session {
  const session = begin(scenario.bundles(), scenario.seed, scenario.characters());
  scenario.author(session);
  return session;
}
