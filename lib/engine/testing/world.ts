// A small authored adventure for engine tests, compiled through lib/materials against the
// derelict_station example: two locations joined by a link, doors, a locked chest with capacity, a dark
// room with a hostile drone, light sources, a hidden item, and an NPC with topics.

import { compileAdventure, mustCompile } from "../../materials";
import { derelictStation } from "../../materials/testing/fixtures";
import { Rng } from "../../rng";
import { QUEST } from "../../systems/quest";
import type { RulesSystem } from "../../systems";
import { startInstance } from "../start";
import type { Bundles, JoiningCharacter, State } from "../types";

export const TRIAL: Record<string, string> = {
  "adventure.yaml": `
format_version: 2
kind: adventure
id: trial
version: 0.1.0
title: Trial
system: { id: quest, versions: "^1.0" }
requires_settings: [{ id: derelict_station, versions: "^3.0" }]
players: [1, 4]
start: { location: deck, room: bay, effects: [] }
endings: { escaped: { label: Escaped }, lost: { label: Lost } }
`,
  "flags.yaml": `
power: { type: bool, initial: false }
alarm: { type: int, min: 0, max: 3, initial: 0 }
purse: { type: int, min: 0, max: 100, initial: 12, scope: character, currency: base:credit }
`,
  "entities/items.yaml": `
lamp: { kind: item, label: lamp, light: { bright: 2, dim: 4 } }
chest: { kind: container, label: chest, contents: [], capacity: 2, lock: { has_item: base:keycard } }
brazier: { kind: fixture, label: brazier, light: { bright: 1, dim: 2, lit: false }, verbs: {} }
idol: { kind: item, label: idol, tags: [objective] }
barricade: { kind: fixture, label: barricade, cover: true, verbs: {} }
`,
  "locations/deck.yaml": `
id: deck
kind: authored
map:
  legend: { "+": { terrain: floor, place: base:hatch } }
  rows:
    - "############"
    - "#....#.....#"
    - "#....+.....#"
    - "#....#.....#"
    - "############"
  rooms:
    bay: { label: bay, area: [[1, 1, 4, 3]] }
    hold: { label: hold, light: dark, area: [[5, 2, 1, 1], [6, 1, 5, 3]] }
  links:
    x_down: { label: ladder, at: [10, 3], to: { location: vault, link: x_up } }
  contents:
    - { id: panel, ref: base:control_panel, at: [1, 1] }
    - { id: card, ref: base:keycard, at: [2, 3] }
    - { id: chest, ref: chest, at: [4, 1] }
    - { id: lamp, ref: lamp, at: [3, 1] }
    - { id: drone, ref: base:maintenance_drone, at: [9, 1] }
    - { id: brazier, ref: brazier, at: [6, 3] }
    - { id: cache, ref: idol, at: [8, 3], hidden: true }
    - { id: locker, ref: base:locker, at: [10, 1] }
    - { npc: keeper, at: [4, 3] }
`,
  "locations/vault.yaml": `
id: vault
kind: authored
map:
  rows:
    - "######"
    - "#....#"
    - "######"
  rooms:
    cellar: { label: cellar, area: [[1, 1, 4, 1]] }
  links:
    x_up: { label: ladder, at: [1, 1], to: { location: deck, link: x_down } }
  contents:
    - { id: gate, ref: base:bulkhead, at: [3, 1], lock: { flag: power } }
`,
  "npcs/keeper.yaml": `
id: keeper
name: Keeper Ada
template: base:civilian
disposition: friendly
topics:
  power: { label: the power, brief: The panel needs a keycard., effects: [] }
  gate: { label: the gate, when: { flag: power }, brief: The gate is open now. }
secrets: { past: She was a pilot. }
`,
  "plot/main.yaml": `
id: main
title: Main
stages: [start, powered, done]
initial: start
triggers:
  - id: power_on
    on: { type: interacted, target: panel, verb: operate }
    effects:
      - set_flag: { flag: power, value: true }
      - set_stage: { arc: main, stage: powered }
      - open_door: { door: gate }
    narrate: Power returns.
    once: true
  - id: finish
    on: { type: item_taken, ref: trial:idol }
    effects:
      - end_campaign: { ending: escaped }
`,
};

let cached: Bundles | undefined;

/** The trial adventure's bundles under Quest, or under `system` when given. */
export function trialBundles(system: RulesSystem = QUEST, files: Record<string, string> = TRIAL): Bundles {
  if (system === QUEST && files === TRIAL && cached) return cached;
  const setting = derelictStation();
  const bundles: Bundles = { system, settings: [setting], adventure: mustCompile(compileAdventure(new Map(Object.entries(files)), [setting]), "trial adventure") };
  if (system === QUEST && files === TRIAL) cached = bundles;
  return bundles;
}

/**
 * A Quest character joining the trial. Quest creation takes six abilities; the example setting defines
 * one, so the sheet keeps only `base:overload`, which the engine requires to exist at join.
 */
export function character(id: string, name = id, patch: Record<string, unknown> = {}): JoiningCharacter {
  const abilities = ["a1", "a2", "a3", "a4", "a5", "a6"].map((a) => `base:${a}`);
  const sheet = QUEST.create_character(name, { role: "spy", abilities }, new Rng(0));
  return { id, user_id: `u_${id}`, sheet: { ...sheet, abilities: ["base:overload"], ...patch } };
}

export function start(characters: JoiningCharacter[] = [character("c_1", "Vale")], seed = 7, bundles = trialBundles()): State {
  const r = startInstance({ bundles, characters, seed });
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.detail}`);
  return r.state;
}
