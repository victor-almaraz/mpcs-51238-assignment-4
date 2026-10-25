// The arena: a small adventure on lantern_coast that stages one encounter. The party starts in a
// camp on its gear; the creatures wait across an open field. The instance ends `won` when combat
// ends, and `lost` when no character is active.

import { join } from "node:path";
import type { Bundles } from "../../lib/engine";
import { compileAdventure, compileSetting, formatDiagnostic } from "../../lib/materials";
import { readPackDir } from "../../lib/materials/fs";
import type { SettingBundle } from "../../lib/bundle/setting";
import { CADMIUM } from "../../lib/systems/cadmium";
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

let coast: SettingBundle | undefined;
function setting(): SettingBundle {
  if (!coast) {
    const r = compileSetting(readPackDir(join(process.cwd(), "cadmium-spec/spec/examples/lantern_coast")));
    if (!r.bundle) throw new Error(r.diagnostics.map(formatDiagnostic).join("\n"));
    coast = r.bundle;
  }
  return coast;
}

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
        const template = setting().entities[t] as { system_stats: Record<string, unknown> };
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
  const r = compileAdventure(files, [setting()]);
  if (!r.bundle) throw new Error(`arena ${key}:\n${r.diagnostics.map(formatDiagnostic).join("\n")}`);
  const bundles: Bundles = { system: CADMIUM.configure(["armor", "stash"]), settings: [setting()], adventure: r.bundle };
  cache.set(key, bundles);
  return bundles;
}
