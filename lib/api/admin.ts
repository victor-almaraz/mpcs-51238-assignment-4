// Administrative operations (api.md, Administrative operations; runbooks/content-publishing.md,
// content-reports.md, instance-recovery.md). Only users with `operator: true`; everyone else gets
// not_found (app-flow.md, Redirect rules: a non-operator opening /admin gets the 404 page). Every
// operation is written to the operator log.

import { loadSettingBundle, type SettingBundle } from "../bundle/setting";
import { loadAdventureBundle, type AdventureBundle } from "../bundle/adventure";
import { AdminError, replayInstance as replay, restoreInstance as restore } from "../coordinator/admin";
import { leaveParty, setStatus } from "../coordinator/instance";
import { sha256 } from "../export/sha256";
import { satisfies } from "../materials/semver";
import type { Store, UserRecord } from "../store";
import { SYSTEMS } from "../systems";
import { ApiError, onlyFields } from "./errors";
import { coordinated, type Deps } from "./instances";
import { caller } from "./users";

export async function operator(store: Store, userId: string | null, operation: string): Promise<UserRecord> {
  const user = await caller(store, userId, operation);
  if (!(await store.isOperator(user.id))) throw new ApiError("not_found", "not found");
  return user;
}

async function admin<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AdminError) throw new ApiError(e.code, e.message);
    throw e;
  }
}

const text = (v: unknown, field: string, max = 500): string => {
  if (typeof v !== "string" || v.trim() === "" || v.length > max) throw new ApiError("invalid_request", `${field} must have 1 to ${max} characters`);
  return v;
};

/** publish_bundle: stores a compiled bundle with origin operator, listed. */
export async function publishBundle(store: Store, userId: string | null, input: unknown) {
  const user = await operator(store, userId, "publish_bundle");
  const req = onlyFields(input, ["kind", "bundle"]);
  // SPEC_ISSUES.md#asset-delivery: the asset files travel beside the bundle, keyed by SHA-256.
  const { files = {}, ...json } = (req.bundle && typeof req.bundle === "object" ? req.bundle : {}) as { files?: Record<string, { mime: string; data: string; width?: number; height?: number }> };
  let bundle: SettingBundle | AdventureBundle;
  try {
    if (req.kind === "setting") bundle = loadSettingBundle(json);
    else if (req.kind === "adventure") bundle = loadAdventureBundle(json);
    else throw new ApiError("invalid_request", "kind must be setting or adventure");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("invalid_request", `the bundle does not load: ${(e as Error).message}`);
  }
  if (await store.getBundle(bundle.kind, bundle.id, bundle.version)) throw new ApiError("conflict", `${bundle.kind} ${bundle.id} ${bundle.version} is already published`);
  const system = SYSTEMS[bundle.manifest.system.id];
  if (!system || !satisfies(system.VERSION, bundle.manifest.system.versions)) throw new ApiError("system_mismatch", `no installed ${bundle.manifest.system.id} version satisfies ${bundle.manifest.system.versions}`);
  if (bundle.kind === "adventure") {
    const settings = (await store.allBundles()).filter((b) => b.kind === "setting");
    for (const r of bundle.manifest.requires_settings) {
      if (!settings.some((s) => s.id === r.id && satisfies(s.version, r.versions))) throw new ApiError("invalid_request", `no published setting ${r.id} satisfies ${r.versions}`);
    }
  }
  type Declared = { kind: string; alt: string; license?: string; credit?: string; provenance?: string; hash?: string; mime?: string };
  const declared = Object.entries(bundle.assets).filter(([, a]) => a && "file" in a.source) as [string, Declared][];
  const incoming: { key: string; asset: Declared & { hash: string; mime: string; width?: number; height?: number }; data: Uint8Array | null }[] = [];
  for (const [key, a] of declared) {
    if (!a.hash || !a.mime) throw new ApiError("invalid_request", `asset ${key} has no hash; build the bundle with this version of the compiler`);
    const f = files[a.hash];
    if (!f) {
      // The same file may already be stored for another bundle.
      if (!(await store.getAsset(a.hash))) throw new ApiError("invalid_request", `the file of asset ${key} is missing`);
      incoming.push({ key, asset: { ...a, hash: a.hash, mime: a.mime }, data: null });
      continue;
    }
    const data = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    if (sha256(data) !== a.hash || f.mime !== a.mime) throw new ApiError("invalid_request", `the file of asset ${key} does not match its hash or type`);
    incoming.push({ key, asset: { ...a, hash: a.hash, mime: a.mime, ...(f.width ? { width: f.width, height: f.height } : {}) }, data });
  }
  await store.putBundle(bundle, { origin: "operator", listed: true });
  const ref = `${bundle.kind}:${bundle.id}@${bundle.version}`;
  for (const { key, asset, data } of incoming) {
    if (data) await store.putAsset(asset, data, { bundle_id: ref, key });
    else await store.addAssetRef(asset.hash, { bundle_id: ref, key });
  }
  await store.logOperation(user.id, "publish_bundle", ref);
  return { kind: bundle.kind, id: bundle.id, version: bundle.version };
}

export async function setListed(store: Store, userId: string | null, input: unknown) {
  const user = await operator(store, userId, "set_listed");
  const req = onlyFields(input, ["kind", "id", "version", "listed"]);
  if (typeof req.listed !== "boolean" || typeof req.id !== "string" || typeof req.version !== "string" || (req.kind !== "setting" && req.kind !== "adventure")) throw new ApiError("invalid_request", "kind, id, version, and listed are required");
  if (!(await store.getBundle(req.kind, req.id, req.version))) throw new ApiError("not_found", "no such bundle");
  await store.setListed(req.kind, req.id, req.version, req.listed);
  await store.logOperation(user.id, req.listed ? "list" : "unlist", `${req.kind}:${req.id}@${req.version}`);
}

export async function listBundles(store: Store, userId: string | null) {
  await operator(store, userId, "list_bundles");
  return store.allBundles();
}

/** inspect_instance: the instance with its full, unfiltered state. */
export async function inspectInstance(store: Store, userId: string | null, instanceId: unknown, reason: unknown) {
  const user = await operator(store, userId, "inspect_instance");
  if (typeof instanceId !== "string") throw new ApiError("invalid_request", "instance_id must be a string");
  const instance = await store.getInstance(instanceId);
  if (!instance) throw new ApiError("not_found", "no such instance");
  await store.logOperation(user.id, "inspect_instance", instanceId, text(reason, "reason"));
  return instance;
}

export async function replayInstance(store: Store, userId: string | null, input: unknown) {
  const user = await operator(store, userId, "replay_instance");
  const req = onlyFields(input, ["instance_id", "to_version"]);
  if (typeof req.instance_id !== "string") throw new ApiError("invalid_request", "instance_id must be a string");
  const r = await admin(replay(store, req.instance_id, req.to_version as number | undefined));
  await store.logOperation(user.id, "replay_instance", req.instance_id, `matches_stored=${r.matches_stored}`);
  return r;
}

export async function restoreInstance(store: Store, userId: string | null, input: unknown) {
  const user = await operator(store, userId, "restore_instance");
  const req = onlyFields(input, ["instance_id", "to_version", "reason"]);
  if (typeof req.instance_id !== "string" || typeof req.to_version !== "number") throw new ApiError("invalid_request", "instance_id and to_version are required");
  const r = await admin(restore(store, req.instance_id, req.to_version, text(req.reason, "reason")));
  await store.logOperation(user.id, "restore_instance", req.instance_id, `to ${req.to_version}: ${req.reason as string}`);
  return r;
}

// Reports -----------------------------------------------------------------------------------------

type Kind = "user" | "character" | "campaign";
const KINDS: Kind[] = ["user", "character", "campaign"];

/** Sets a hold on a record and its owner, so neither deletion nor shutdown erases them. */
export async function hold(store: Store, userId: string | null, input: unknown) {
  const user = await operator(store, userId, "hold");
  const req = onlyFields(input, ["kind", "id", "reason"]);
  if (!KINDS.includes(req.kind as Kind) || typeof req.id !== "string") throw new ApiError("invalid_request", "kind (user, character, campaign) and id are required");
  const reason = text(req.reason, "reason");
  if (!(await store.setHold(req.kind as Kind, req.id, reason))) throw new ApiError("not_found", "no such record");
  await store.logOperation(user.id, "hold", `${req.kind as string}:${req.id}`, reason);
}

export async function release(store: Store, userId: string | null, input: unknown) {
  const user = await operator(store, userId, "release_hold");
  const req = onlyFields(input, ["kind", "id", "note"]);
  if (!KINDS.includes(req.kind as Kind) || typeof req.id !== "string") throw new ApiError("invalid_request", "kind and id are required");
  if (!(await store.setHold(req.kind as Kind, req.id, null))) throw new ApiError("not_found", "no such record");
  await store.logOperation(user.id, "release_hold", `${req.kind as string}:${req.id}`, typeof req.note === "string" ? req.note : "");
}

export async function suspend(store: Store, userId: string | null, input: unknown) {
  const user = await operator(store, userId, "suspend");
  const req = onlyFields(input, ["user_id", "suspended", "reason"]);
  if (typeof req.user_id !== "string" || typeof req.suspended !== "boolean") throw new ApiError("invalid_request", "user_id and suspended are required");
  if (!(await store.setSuspended(req.user_id, req.suspended))) throw new ApiError("not_found", "no such user");
  await store.logOperation(user.id, req.suspended ? "suspend" : "unsuspend", `user:${req.user_id}`, typeof req.reason === "string" ? req.reason : "");
}

/** Removes a character from every user's view, taking it out of a running game first. */
export async function removeCharacterContent(deps: Deps, userId: string | null, input: unknown) {
  const user = await operator(deps.store, userId, "remove_content");
  const req = onlyFields(input, ["character_id", "reason"]);
  if (typeof req.character_id !== "string") throw new ApiError("invalid_request", "character_id is required");
  const c = await deps.store.getCharacter(req.character_id);
  if (!c) throw new ApiError("not_found", "no such character");
  if (c.instance_id) {
    const i = await deps.store.instanceView(c.instance_id);
    if (i && (i.status === "active" || i.status === "paused")) await coordinated(leaveParty(deps, i.id, c.id));
  }
  await deps.store.removeCharacter(c.id);
  await deps.store.logOperation(user.id, "remove_character", `character:${c.id}`, text(req.reason, "reason"));
}

/** Ends a game (runbooks/content-reports.md: remove content, end games, or suspend accounts). */
export async function endGame(deps: Deps, userId: string | null, input: unknown) {
  const user = await operator(deps.store, userId, "end_game");
  const req = onlyFields(input, ["instance_id", "reason"]);
  if (typeof req.instance_id !== "string") throw new ApiError("invalid_request", "instance_id is required");
  const i = await deps.store.instanceView(req.instance_id);
  if (!i) throw new ApiError("not_found", "no such instance");
  if (i.status === "lobby") {
    for (const c of i.characters) await deps.store.leaveInstance(i.id, c.id);
    await deps.store.setInstanceStatus(i.id, i.version, "ended", null);
  } else if (i.status !== "ended") await coordinated(setStatus(deps, i.id, "ended"));
  await deps.store.logOperation(user.id, "end_game", `instance:${i.id}`, text(req.reason, "reason"));
}

/** Removes a campaign from every user's view; its games end. */
export async function removeCampaignContent(deps: Deps, userId: string | null, input: unknown) {
  const user = await operator(deps.store, userId, "remove_content");
  const req = onlyFields(input, ["campaign_id", "reason"]);
  if (typeof req.campaign_id !== "string") throw new ApiError("invalid_request", "campaign_id is required");
  const k = await deps.store.getCampaign(req.campaign_id);
  if (!k) throw new ApiError("not_found", "no such campaign");
  const reason = text(req.reason, "reason");
  for (const id of k.instance_ids) await endGame(deps, userId, { instance_id: id, reason });
  await deps.store.deleteCampaign(k.id);
  await deps.store.logOperation(user.id, "remove_campaign", `campaign:${k.id}`, reason);
}

export async function operatorLog(store: Store, userId: string | null) {
  await operator(store, userId, "operator_log");
  return store.operatorLog();
}

/** Removes a reported image: it stops being served, and clients fall back (runbooks/content-reports.md, Images). */
export async function removeAssetContent(store: Store, userId: string | null, input: unknown) {
  const user = await operator(store, userId, "remove_content");
  const req = onlyFields(input, ["hash", "reason"]);
  if (typeof req.hash !== "string" || !(await store.removeAsset(req.hash))) throw new ApiError("not_found", "no such asset");
  await store.logOperation(user.id, "remove_asset", `asset:${req.hash}`, text(req.reason, "reason"));
}
