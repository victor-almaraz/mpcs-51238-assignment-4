// The Quest Quick Start setting (materials/quest_starter): each role's six quick-start abilities from
// the Quest Creators Resource, so characters can be created and played with installed materials.

import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SettingBundle } from "../bundle/setting";
import { compileSetting } from "../materials";
import { readPackDir } from "../materials/fs";
import type { Store } from "../store";
import type { testDb } from "../store/testing/pglite";
import { createCampaign } from "./campaigns";
import { withDescriptions } from "../server/ability-descriptions";
import { quickStartFor } from "../systems/creation";
import { example } from "../materials/testing/fixtures";
import { abilityOptions, createCharacter, effectSentences } from "./characters";
import type { Entropy } from "./entropy";
import { ApiError } from "./errors";
import { addCharacter, createInstance, startInstance, submitAction, type Deps } from "./instances";
import { entropy, SUNKEN, world } from "./testing/fixtures";

const ROLES = ["fighter", "invoker", "ranger", "naturalist", "doctor", "spy", "magician", "wizard"];

function starter(): SettingBundle {
  const r = compileSetting(readPackDir(join(process.cwd(), "materials/quest_starter/pack")));
  expect(r.diagnostics).toEqual([]);
  return r.bundle!;
}

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;
let deps: Deps;
let e: Entropy;

beforeEach(async () => {
  ({ db, store, deps } = await world(["user_a"]));
  await store.putBundle(starter(), { origin: "operator" });
  e = entropy();
});
afterEach(async () => {
  await db.close();
});

const quickStart = async (role: string) => quickStartFor(role, await abilityOptions(store, "quest"), 6);

describe("ability information for new players", () => {
  it("states each ability's cost, roll, target, path, and effects, with its Creators Resource description", async () => {
    const options = withDescriptions(await abilityOptions(store, "quest"));
    const by = (ref: string) => options.find((o) => o.ref === ref)!;
    expect(by("starter:mend")).toMatchObject({ cost: 1, roll: false, target: "entity", path: "healing", effects: ["Restores 2 HP."], description: "You gently touch a creature, immediately restoring hit points and mending minor wounds." });
    expect(by("starter:corrupt")).toMatchObject({ cost: 0, roll: true, effects: ["Deals 2 magic damage."] });
    expect(by("starter:deathsense")).toMatchObject({ target: "self", effects: [] });
    expect(by("starter:sleep").effects).toEqual(["Leaves the target asleep for 3 rounds."]);
    expect(options.filter((o) => o.ref.startsWith("starter:")).every((o) => o.description)).toBe(true);
  });

  it("names unknown effects plainly and conditions by their label", () => {
    expect(effectSentences([{ remove_condition: { target: "target", condition: "fevered" } }, { open_door: { door: "d" } }], { fevered: { label: "feverish" } })).toEqual(["Ends feverish.", "Open door."]);
  });
});

describe("Quest Quick Start", () => {
  it("compiles with six abilities for each of the eight roles", () => {
    const b = starter();
    const byRole = ROLES.map((r) => Object.values(b.abilities).filter((a) => (a.system_stats as { roles: string[] }).roles[0] === r).length);
    expect(byRole).toEqual(ROLES.map(() => 6));
    expect(b.abilities.magic_strike).toMatchObject({ label: "Magic Strike", system_stats: { roles: ["wizard"], path: "evocation", cost: { ap: 0 }, roll: true } });
  });

  it.each(ROLES)("lets a %s be created from the role's quick start, in Quest and Cadmium", async (role) => {
    const six = await quickStart(role);
    expect(six).toHaveLength(6);
    for (const system of ["quest", "cadmium"]) {
      const c = await createCharacter(store, "user_a", { system, name: "Vale", choices: { role, abilities: six } }, e);
      expect(c.sheet.abilities).toEqual(six);
    }
  });

  it("keeps every role's quick start when the Fantasy example adds an invoker prayer", async () => {
    await store.putBundle(compileSetting(example("sunless_crypt")).bundle!, { origin: "operator" });
    const options = await abilityOptions(store, "quest");
    expect(options.filter((a) => a.roles.length === 1 && a.roles[0] === "invoker").length).toBe(7);
    for (const role of ROLES) expect(quickStartFor(role, options, 6).every((ref) => ref.startsWith("starter:"))).toBe(true);
    expect(ROLES.map((role) => quickStartFor(role, options, 6).length)).toEqual(ROLES.map(() => 6));
  });

  it("refuses a character whose abilities come from a setting the game lacks, naming the setting, in the lobby and at Start", async () => {
    const campaign = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: SUNKEN }, e);
    const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Solo" }, e);
    const ranger = await createCharacter(store, "user_a", { system: "quest", name: "Tamsin", choices: { role: "ranger", abilities: await quickStart("ranger") } }, e);
    const refused = await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: ranger.id }).catch((x: ApiError) => x);
    expect(refused).toMatchObject({ code: "conflict" });
    expect((refused as ApiError).detail).toContain("Tamsin uses abilities or items from Quest Quick Start, which this game does not include");
    // A character that joined the lobby before this check is named at Start instead of failing in the engine.
    await store.joinInstance(instance.id, ranger.id, "user_a");
    expect(((await startInstance(deps, "user_a", instance.id).catch((x: ApiError) => x)) as ApiError).detail).toContain("Take Tamsin out of the lobby, or add Quest Quick Start");
  });

  it("plays: a wizard spends 1 AP on Blink", async () => {
    const campaign = await createCampaign(store, "user_a", { title: "Archive", system: "quest", system_versions: "^1.0", materials: [SUNKEN[0], { kind: "setting", id: "quest_starter", version: "1.0.0" }, SUNKEN[1]] }, e);
    const instance = await createInstance(store, "user_a", { campaign_id: campaign.id, name: "Solo" }, e);
    const wizard = await createCharacter(store, "user_a", { system: "quest", name: "Vale", choices: { role: "wizard", abilities: await quickStart("wizard") } }, e);
    await addCharacter(deps, "user_a", { instance_id: instance.id, character_id: wizard.id });
    await startInstance(deps, "user_a", instance.id);
    await submitAction(deps, "user_a", { instance_id: instance.id, tool: "ability", args: { ability_id: "starter:blink" }, idempotency_key: "blink-0000001" }, e);
    const state = (await store.getInstance(instance.id))!.state!;
    expect((state.characters[wizard.id]!.sheet as unknown as { ap: number }).ap).toBe(9);
    expect((await store.history(instance.id, 1, 10))[0]!.events.map((x) => x.type)).toContain("ability_used");
  });
});
