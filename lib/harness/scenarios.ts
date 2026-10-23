// Scripted scenarios: the trial and sunken_archive adventures played to every ending. An autopilot
// authors each scenario's input lines from state once; the lines, and the log they produce, are kept
// as golden files under lib/harness/golden and replayed by the tests.

import { findPath, type Cell } from "../grid";
import { compileAdventure } from "../materials";
import { derelictStation, guideAdventure } from "../materials/testing/fixtures";
import { QUEST } from "../systems/quest";
import type { Bundles, JoiningCharacter, State } from "../engine";
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

// ---------------------------------------------------------------------------------------------
// Autopilot

function send(session: Session, input: Input): boolean {
  const out = step(session, input);
  return "version" in out;
}

const act = (session: Session, tool: string, args: Record<string, unknown> = {}) => send(session, { actor: "c_1", tool, args });

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
 * Moves toward `target` in the character's location: to the target once it is visible, otherwise to
 * the seen, unvisited room or the seen, closed door nearest to it, opening each door it reaches.
 */
function pursue(session: Session, target: string, limit = 60): boolean {
  const doorsTried = new Set<string>();
  const roomsSkipped = new Set<string>();
  for (let i = 0; i < limit; i++) {
    const s = session.state;
    const here = s.characters.c_1!;
    const goal = s.entities[target]?.at;
    if (!goal || locationOf(s, target) !== here.location) return false;
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
      if (moveTo(session, next.id)) act(session, "interact", { target_id: next.id, verb: "open" });
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
];

/** Plays a scenario's autopilot; returns the session with its log. */
export function author(scenario: Scenario): Session {
  const session = begin(scenario.bundles(), scenario.seed, scenario.characters());
  scenario.author(session);
  return session;
}
