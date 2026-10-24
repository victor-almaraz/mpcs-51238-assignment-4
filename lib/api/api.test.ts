// Users and characters (app build order step 4: a user creates and renames a character in each system).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../store";
import { sqlRpc } from "../store/sql-rpc";
import { testDb } from "../store/testing/pglite";
import { abilityOptions, createCharacter, getCharacter, listCharacters, retireCharacter, updateCharacter } from "./characters";
import { getSystemSchema, listSystems } from "./systems";
import { ApiError } from "./errors";
import { code, entropy, richSetting, SIX } from "./testing/fixtures";
import { TERMS_VERSION } from "./terms";
import { acceptTerms, getMe } from "./users";

let db: Awaited<ReturnType<typeof testDb>>;
let store: Store;

beforeEach(async () => {
  db = await testDb();
  store = new Store(sqlRpc(db));
  await store.putBundle(richSetting(), { origin: "operator" });
  await store.upsertUser({ id: "user_a", email: "a@example.org", display_name: "Ada", terms_accepted_at: null });
  await store.upsertUser({ id: "user_b", email: "b@example.org", display_name: "Bo", terms_accepted_at: null });
  await acceptTerms(store, "user_b", TERMS_VERSION);
});
afterEach(async () => {
  await db.close();
});

describe("users", () => {
  it("rejects unknown and signed-out callers", async () => {
    expect(await code(getMe(store, null))).toBe("unauthenticated");
    expect(await code(getMe(store, "user_x"))).toBe("unauthenticated");
  });

  it("allows only get_me and accept_terms until the current terms are accepted", async () => {
    expect((await getMe(store, "user_a")).user.terms_current).toBe(false);
    expect(await code(createCharacter(store, "user_a", { system: "quest", name: "Vale", choices: { role: "spy", abilities: SIX } }))).toBe("forbidden");
    expect(await code(acceptTerms(store, "user_a", "old"))).toBe("invalid_request");
    expect((await acceptTerms(store, "user_a", TERMS_VERSION)).terms_current).toBe(true);
    expect(await code(createCharacter(store, "user_a", { system: "quest", name: "Vale", choices: { role: "spy", abilities: SIX } }))).toBe("ok");
  });

  it("never revives a deleted user from a late identity update", async () => {
    await store.markUserDeleted("user_a");
    expect(await store.upsertUser({ id: "user_a", email: "a@example.org", display_name: "Ada", terms_accepted_at: null })).toBeUndefined();
    expect(await code(getMe(store, "user_a"))).toBe("unauthenticated");
  });

  it("lists the user's character ids in get_me", async () => {
    const c = await createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "fighter", abilities: SIX } }, entropy());
    expect((await getMe(store, "user_b")).character_ids).toEqual([c.id]);
  });
});

describe("systems", () => {
  it("lists Cadmium first, with its credit, modules, and values to confirm", () => {
    const [cadmium, quest] = listSystems();
    expect(cadmium).toMatchObject({ id: "cadmium", version: "1.0.0", derived_from: "quest", accepts: ["cadmium", "quest"], modules: [{ id: "armor", title: "Armor" }, { id: "stash", title: "Stash" }] });
    // SPEC_ISSUES.md#quest-values-confirmed: the AP award and NPC hit points are confirmed.
    expect(cadmium!.pending_confirmation).toEqual(["setbacks", "spatial"]);
    expect(quest).toMatchObject({ id: "quest", accepts: ["quest"] });
  });

  it("returns schemas configured with modules", () => {
    const plain = getSystemSchema("cadmium", "item") as { properties: Record<string, unknown> };
    const armored = getSystemSchema("cadmium", "item", ["armor"]) as { properties: Record<string, unknown> };
    expect("armor" in plain.properties).toBe(false);
    expect("armor" in armored.properties).toBe(true);
    expect(() => getSystemSchema("cadmium", "item", ["capes"])).toThrow(ApiError);
  });
});

describe("characters", () => {
  it.each(["quest", "cadmium"])("creates and renames a %s character", async (system) => {
    const created = await createCharacter(store, "user_b", { system, name: "Rook", choices: { role: "fighter", abilities: SIX, profile: { look: "tall" } } }, entropy());
    expect(created).toMatchObject({ owner_id: "user_b", system, name: "Rook", status: "available", instance_id: null, sheet: { name: "Rook", role: "fighter", hp: { value: 10, max: 10 }, ap: 10 } });
    expect(created.summary).toEqual({ health: "10/10 HP", status: "active", resources: { AP: "10" } });
    const renamed = await updateCharacter(store, "user_b", { character_id: created.id, name: "Rook the Bold" });
    expect(renamed).toMatchObject({ name: "Rook the Bold", sheet: { name: "Rook the Bold" } });
    expect((await getCharacter(store, "user_b", created.id)).name).toBe("Rook the Bold");
  });

  it("reports the rules system's rejection of invalid choices", async () => {
    expect(await code(createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "fighter", abilities: SIX.slice(0, 5) } }))).toBe("rules_rejected");
    expect(await code(createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "bard", abilities: SIX } }))).toBe("rules_rejected");
  });

  it("rejects unknown fields, unknown systems, and bad names", async () => {
    expect(await code(createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: {}, hp: 20 }))).toBe("invalid_request");
    expect(await code(createCharacter(store, "user_b", { system: "d20", name: "Rook", choices: {} }))).toBe("invalid_request");
    expect(await code(createCharacter(store, "user_b", { system: "quest", name: "", choices: {} }))).toBe("invalid_request");
  });

  it("updates the profile, validated against the system's sheet", async () => {
    const c = await createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "fighter", abilities: SIX } }, entropy());
    expect((await updateCharacter(store, "user_b", { character_id: c.id, profile: { look: "scarred" } })).sheet!.profile).toEqual({ look: "scarred" });
    expect(await code(updateCharacter(store, "user_b", { character_id: c.id, profile: { look: "x".repeat(201) } }))).toBe("invalid_request");
    expect(await code(updateCharacter(store, "user_b", { character_id: c.id, hp: 99 }))).toBe("invalid_request");
  });

  it("hides other users' characters as not_found", async () => {
    await acceptTerms(store, "user_a", TERMS_VERSION);
    const c = await createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "fighter", abilities: SIX } }, entropy());
    expect(await code(getCharacter(store, "user_a", c.id))).toBe("not_found");
    expect(await code(updateCharacter(store, "user_a", { character_id: c.id, name: "Mine" }))).toBe("not_found");
    expect(await code(retireCharacter(store, "user_a", c.id))).toBe("not_found");
  });

  it("retires an available character once", async () => {
    const c = await createCharacter(store, "user_b", { system: "quest", name: "Rook", choices: { role: "fighter", abilities: SIX } }, entropy());
    expect((await retireCharacter(store, "user_b", c.id)).status).toBe("retired");
    expect(await code(retireCharacter(store, "user_b", c.id))).toBe("conflict");
  });

  it("pages the owner's characters, newest first", async () => {
    const e = entropy();
    for (const name of ["One", "Two", "Three"]) await createCharacter(store, "user_b", { system: "quest", name, choices: { role: "fighter", abilities: SIX } }, e);
    const first = await listCharacters(store, "user_b", { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const second = await listCharacters(store, "user_b", { limit: 2, cursor: first.next_cursor });
    expect(second.items).toHaveLength(1);
    expect(second.next_cursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((c) => c.name))).toEqual(new Set(["One", "Two", "Three"]));
    expect((await listCharacters(store, "user_b", { system: "cadmium" })).items).toEqual([]);
    expect(await code(listCharacters(store, "user_b", { limit: 0 }))).toBe("invalid_request");
  });

  it("offers the abilities of listed settings, including Quest settings for Cadmium", async () => {
    const quest = await abilityOptions(store, "quest");
    expect(quest.map((a) => a.ref).sort()).toEqual([...SIX].sort());
    expect((await abilityOptions(store, "cadmium")).length).toBe(6);
    await store.setListed("setting", "derelict_station", "3.0.0", false);
    expect(await abilityOptions(store, "quest")).toEqual([]);
  });
});
