// One simulated fight: a party of Cadmium fighters takes its gear, dons its armor, and fights an
// encounter in the arena by a fixed policy. Every action goes through the engine on a harness
// session, so a fight is reproduced by its configuration and seed, and its log replays.

import { toolsFor, type State } from "../../lib/engine";
import { begin, step, type Session } from "../../lib/harness/harness";
import { Rng } from "../../lib/rng";
import { CADMIUM } from "../../lib/systems/cadmium";
import { arena, LOADOUTS } from "./arena";
import type { Encounter } from "./encounters";

export interface Config {
  party: number;
  loadout: keyof typeof LOADOUTS;
  /** The armor pool's maximum (`armor.max` in modules.json). */
  armorMax: number;
}

export interface Outcome {
  won: boolean;
  rounds: number;
  /** Hit points lost, summed over the party. */
  hpLost: number;
  armorUsed: number;
  /** Characters that reached death's door, and that died. */
  deathsDoor: number;
  dead: number;
  session: Session;
}

interface Meter {
  value: number;
  max: number;
}

const sheetOf = (s: State, id: string) => s.characters[id]!.sheet as { hp: Meter; armor?: Meter; status: string; ap: number };
const ids = (n: number) => Array.from({ length: n }, (_, i) => `c_${i + 1}`);

function party(config: Config) {
  const base = CADMIUM.configure(["armor", "stash"]).create_character("Fighter", { role: "fighter", abilities: ["a", "b", "c", "d", "e", "f"].map((a) => `starter:${a}`) }, new Rng(0n));
  return ids(config.party).map((id, i) => ({ id, user_id: `u_${id}`, sheet: { ...base, name: `Fighter ${i + 1}`, abilities: [], armor: { value: 0, max: config.armorMax } } }));
}

/** The policy's next call for a character: gear first, then the nearest active hostile. */
function next(s: Session, id: string, foes: readonly string[]): { tool: string; args: Record<string, unknown> } | null {
  const st = s.state;
  const choice = st.pending_choices[id];
  // A tough choice: lose AP while there is AP to lose, else take the strain.
  if (choice) return { tool: "choose", args: { option_id: (choice.options.find((o) => o.id === "drained" && sheetOf(st, id).ap > 0) ?? choice.options.find((o) => o.id !== "drained") ?? choice.options[0]!).id } };
  const ch = st.characters[id]!;
  if (st.mode !== "combat") {
    const gear = Object.keys(st.entities).find((e) => st.entities[e]!.location === "arena" && st.entities[e]!.kind === "item" && st.entities[e]!.at?.[0] === ch.at[0] && st.entities[e]!.at?.[1] === ch.at[1]);
    if (gear) return { tool: "take", args: { entity_id: gear } };
    const armor = ch.items.find((i) => ["coast:leather_jerkin", "coast:round_shield"].includes(st.entities[i]!.ref));
    const pool = sheetOf(st, id).armor;
    if (armor && pool && pool.value < pool.max) return { tool: "use", args: { item_id: armor } };
  }
  const weapon = ch.items.find((i) => ["coast:knife", "coast:boarding_axe"].includes(st.entities[i]!.ref));
  const target = foes.find((f) => (st.entities[f]?.sheet as { status?: string } | undefined)?.status === "active");
  if (!target) return null;
  return { tool: "attack", args: { target_id: target, ...(weapon ? { item_id: weapon } : {}) } };
}

/** Rounds that ended while combat was on. */
function combatRounds(s: Session): number {
  let on = false;
  let n = 0;
  for (const l of s.log)
    for (const e of l.events) {
      if (e.type === "combat_started") on = true;
      else if (e.type === "combat_ended") on = false;
      else if (e.type === "round_ended" && on) n++;
    }
  return n;
}

export function simulate(encounter: Encounter, config: Config, seed: number, roundLimit = 60): Outcome {
  const bundles = arena(encounter, LOADOUTS[config.loadout]!, config.party);
  const s = begin(bundles, seed, party(config));
  const foes = encounter.creatures.map((_, i) => `foe_${i}`);
  const members = ids(config.party);
  const start = Object.fromEntries(members.map((id) => [id, sheetOf(s.state, id)]));
  let armorPeak = Object.fromEntries(members.map((id) => [id, 0]));
  let rounds = 0;
  let idle = 0;
  for (let guard = 0; guard < roundLimit * 20 && !s.state.ended && rounds < roundLimit && idle < 5; guard++) {
    let acted = false;
    for (const id of members) {
      if (s.state.ended || (!s.state.pending_choices[id] && !toolsFor(s.state, bundles, id).can_act)) continue;
      const call = next(s, id, foes);
      if (!call) continue;
      const out = step(s, { actor: id, ...call });
      if ("version" in out) acted = true;
      if (call.tool === "use") armorPeak = { ...armorPeak, [id]: sheetOf(s.state, id).armor?.value ?? 0 };
    }
    idle = acted ? 0 : idle + 1;
    if (!s.state.ended && (!acted || Object.keys(s.state.round.declarations).length > 0)) {
      step(s, { advance: true });
    }
    rounds = combatRounds(s);
  }
  const end = s.state;
  const hpLost = members.reduce((n, id) => n + Math.max(0, start[id]!.hp.value - sheetOf(end, id).hp.value), 0);
  const armorUsed = members.reduce((n, id) => n + Math.max(0, armorPeak[id]! - (sheetOf(end, id).armor?.value ?? 0)), 0);
  const deathsDoor = s.log.flatMap((l) => l.events).filter((e) => e.type === "died" && members.includes(e.target as string)).length;
  const statuses = members.map((id) => sheetOf(end, id).status);
  return {
    // A first blow can kill the last foe before combat starts, so no `combat_ended` ends the arena:
    // a win is every foe down with a character standing.
    won: foes.every((f) => (end.entities[f]?.sheet as { status?: string } | undefined)?.status !== "active") && statuses.includes("active"),
    rounds,
    hpLost,
    armorUsed,
    deathsDoor: Math.max(deathsDoor, statuses.filter((x) => x !== "active").length),
    dead: statuses.filter((x) => x === "dead").length,
    session: s,
  };
}

export interface Summary {
  runs: number;
  winRate: number;
  hpLost: number;
  armorUsed: number;
  rounds: number;
  deathsDoorRate: number;
  deathRate: number;
}

/** Runs `runs` seeds from `firstSeed` and averages per character where the metric is per character. */
export function sweep(encounter: Encounter, config: Config, runs: number, firstSeed = 1): Summary {
  let won = 0;
  let hp = 0;
  let armor = 0;
  let rounds = 0;
  let door = 0;
  let dead = 0;
  for (let i = 0; i < runs; i++) {
    const o = simulate(encounter, config, firstSeed + i);
    won += Number(o.won);
    hp += o.hpLost;
    armor += o.armorUsed;
    rounds += o.rounds;
    door += o.deathsDoor;
    dead += o.dead;
  }
  const perChar = runs * config.party;
  return { runs, winRate: won / runs, hpLost: hp / perChar, armorUsed: armor / perChar, rounds: rounds / runs, deathsDoorRate: door / perChar, deathRate: dead / perChar };
}
