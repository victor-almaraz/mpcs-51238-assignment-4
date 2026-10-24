// Cadmium modules in play (sprint 21 exit criterion: a Cadmium campaign with armor and stash plays;
// a character earns, spends, stores, and dons armor).

import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileAdventure, compileSetting, formatDiagnostic } from "../materials";
import { readPackDir } from "../materials/fs";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCampaign } from "./campaigns";
import { abilityOptions, createCharacter } from "./characters";
import type { Entropy } from "./entropy";
import { addCharacter, createInstance, getInstance, startInstance, submitAction, type Deps } from "./instances";
import { code, entropy, world } from "./testing/fixtures";

const SETTING = new Map<string, string>([
  [
    "manifest.yaml",
    `format_version: 2
kind: setting
id: market_town
version: 1.0.0
namespace: market
title: Market Town
system: { id: cadmium, versions: "^1.0", modules: [armor, stash] }
damage_types: [physical]
currency:
  id: coin
  label: coins
  unit: copper
  denominations:
    copper: { label: copper, value: 1 }
    silver: { label: silver, value: 10 }
generation:
  door: gate
  locks: { iron_gate: gate_key }
narration: { style: plain, person: third, max_sentences: 3 }
`,
  ],
  [
    "entities/things.yaml",
    `plate:
  kind: item
  label: plate armor
  system_stats: { armor: 4 }
backpack:
  kind: item
  label: backpack
  system_stats: { slots: 6 }
sword:
  kind: item
  label: sword
  system_stats: { weapon: true }
chest:
  kind: container
  label: chest
  capacity: 6
  contents: []
merchant:
  kind: creature
  label: merchant
  behavior: passive
  system_stats: { template: commoner }
gate:
  kind: door
  label: gate
iron_gate:
  kind: door
  label: iron gate
gate_key:
  kind: item
  label: gate key
`,
  ],
  ["tables.yaml", "room_labels:\n  - { weight: 1, label: lane }\n"],
]);

const ADVENTURE = new Map<string, string>([
  [
    "adventure.yaml",
    `format_version: 2
kind: adventure
id: market_day
version: 1.0.0
title: Market Day
system: { id: cadmium, versions: "^1.0", modules: [armor, stash] }
requires_settings:
  - { id: market_town, versions: "^1.0" }
players: [1, 2]
start: { location: square, room: plaza, effects: [] }
endings:
  ready: { label: Ready for the road }
`,
  ],
  ["flags.yaml", "purse: { type: int, min: 0, max: 100, initial: 0, scope: character, currency: market:coin }\n"],
  [
    "entities/board.yaml",
    `board:
  kind: fixture
  label: job board
  verbs:
    work:
      effects: []
`,
  ],
  [
    "npcs/smith.yaml",
    `id: smith
name: Smith Avel
template: market:merchant
disposition: friendly
topics:
  plate:
    label: plate armor, 6 copper
    when: { flag: purse, gte: 6 }
    brief: The plate costs six copper.
    effects:
      - add_flag: { flag: purse, value: -6 }
      - give_item: { target: actor, ref: market:plate }
`,
  ],
  [
    "locations/square.yaml",
    `id: square
kind: authored
map:
  rows:
    - "##########"
    - "#........#"
    - "#........#"
    - "#........#"
    - "##########"
  rooms:
    plaza: { label: plaza, area: [[1, 1, 8, 3]] }
  contents:
    - { id: board, ref: market_day:board, at: [1, 3] }
    - { id: chest, ref: market:chest, at: [8, 1] }
    - { npc: smith, at: [5, 3] }
    - { id: backpack, ref: market:backpack, at: [3, 2] }
    - { id: sword, ref: market:sword, at: [4, 2] }
`,
  ],
  [
    "plot/errand.yaml",
    `id: errand
title: The Errand
stages: [shopping, done]
initial: shopping
triggers:
  - id: wages
    on: { type: interacted, target: board, verb: work }
    effects:
      - add_flag: { flag: purse, value: 10 }
  - id: armored
    on: { type: resource_changed, resource: armor }
    effects:
      - set_stage: { arc: errand, stage: done }
      - end_campaign: { ending: ready }
    once: true
`,
  ],
]);

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_a"]));
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

function compiled() {
  const market = compileSetting(SETTING);
  if (!market.bundle) throw new Error(market.diagnostics.map(formatDiagnostic).join("\n"));
  const starter = compileSetting(readPackDir(join(process.cwd(), "materials/quest_starter/pack"))).bundle!;
  const adventure = compileAdventure(ADVENTURE, [market.bundle]);
  if (!adventure.bundle) throw new Error(adventure.diagnostics.map(formatDiagnostic).join("\n"));
  return { market: market.bundle, starter, adventure: adventure.bundle };
}

describe("Cadmium modules in play", () => {
  it("earns, spends, stores, carries a stash item, and dons armor", async () => {
    const { market, starter, adventure } = compiled();
    for (const b of [market, starter, adventure]) await store.putBundle(b, { origin: "operator" });
    // The adventure requires market_town; the campaign adds the Quest Quick Start for abilities,
    // which a Cadmium campaign accepts.
    const materials = [
      { kind: "setting", id: "market_town", version: "1.0.0" },
      { kind: "setting", id: "quest_starter", version: "1.0.0" },
      { kind: "adventure", id: "market_day", version: "1.0.0" },
    ];
    expect(await code(createCampaign(store, "user_a", { title: "Plain", system: "cadmium", system_versions: "^1.0", materials }, e))).toBe("system_mismatch");
    const campaign = await createCampaign(store, "user_a", { title: "Market", system: "cadmium", system_versions: "^1.0", modules: ["armor", "stash"], materials }, e);
    const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Errand" }, e);
    const six = (await abilityOptions(store, "cadmium")).filter((a) => a.roles.length === 1 && a.roles[0] === "fighter").map((a) => a.ref);
    const vale = await createCharacter(store, "user_a", { system: "cadmium", name: "Vale", choices: { role: "fighter", abilities: six } }, e);
    await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: vale.id });
    await startInstance(deps, "user_a", instance.id);

    let n = 0;
    const act = async (tool: string, args: Record<string, unknown>) => {
      await submitAction(deps, "user_a", { instance_id: instance.id, tool, args, idempotency_key: `market-step-${n++}` }, e);
      return (await getInstance(deps, "user_a", { instance_id: instance.id })).view!;
    };
    const purse = async () => (await store.getInstance(instance.id))!.state!.character_flags[vale.id]?.purse;

    // Earn.
    await act("move", { to_id: "board" });
    let v = await act("interact", { target_id: "board", verb: "work" });
    expect(await purse()).toBe(10);
    expect(v.character.currencies).toEqual([{ flag: "purse", label: "coins", amount: 10, coins: [{ id: "silver", label: "silver", count: 1 }] }]);

    // Spend.
    await act("move", { to_id: "smith" });
    v = await act("talk", { npc_id: "smith", topic_id: "plate", utterance: "The plate, please." });
    expect(await purse()).toBe(4);
    const plate = v.actions.inventory.find((i) => i.label === "plate armor")!;
    expect(plate).toBeDefined();

    // Carry a stash item and store a sword.
    await act("move", { to_id: "backpack" });
    await act("take", { entity_id: "backpack" });
    await act("move", { to_id: "sword" });
    v = await act("take", { entity_id: "sword" });
    expect(v.actions.inventory.map((i) => i.label).sort()).toEqual(["backpack", "plate armor", "sword"]);
    await act("move", { to_id: "chest" });
    v = await act("give", { item_id: "sword", target_id: "chest" });
    expect(v.visible.find((x) => x.id === "chest")!.contents).toEqual([{ id: "sword", label: "sword" }]);
    expect(v.actions.inventory.map((i) => i.label).sort()).toEqual(["backpack", "plate armor"]);

    // Don the armor: the pool fills, the plate is consumed, and the errand ends.
    await act("use", { item_id: plate.id });
    const state = (await store.getInstance(instance.id))!;
    expect(state.status).toBe("ended");
    expect(state.ending).toBe("ready");
    const sheet = (await store.getCharacter(vale.id))!.sheet as unknown as { armor: { value: number; max: number }; inventory: { ref: string }[] };
    expect(sheet.armor).toEqual({ value: 4, max: 6 });
    expect(sheet.inventory.map((i) => i.ref)).toEqual(["market:backpack"]);
  });
});
