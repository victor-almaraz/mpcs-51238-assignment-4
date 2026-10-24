// Characters (api.md, Characters; app-flow.md, Character creation and editor). The rules system builds
// every sheet from the player's choices with a server-generated seed; clients never submit sheet values.

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import { Rng } from "../rng";
import { RulesError, type RulesSystem } from "../systems";
import type { CharacterRecord, Store } from "../store";
import { cryptoEntropy, type Entropy } from "./entropy";
import { ApiError, onlyFields } from "./errors";
import { accepted, systemOrThrow } from "./systems";
import { caller } from "./users";

const validators = new Map<string, ValidateFunction>();

function sheetValidator(system: RulesSystem): ValidateFunction {
  const key = `${system.ID}@${system.VERSION}`;
  let v = validators.get(key);
  if (!v) {
    v = new Ajv2020({ allErrors: true, strict: false }).compile(system.SCHEMAS.character!);
    validators.set(key, v);
  }
  return v;
}

/** The character object (api.md, Character) as other members see it: the summary, not the sheet. */
export function characterSummaryView(c: CharacterRecord) {
  const system = systemOrThrow(c.system);
  return { id: c.id, owner_id: c.owner_id, name: c.name, system: c.system, system_version: c.system_version, status: c.status, instance_id: c.instance_id, portrait: c.portrait_asset, summary: system.summary(c.sheet) };
}

/** The character object as its owner sees it, with the sheet. */
export function characterView(c: CharacterRecord) {
  return { ...characterSummaryView(c), sheet: c.sheet };
}

const NAME = (v: unknown): string => {
  if (typeof v !== "string" || v.trim().length < 1 || v.length > 40) throw new ApiError("invalid_request", "name must have 1 to 40 characters");
  return v;
};

export async function createCharacter(store: Store, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "create_character");
  const req = onlyFields(input, ["system", "name", "choices"]);
  // Characters are created without modules; module fields come from the campaign (app-flow.md).
  const system = systemOrThrow(req.system).configure([]);
  const name = NAME(req.name);
  let sheet: CharacterRecord["sheet"];
  try {
    sheet = system.create_character(name, req.choices ?? {}, new Rng(entropy.seed())) as CharacterRecord["sheet"];
  } catch (e) {
    if (e instanceof RulesError) throw new ApiError("rules_rejected", e.detail, { rules_code: e.code });
    throw e;
  }
  if (!sheetValidator(system)(sheet)) throw new ApiError("rules_rejected", "the rules system built a sheet its schema rejects");
  const record = await store.createCharacter({ id: entropy.id("ch"), owner_id: user.id, system: system.ID, system_version: system.VERSION, name, sheet });
  return characterView(record);
}

/** The caller's own character, or not_found: other users' characters are never revealed here. */
async function owned(store: Store, userId: string, characterId: unknown): Promise<CharacterRecord> {
  if (typeof characterId !== "string") throw new ApiError("invalid_request", "character_id must be a string");
  const c = await store.getCharacter(characterId);
  if (!c || c.owner_id !== userId) throw new ApiError("not_found", "no such character");
  return c;
}

export async function getCharacter(store: Store, userId: string | null, characterId: unknown) {
  const user = await caller(store, userId, "get_character");
  // Members of the character's campaign see the summary (sprint 12); until then only the owner sees it.
  return characterView(await owned(store, user.id, characterId));
}

export async function listCharacters(store: Store, userId: string | null, input: unknown = {}) {
  const user = await caller(store, userId, "list_characters");
  const req = onlyFields(input, ["system", "status", "limit", "cursor"]);
  const limit = req.limit === undefined ? 20 : req.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError("invalid_request", "limit must be 1 to 100");
  for (const f of ["system", "status", "cursor"] as const) {
    if (req[f] !== undefined && typeof req[f] !== "string") throw new ApiError("invalid_request", `${f} must be a string`);
  }
  const page = await store.listCharacters(user.id, { system: req.system as string | undefined, status: req.status as string | undefined, limit: limit + 1, after: req.cursor as string | undefined });
  const items = page.slice(0, limit);
  return { items: items.map((c) => characterView(c)), next_cursor: page.length > limit ? items.at(-1)!.id : null };
}

export async function updateCharacter(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "update_character");
  const req = onlyFields(input, ["character_id", "name", "profile", "portrait"]);
  const c = await owned(store, user.id, req.character_id);
  if (req.portrait !== undefined) {
    // A portrait hash the user uploaded, or null to remove it.
    if (req.portrait !== null) {
      const a = typeof req.portrait === "string" ? await store.assetMeta(req.portrait) : undefined;
      if (!a || a.kind !== "portrait" || a.removed_at || !(await store.uploadedBy(a.hash, user.id))) throw new ApiError("invalid_request", "portrait must be the hash of a portrait you uploaded");
    }
    await store.setPortrait(c.id, req.portrait as string | null);
    if (req.name === undefined && req.profile === undefined) return characterView((await store.getCharacter(c.id))!);
  }
  // While the character is in an instance, the instance holds the authoritative sheet.
  if (c.status === "in_instance") throw new ApiError("conflict", "the character is in an instance");
  const name = req.name === undefined ? c.name : NAME(req.name);
  const sheet: CharacterRecord["sheet"] = { ...c.sheet, name };
  if (req.profile !== undefined) sheet.profile = req.profile as never;
  const system = systemOrThrow(c.system).configure([]);
  if (!sheetValidator(system)(sheet)) throw new ApiError("invalid_request", "the profile does not fit the system's character sheet");
  return characterView((await store.updateCharacter(c.id, name, sheet))!);
}

export async function retireCharacter(store: Store, userId: string | null, characterId: unknown) {
  const user = await caller(store, userId, "retire_character");
  const c = await owned(store, user.id, characterId);
  if (c.status !== "available" && c.status !== "dead") throw new ApiError("conflict", `a character that is ${c.status} cannot retire`);
  return characterView((await store.setCharacterStatus(c.id, "retired"))!);
}

export interface AbilityOption {
  ref: string;
  label: string;
  roles: string[];
  setting: string;
}

/**
 * Abilities the creation form offers for a system: those of the listed settings it accepts
 * (systems/README.md, Compatibility: Cadmium also accepts Quest settings).
 */
// SPEC_ISSUES.md#starting-abilities-supply: Quest needs six abilities; the example settings define two.
export async function abilityOptions(store: Store, systemId: string): Promise<AbilityOption[]> {
  const settings = await store.listedBundles<import("../bundle/setting").SettingBundle>("setting", accepted(systemId));
  return settings.flatMap((s) =>
    Object.entries(s.abilities).map(([key, a]) => ({ ref: `${s.namespace}:${key}`, label: a.label, roles: ((a.system_stats as { roles?: string[] }).roles ?? []).slice(), setting: s.manifest.title })),
  );
}

export async function deleteCharacter(store: Store, userId: string | null, characterId: unknown) {
  const user = await caller(store, userId, "delete_character");
  const c = await owned(store, user.id, characterId);
  if (c.status === "in_instance") throw new ApiError("conflict", "the character is in an instance");
  await store.deleteCharacter(c.id);
}

export async function restoreCharacter(store: Store, userId: string | null, characterId: unknown) {
  const user = await caller(store, userId, "restore_character");
  if (typeof characterId !== "string") throw new ApiError("invalid_request", "character_id must be a string");
  const gone = await store.deletedCharacter(characterId);
  if (!gone || gone.owner_id !== user.id) throw new ApiError("not_found", "no such deleted character");
  const c = await store.restoreCharacter(characterId);
  if (!c) throw new ApiError("conflict", "the character was deleted more than 30 days ago");
  return characterView(c);
}
