// Instances in the lobby (api.md, Instances: create_instance, list_instances, get_instance,
// add_character, remove_character; data-model.md, Instance, Instance character). Starting, pausing,
// resuming, and ending run through the coordinator (sprint 13).

import { satisfies } from "../materials/semver";
import type { InstanceView, Store, UserRecord } from "../store";
import { SYSTEMS } from "../systems";
import { membership } from "./campaigns";
import { cryptoEntropy, type Entropy } from "./entropy";
import { ApiError, onlyFields } from "./errors";
import { accepted } from "./systems";
import { caller } from "./users";

const major = (version: string) => version.split(".")[0];

async function instanceOf(store: Store, user: UserRecord, instanceId: unknown): Promise<{ instance: InstanceView; role: "author" | "player" }> {
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

export async function getInstance(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "get_instance");
  const req = onlyFields(input, ["instance_id", "character_id"]);
  // The player's view of a running instance arrives with the coordinator (sprint 13).
  return { instance: (await instanceOf(store, user, req.instance_id)).instance };
}

// SPEC_ISSUES.md#cross-system-versions: a Quest character in a Cadmium instance keeps Quest's major version.
export async function addCharacter(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "add_character");
  const req = onlyFields(input, ["instance_id", "character_id"]);
  const { instance } = await instanceOf(store, user, req.instance_id);
  if (typeof req.character_id !== "string") throw new ApiError("invalid_request", "character_id must be a string");
  const character = await store.getCharacter(req.character_id);
  if (!character || character.owner_id !== user.id) throw new ApiError("not_found", "no such character");
  if (!accepted(instance.system).includes(character.system)) throw new ApiError("system_mismatch", `a ${instance.system} instance does not accept ${character.system} characters`);
  const against = character.system === instance.system ? instance.system_version : SYSTEMS[character.system]!.VERSION;
  if (major(character.system_version) !== major(against)) throw new ApiError("system_mismatch", `the character is for ${character.system} ${character.system_version}, not ${against}`);
  if (instance.status !== "lobby") throw new ApiError("conflict", `characters join an instance in the lobby; this one is ${instance.status}`);
  if (character.status !== "available") throw new ApiError("conflict", `the character is ${character.status.replace("_", " ")}`);
  if (!(await store.joinInstance(instance.id, character.id, user.id))) throw new ApiError("conflict", "the character is no longer available");
  return (await store.instanceView(instance.id))!;
}

export async function removeCharacter(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "remove_character");
  const req = onlyFields(input, ["instance_id", "character_id"]);
  const { instance, role } = await instanceOf(store, user, req.instance_id);
  const entry = instance.characters.find((c) => c.id === req.character_id);
  if (!entry) throw new ApiError("not_found", "the character is not in the instance");
  if (entry.user_id !== user.id && role !== "author") throw new ApiError("forbidden", "only the character's owner or the author may remove it");
  if (instance.status !== "lobby") throw new ApiError("conflict", `characters leave an instance in the lobby; this one is ${instance.status}`);
  await store.leaveInstance(instance.id, entry.id);
  return (await store.instanceView(instance.id))!;
}
