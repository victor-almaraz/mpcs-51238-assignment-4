// Rebuilding a character before its first game (api.md, rebuild_character), and creation for a
// chosen campaign (app-flow.md, Character creation and editor).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCampaign } from "./campaigns";
import { characterRebuildable, createCharacter, rebuildCharacter } from "./characters";
import type { Entropy } from "./entropy";
import { addCharacter, checkFitsCampaign, createInstance, removeCharacter, type Deps } from "./instances";
import { code, entropy, SIX, SUNKEN, world } from "./testing/fixtures";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_a", "user_b"]));
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

const rook = () => createCharacter(store, "user_a", { system: "quest", name: "Rook", choices: { role: "spy", abilities: SIX } }, e);

describe("rebuild_character", () => {
  it("builds the sheet again from new choices, keeping the id, until the character first joins a game", async () => {
    const c = await rook();
    expect(await characterRebuildable(store, "user_a", c.id)).toBe(true);
    const rebuilt = await rebuildCharacter(store, "user_a", { character_id: c.id, name: "Rook Again", choices: { role: "fighter", abilities: SIX } }, e);
    expect(rebuilt).toMatchObject({ id: c.id, name: "Rook Again" });
    expect(rebuilt.sheet).toMatchObject({ role: "fighter", name: "Rook Again" });

    const k = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
    const game = await createInstance(store, "user_a", { campaign_id: k.id, name: "Tuesday group" }, e);
    await addCharacter(deps, "user_a", { instance_id: game.id, character_id: c.id });
    expect(await code(rebuildCharacter(store, "user_a", { character_id: c.id, choices: { role: "spy", abilities: SIX } }, e))).toBe("conflict");
    await removeCharacter(deps, "user_a", { instance_id: game.id, character_id: c.id });
    expect(await characterRebuildable(store, "user_a", c.id)).toBe(false);
    expect(await code(rebuildCharacter(store, "user_a", { character_id: c.id, choices: { role: "spy", abilities: SIX } }, e))).toBe("conflict");
  });

  it("rebuilds only the owner's characters, with choices the rules accept", async () => {
    const c = await rook();
    expect(await code(rebuildCharacter(store, "user_b", { character_id: c.id, choices: { role: "spy", abilities: SIX } }, e))).toBe("not_found");
    expect(await code(rebuildCharacter(store, "user_a", { character_id: c.id, choices: { role: "spy", abilities: SIX.slice(1) } }, e))).toBe("rules_rejected");
  });
});

describe("creation for a chosen campaign", () => {
  it("refuses abilities from a setting the campaign does not include, naming it", async () => {
    const k = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
    await checkFitsCampaign(store, "user_a", k.id, SIX);
    await expect(checkFitsCampaign(store, "user_a", k.id, [...SIX.slice(1), "elsewhere:spell"])).rejects.toThrow("which Archive does not include");
    expect(await code(checkFitsCampaign(store, "user_b", k.id, SIX))).toBe("not_found");
  });
});
