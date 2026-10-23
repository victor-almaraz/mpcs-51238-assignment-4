// Instances (api.md, Instances; Play: submit_action; data-model.md, Instance, Instance character).
// Writes to a started instance go through the Instance Coordinator.

import { AdminError } from "../coordinator/admin";
import * as coordinator from "../coordinator/instance";
import { processInput } from "../coordinator/inputs";
import type { AdventureBundle } from "../bundle/adventure";
import { satisfies } from "../materials/semver";
import type { InstanceView, Store, UserRecord } from "../store";
import { SYSTEMS } from "../systems";
import { membership } from "./campaigns";
import { cryptoEntropy, type Entropy } from "./entropy";
import { ApiError, onlyFields } from "./errors";
import { accepted } from "./systems";
import { caller } from "./users";

export type Deps = coordinator.Deps;

const major = (version: string) => version.split(".")[0];

/** Runs a coordinator call, turning its errors into operation errors. */
export async function coordinated<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof coordinator.CoordinatorError) throw new ApiError(e.code, e.message, e.engineCode ? { engine_code: e.engineCode } : {});
    // A pinned bundle or system version that is no longer installed.
    if (e instanceof AdminError) throw new ApiError("unavailable", e.message);
    throw e;
  }
}

export async function instanceOf(store: Store, user: UserRecord, instanceId: unknown): Promise<{ instance: InstanceView; role: "author" | "player" }> {
  if (typeof instanceId !== "string") throw new ApiError("invalid_request", "instance_id must be a string");
  const instance = await store.instanceView(instanceId);
  if (!instance) throw new ApiError("not_found", "no such instance");
  const { role } = await membership(store, user, instance.campaign_id).catch(() => {
    throw new ApiError("not_found", "no such instance");
  });
  return { instance, role };
}

export async function createInstance(store: Store, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "create_instance");
  const req = onlyFields(input, ["campaign_id", "name"]);
  const { campaign } = await membership(store, user, req.campaign_id, "author");
  if (campaign.archived) throw new ApiError("conflict", "an archived campaign accepts no new instances");
  if (typeof req.name !== "string" || req.name.trim().length < 1 || req.name.length > 80) throw new ApiError("invalid_request", "name must have 1 to 80 characters");
  const name = req.name;
  const existing = await store.listInstances(campaign.id);
  if (existing.some((i) => i.name === name)) throw new ApiError("conflict", `the campaign already has an instance named ${name}`);
  // The newest installed version within the range; one version of each system is installed.
  const system = SYSTEMS[campaign.system]!;
  if (!satisfies(system.VERSION, campaign.system_versions)) throw new ApiError("system_mismatch", `no installed ${campaign.system} version satisfies ${campaign.system_versions}`);
  const id = entropy.id("i");
  await store.createInstance({
    id,
    campaign_id: campaign.id,
    name,
    system: system.ID,
    system_version: system.VERSION,
    modules: campaign.modules,
    materials: campaign.materials.map((m, position) => ({ ...m, position })),
    seed: entropy.seed(),
  });
  return (await store.instanceView(id))!;
}

export async function listInstances(store: Store, userId: string | null, campaignId: unknown) {
  const user = await caller(store, userId, "list_instances");
  const { campaign } = await membership(store, user, campaignId);
  return store.listInstances(campaign.id);
}

/** The caller's character in the instance: `characterId` when given, else their only one. */
function actorOf(instance: InstanceView, user: UserRecord, characterId: unknown): string {
  const mine = instance.characters.filter((c) => c.user_id === user.id).map((c) => c.id);
  if (characterId !== undefined) {
    if (typeof characterId !== "string" || !mine.includes(characterId)) throw new ApiError("invalid_request", "character_id is not one of your characters in the instance");
    return characterId;
  }
  if (mine.length === 0) throw new ApiError("forbidden", "you have no character in the instance");
  if (mine.length > 1) throw new ApiError("invalid_request", "you have several characters in the instance; pass character_id");
  return mine[0]!;
}

export async function getInstance(deps: Deps, userId: string | null, input: unknown) {
  const user = await caller(deps.store, userId, "get_instance");
  const req = onlyFields(input, ["instance_id", "character_id"]);
  let { instance } = await instanceOf(deps.store, user, req.instance_id);
  if (instance.status === "active" && (await coordinated(coordinator.catchUp(deps, instance.id)))) instance = (await deps.store.instanceView(instance.id))!;
  const started = instance.status === "active" || instance.status === "paused";
  const playing = instance.characters.some((c) => c.user_id === user.id);
  if (!started || (!playing && req.character_id === undefined)) return { instance };
  const v = await coordinated(coordinator.characterView(deps, instance.id, actorOf(instance, user, req.character_id)));
  return v ? { instance, view: v } : { instance };
}

// SPEC_ISSUES.md#cross-system-versions: a Quest character in a Cadmium instance keeps Quest's major version.
export async function addCharacter(deps: Deps, userId: string | null, input: unknown) {
  const { store } = deps;
  const user = await caller(store, userId, "add_character");
  const req = onlyFields(input, ["instance_id", "character_id"]);
  const { instance } = await instanceOf(store, user, req.instance_id);
  if (typeof req.character_id !== "string") throw new ApiError("invalid_request", "character_id must be a string");
  const character = await store.getCharacter(req.character_id);
  if (!character || character.owner_id !== user.id) throw new ApiError("not_found", "no such character");
  if (!accepted(instance.system).includes(character.system)) throw new ApiError("system_mismatch", `a ${instance.system} instance does not accept ${character.system} characters`);
  const against = character.system === instance.system ? instance.system_version : SYSTEMS[character.system]!.VERSION;
  if (major(character.system_version) !== major(against)) throw new ApiError("system_mismatch", `the character is for ${character.system} ${character.system_version}, not ${against}`);
  if (instance.status !== "lobby" && instance.status !== "paused") throw new ApiError("conflict", `characters join an instance in the lobby or paused; this one is ${instance.status}`);
  if (character.status !== "available") throw new ApiError("conflict", `the character is ${character.status.replace("_", " ")}`);
  if (!(await store.joinInstance(instance.id, character.id, user.id))) throw new ApiError("conflict", "the character is no longer available");
  if (instance.status === "paused") {
    try {
      await coordinated(coordinator.joinPaused(deps, instance.id, { id: character.id, user_id: user.id, sheet: character.sheet }));
    } catch (e) {
      await store.leaveInstance(instance.id, character.id);
      throw e;
    }
  }
  return (await store.instanceView(instance.id))!;
}

/** Takes a character out: directly in the lobby, through the coordinator once started. */
export async function takeOut(deps: Deps, instance: InstanceView, characterId: string): Promise<void> {
  if (instance.status === "lobby") await deps.store.leaveInstance(instance.id, characterId);
  else if (instance.status === "active" || instance.status === "paused") await coordinated(coordinator.leaveParty(deps, instance.id, characterId));
}

export async function removeCharacter(deps: Deps, userId: string | null, input: unknown) {
  const user = await caller(deps.store, userId, "remove_character");
  const req = onlyFields(input, ["instance_id", "character_id"]);
  const { instance, role } = await instanceOf(deps.store, user, req.instance_id);
  const entry = instance.characters.find((c) => c.id === req.character_id);
  if (!entry) throw new ApiError("not_found", "the character is not in the instance");
  if (entry.user_id !== user.id && role !== "author") throw new ApiError("forbidden", "only the character's owner or the author may remove it");
  if (instance.status !== "lobby" && instance.status !== "paused") throw new ApiError("conflict", `characters leave an instance in the lobby or paused; this one is ${instance.status}`);
  await takeOut(deps, instance, entry.id);
  return (await deps.store.instanceView(instance.id))!;
}

async function authorInstance(deps: Deps, userId: string | null, operation: string, instanceId: unknown) {
  const user = await caller(deps.store, userId, operation);
  const { instance, role } = await instanceOf(deps.store, user, instanceId);
  if (role !== "author") throw new ApiError("forbidden", "only the campaign's author may do this");
  return instance;
}

export async function startInstance(deps: Deps, userId: string | null, instanceId: unknown) {
  const instance = await authorInstance(deps, userId, "start_instance", instanceId);
  if (instance.status !== "lobby") throw new ApiError("conflict", `the instance is ${instance.status}, not in the lobby`);
  const adventure = instance.materials.find((m) => m.kind === "adventure")!;
  const bundle = (await deps.store.getBundle("adventure", adventure.id, adventure.version)) as AdventureBundle | undefined;
  if (!bundle) throw new ApiError("unavailable", `adventure ${adventure.id} ${adventure.version} is not installed`);
  const [min, max] = bundle.manifest.players;
  const n = instance.characters.length;
  if (n < min || n > max) throw new ApiError("conflict", `the adventure takes ${min} to ${max} characters; the instance has ${n}`);
  const joining = await Promise.all(
    instance.characters.map(async (c) => {
      const record = (await deps.store.getCharacter(c.id))!;
      return { id: c.id, user_id: c.user_id, sheet: record.sheet };
    }),
  );
  await coordinated(coordinator.start(deps, instance.id, joining));
  return (await deps.store.instanceView(instance.id))!;
}

async function changeStatus(deps: Deps, userId: string | null, operation: string, instanceId: unknown, status: "active" | "paused" | "ended") {
  const instance = await authorInstance(deps, userId, operation, instanceId);
  await coordinated(coordinator.setStatus(deps, instance.id, status));
  return (await deps.store.instanceView(instance.id))!;
}

export const pauseInstance = (deps: Deps, userId: string | null, instanceId: unknown) => changeStatus(deps, userId, "pause_instance", instanceId, "paused");
export const resumeInstance = (deps: Deps, userId: string | null, instanceId: unknown) => changeStatus(deps, userId, "resume_instance", instanceId, "active");
export const endInstance = (deps: Deps, userId: string | null, instanceId: unknown) => changeStatus(deps, userId, "end_instance", instanceId, "ended");

export async function advanceRound(deps: Deps, userId: string | null, instanceId: unknown): Promise<void> {
  const instance = await authorInstance(deps, userId, "advance_round", instanceId);
  await coordinated(coordinator.advanceRound(deps, instance.id));
}

const KEY = /^.{8,64}$/s;

/** submit_action: a tool call without the parser, through the same validation and commit path. */
export async function submitAction(deps: Deps, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const { store } = deps;
  const user = await caller(store, userId, "submit_action");
  const req = onlyFields(input, ["instance_id", "character_id", "tool", "args", "idempotency_key"]);
  const { instance } = await instanceOf(store, user, req.instance_id);
  const actor = actorOf(instance, user, req.character_id);
  if (typeof req.idempotency_key !== "string" || !KEY.test(req.idempotency_key)) throw new ApiError("invalid_request", "idempotency_key must have 8 to 64 characters");
  if (typeof req.tool !== "string") throw new ApiError("invalid_request", "tool must be a string");
  if (req.args === null || typeof req.args !== "object" || Array.isArray(req.args)) throw new ApiError("invalid_request", "args must be an object");
  const id = entropy.id("in");
  const fresh = await store.logInput({ id, instance_id: instance.id, user_id: user.id, idempotency_key: req.idempotency_key, text: null, tool_calls: [{ tool: req.tool, args: req.args }] });
  if (!fresh) {
    // A repeated key returns the original result without reprocessing.
    const original = (await store.inputByKey(instance.id, user.id, req.idempotency_key))!;
    return { accepted: true, input_id: original.id };
  }
  if (instance.status !== "active") {
    await store.rejectInput(id);
    throw new ApiError("conflict", `the instance is ${instance.status}`);
  }
  const outcome = await coordinated(coordinator.act(deps, instance.id, actor, { tool: req.tool, args: req.args as Record<string, unknown> }, id));
  if ("rejected" in outcome) {
    await store.rejectInput(id);
    const current = (await store.instanceView(instance.id))!;
    await deps.broadcast.send(`user:${user.id}`, [{ type: "input_rejected", instance_id: instance.id, version: current.version, input_id: id, reason: outcome.rejected.code, detail: outcome.rejected.detail }]).catch(() => undefined);
  }
  return { accepted: true, input_id: id };
}

export async function getHistory(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "get_history");
  const req = onlyFields(input, ["instance_id", "after_version", "limit"]);
  const { instance } = await instanceOf(store, user, req.instance_id);
  const after = req.after_version ?? 0;
  const limit = req.limit ?? 50;
  if (typeof after !== "number" || !Number.isInteger(after) || after < 0) throw new ApiError("invalid_request", "after_version must be a non-negative integer");
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new ApiError("invalid_request", "limit must be 1 to 200");
  const page = await store.history(instance.id, after, limit + 1);
  const items = page.slice(0, limit);
  return { items, next_after_version: page.length > limit ? items.at(-1)!.version : null };
}

/** Seconds after which an unfinished input no longer blocks the character's next one. */
const PROCESSING_SECONDS = 60;

/** submit_input: free text through the Parser Adapter (api.md, Play). Outcomes arrive as messages. */
export async function submitInput(deps: Deps, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const { store } = deps;
  const user = await caller(store, userId, "submit_input");
  const req = onlyFields(input, ["instance_id", "character_id", "text", "idempotency_key"]);
  const { instance } = await instanceOf(store, user, req.instance_id);
  const actor = actorOf(instance, user, req.character_id);
  if (typeof req.text !== "string" || req.text.trim().length < 1 || req.text.length > 500) throw new ApiError("invalid_request", "text must have 1 to 500 characters");
  if (typeof req.idempotency_key !== "string" || !KEY.test(req.idempotency_key)) throw new ApiError("invalid_request", "idempotency_key must have 8 to 64 characters");
  if (!deps.parser) throw new ApiError("unavailable", "text input is not available; use actions");
  const repeated = await store.inputByKey(instance.id, user.id, req.idempotency_key);
  if (repeated) return { accepted: true, input_id: repeated.id };
  if (instance.status !== "active") throw new ApiError("conflict", `the instance is ${instance.status}`);
  if (await store.inputProcessing(instance.id, actor, PROCESSING_SECONDS)) throw new ApiError("rate_limited", "an input is already in processing", { retry_after_ms: 1500 });
  const id = entropy.id("in");
  const fresh = await store.logInput({ id, instance_id: instance.id, user_id: user.id, idempotency_key: req.idempotency_key, text: req.text });
  if (!fresh) return { accepted: true, input_id: (await store.inputByKey(instance.id, user.id, req.idempotency_key))!.id };
  await store.setInputCharacter(id, actor);
  try {
    await coordinated(processInput(deps, instance.id, actor, req.text, id));
  } catch (e) {
    await store.rejectInput(id);
    const current = (await store.instanceView(instance.id))!;
    const reason = e instanceof ApiError ? (e.extra.engine_code as string | undefined) ?? e.code : "unavailable";
    await deps.broadcast.send(`user:${user.id}`, [{ type: "input_rejected", instance_id: instance.id, version: current.version, input_id: id, reason }]).catch(() => undefined);
    if (!(e instanceof ApiError)) throw e;
  }
  return { accepted: true, input_id: id };
}
