// The arena: a small adventure on lantern_coast that stages one encounter. The party starts in a
// camp on its gear; the creatures wait across an open field. The instance ends `won` when combat
// ends, and `lost` when no character is active.

import type { Bundles } from "../../lib/engine";
import { exemplarBundles } from "../../lib/harness/scenarios";
import { compileAdventure, mustCompile } from "../../lib/materials";
import type { Encounter } from "./encounters";

export interface Loadout {
  id: string;
  /** Item refs each character starts on and takes. */
  items: string[];
}

export const LOADOUTS: Record<string, Loadout> = {
  unarmored: { id: "unarmored", items: ["coast:knife"] },
  jerkin: { id: "jerkin", items: ["coast:knife", "coast:leather_jerkin"] },
  full: { id: "full", items: ["coast:knife", "coast:leather_jerkin", "coast:round_shield"] },
  axe: { id: "axe", items: ["coast:boarding_axe"] },
  axe_full: { id: "axe_full", items: ["coast:boarding_axe", "coast:leather_jerkin", "coast:round_shield"] },
};

const ROWS = ["##################", "#................#", "#................#", "#................#", "#................#", "#................#", "##################"];
/** Creature anchor cells across the field, room for 2 × 2 footprints. */
const SPOTS: [number, number][] = [
  [13, 1],
  [13, 4],
  [10, 1],
  [10, 4],
  [15, 2],
];

const cache = new Map<string, Bundles>();

/** The arena bundles for an encounter and loadout. */
export function arena(encounter: Encounter, loadout: Loadout, party: number): Bundles {
  const key = `${encounter.id}/${JSON.stringify(encounter.override ?? {})}/${loadout.id}/${party}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const gear = Array.from({ length: party }, (_, c) => loadout.items.map((ref, i) => `    - { id: gear_${c}_${i}, ref: "${ref}", at: [${1 + c}, 1] }`)).flat();
  // An override copies each template into the arena's own entities with the changed statistics.
  const ref = (t: string) => (encounter.override ? `sim_arena:${t}` : `coast:${t}`);
  const foes = encounter.creatures.map((t, i) => `    - { id: foe_${i}, ref: "${ref(t)}", at: [${SPOTS[i]![0]}, ${SPOTS[i]![1]}] }`);
  const copies = encounter.override
    ? Object.fromEntries([...new Set(encounter.creatures)].map((t) => {
        const template = exemplarBundles().settings[0]!.entities[t] as { system_stats: Record<string, unknown> };
        return [t, { ...template, system_stats: { ...template.system_stats, ...encounter.override } }];
      }))
    : undefined;
  const files = new Map<string, string>([
    [
      "adventure.yaml",
      `format_version: 2
kind: adventure
id: sim_arena
version: 1.0.0
title: Simulation arena
system: { id: cadmium, versions: "^1.0", modules: [armor, stash] }
requires_settings:
  - { id: lantern_coast, versions: "^1.0" }
players: [1, 4]
start:
  location: arena
  room: camp
  effects:
${encounter.turned ? encounter.creatures.map((_, i) => `    - set_hostile: { target: foe_${i}, hostile: true }`).join("\n") : "    []"}
endings:
  won: { label: Won }
  lost: { label: Lost }
`.replace("  effects:\n    []", "  effects: []"),
    ],
    [
      "locations/arena.yaml",
      `id: arena
kind: authored
map:
  rows:
${ROWS.map((r) => `    - "${r}"`).join("\n")}
  rooms:
    camp: { label: camp, area: [[1, 1, 4, 5]] }
    field: { label: field, area: [[5, 1, 12, 5]] }
  contents:
${[...gear, ...foes].join("\n")}
`,
    ],
    [
      "plot/sim.yaml",
      `id: sim
title: Simulation
stages: [fighting, over]
initial: fighting
triggers:
  - id: won
    on: { type: combat_ended }
    effects:
      - end_campaign: { ending: won }
    once: true
`,
    ],
  ]);
  // JSON is YAML 1.2.
  if (copies) files.set("entities/foes.yaml", JSON.stringify(copies));
  // The exemplar's system and setting: Cadmium with armor and stash, on lantern_coast.
  const { system, settings } = exemplarBundles();
  const bundles: Bundles = { system, settings, adventure: mustCompile(compileAdventure(files, settings), `arena ${key}`) };
  cache.set(key, bundles);
  return bundles;
}
