// Administrative operations (api.md, Administrative operations; runbooks/content-publishing.md,
// content-reports.md, instance-recovery.md). Only users with `operator: true`; everyone else gets
// not_found (app-flow.md, Redirect rules: a non-operator opening /admin gets the 404 page). Every
// operation is written to the operator log.

import { loadSettingBundle, type SettingBundle } from "../bundle/setting";
import { loadAdventureBundle, type AdventureBundle } from "../bundle/adventure";
import { AdminError, replayInstance as replay, restoreInstance as restore } from "../coordinator/admin";
import { leaveParty } from "../coordinator/instance";
import { sha256 } from "../export/sha256";
import { satisfies } from "../materials/semver";
import type { Store, UserRecord } from "../store";
import { SYSTEMS } from "../systems";
import { endGames } from "./campaigns";
import { ApiError, onlyFields } from "./errors";
import { coordinated, endAny, type Deps } from "./instances";
import { bundleRef, deleteUnused } from "./materials";
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
  // The asset files travel beside the bundle, keyed by SHA-256 (spec/README.md, "Asset files").
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

/** delete_bundle: the operator deletes a bundle version that no campaign or game uses. */
export async function deleteBundle(store: Store, userId: string | null, input: unknown) {
  const user = await operator(store, userId, "delete_bundle");
  const ref = bundleRef(input);
  if (!(await store.getBundle(ref.kind, ref.id, ref.version))) throw new ApiError("not_found", "no such bundle");
  await deleteUnused(store, ref);
  await store.logOperation(user.id, "delete_bundle", `${ref.kind}:${ref.id}@${ref.version}`);
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

// Each report action has an operation, which checks the operator, and the action itself, which takes
// the operator already checked, as the Reports form does once for whichever action it applies.

/** Sets a hold on a record and its owner, so neither deletion nor shutdown erases them. */
export const hold = async (store: Store, userId: string | null, input: unknown) => holdBy(store, await operator(store, userId, "hold"), input);

async function holdBy(store: Store, user: UserRecord, input: unknown) {
  const req = onlyFields(input, ["kind", "id", "reason"]);
  if (!KINDS.includes(req.kind as Kind) || typeof req.id !== "string") throw new ApiError("invalid_request", "kind (user, character, campaign) and id are required");
  const reason = text(req.reason, "reason");
  if (!(await store.setHold(req.kind as Kind, req.id, reason))) throw new ApiError("not_found", "no such record");
  await store.logOperation(user.id, "hold", `${req.kind as string}:${req.id}`, reason);
}

export const release = async (store: Store, userId: string | null, input: unknown) => releaseBy(store, await operator(store, userId, "release_hold"), input);

async function releaseBy(store: Store, user: UserRecord, input: unknown) {
  const req = onlyFields(input, ["kind", "id", "note"]);
  if (!KINDS.includes(req.kind as Kind) || typeof req.id !== "string") throw new ApiError("invalid_request", "kind and id are required");
  if (!(await store.setHold(req.kind as Kind, req.id, null))) throw new ApiError("not_found", "no such record");
  await store.logOperation(user.id, "release_hold", `${req.kind as string}:${req.id}`, typeof req.note === "string" ? req.note : "");
}

export const suspend = async (store: Store, userId: string | null, input: unknown) => suspendBy(store, await operator(store, userId, "suspend"), input);

async function suspendBy(store: Store, user: UserRecord, input: unknown) {
  const req = onlyFields(input, ["user_id", "suspended", "reason"]);
  if (typeof req.user_id !== "string" || typeof req.suspended !== "boolean") throw new ApiError("invalid_request", "user_id and suspended are required");
  if (!(await store.setSuspended(req.user_id, req.suspended))) throw new ApiError("not_found", "no such user");
  await store.logOperation(user.id, req.suspended ? "suspend" : "unsuspend", `user:${req.user_id}`, typeof req.reason === "string" ? req.reason : "");
}

/**
 * Removes a character from every user's view for good, taking it out of a running game first. Its
 * owner cannot restore it, even when they had deleted it first.
 */
export const removeCharacterContent = async (deps: Deps, userId: string | null, input: unknown) => removeCharacterBy(deps, await operator(deps.store, userId, "remove_content"), input);

async function removeCharacterBy(deps: Deps, user: UserRecord, input: unknown) {
  const req = onlyFields(input, ["character_id", "reason"]);
  if (typeof req.character_id !== "string") throw new ApiError("invalid_request", "character_id is required");
  const reason = text(req.reason, "reason");
  const c = await deps.store.getCharacter(req.character_id);
  if (c?.instance_id) {
    const i = await deps.store.instanceView(c.instance_id);
    if (i && (i.status === "active" || i.status === "paused")) await coordinated(leaveParty(deps, i.id, c.id));
  }
  if (!(await deps.store.removeCharacter(req.character_id))) throw new ApiError("not_found", "no such character");
  await deps.store.logOperation(user.id, "remove_character", `character:${req.character_id}`, reason);
}

/** Ends a game (runbooks/content-reports.md: remove content, end games, or suspend accounts). */
export const endGame = async (deps: Deps, userId: string | null, input: unknown) => endGameBy(deps, await operator(deps.store, userId, "end_game"), input);

async function endGameBy(deps: Deps, user: UserRecord, input: unknown) {
  const req = onlyFields(input, ["instance_id", "reason"]);
  if (typeof req.instance_id !== "string") throw new ApiError("invalid_request", "instance_id is required");
  const reason = text(req.reason, "reason");
  const i = await deps.store.instanceView(req.instance_id);
  if (!i) throw new ApiError("not_found", "no such instance");
  await endAny(deps, i);
  await deps.store.logOperation(user.id, "end_game", `instance:${i.id}`, reason);
}

/** Removes a campaign from every user's view for good; its games end. Its author cannot restore it. */
export const removeCampaignContent = async (deps: Deps, userId: string | null, input: unknown) => removeCampaignBy(deps, await operator(deps.store, userId, "remove_content"), input);

async function removeCampaignBy(deps: Deps, user: UserRecord, input: unknown) {
  const req = onlyFields(input, ["campaign_id", "reason"]);
  if (typeof req.campaign_id !== "string") throw new ApiError("invalid_request", "campaign_id is required");
  const reason = text(req.reason, "reason");
  // A deleted campaign's games ended when it was deleted.
  const k = await deps.store.getCampaign(req.campaign_id);
  if (k) await endGames(deps, k);
  if (!(await deps.store.removeCampaign(req.campaign_id))) throw new ApiError("not_found", "no such campaign");
  await deps.store.logOperation(user.id, "remove_campaign", `campaign:${req.campaign_id}`, reason);
}

export async function operatorLog(store: Store, userId: string | null) {
  await operator(store, userId, "operator_log");
  return store.operatorLog();
}

/** Removes a reported image: it stops being served, and clients fall back (runbooks/content-reports.md, Images). */
export const removeAssetContent = async (store: Store, userId: string | null, input: unknown) => removeAssetBy(store, await operator(store, userId, "remove_content"), input);

async function removeAssetBy(store: Store, user: UserRecord, input: unknown) {
  const req = onlyFields(input, ["hash", "reason"]);
  const reason = text(req.reason, "reason");
  if (typeof req.hash !== "string" || !(await store.removeAsset(req.hash))) throw new ApiError("not_found", "no such asset");
  await store.logOperation(user.id, "remove_asset", `asset:${req.hash}`, reason);
}

/** The record kinds each action of the console's Reports form applies to. */
export const REPORT_ACTIONS = {
  hold: { label: "Hold", kinds: ["user", "character", "campaign"] },
  release: { label: "Release hold", kinds: ["user", "character", "campaign"] },
  remove: { label: "Remove content", kinds: ["character", "campaign", "asset"] },
  end: { label: "End game", kinds: ["instance"] },
  suspend: { label: "Suspend account", kinds: ["user"] },
  unsuspend: { label: "Lift suspension", kinds: ["user"] },
} as const satisfies Record<string, { label: string; kinds: readonly ReportKind[] }>;
export type ReportKind = "user" | "character" | "campaign" | "instance" | "asset";
export type ReportAction = keyof typeof REPORT_ACTIONS;
/** "a", "a or b", "a, b, or c". */
const either = (words: string[]) => (words.length < 3 ? words.join(" or ") : `${words.slice(0, -1).join(", ")}, or ${words.at(-1)}`);
const KIND_WORDS: Record<ReportKind, string> = { user: "a user", character: "a character", campaign: "a campaign", instance: "a game", asset: "an image" };

/**
 * One action of the Reports form on one record, checked against the kinds the action applies to; the
 * confirmation to show.
 */
export async function applyReport(deps: Deps, userId: string | null, input: unknown): Promise<string> {
  const user = await operator(deps.store, userId, "report");
  const req = onlyFields(input, ["action", "kind", "id", "reason"]);
  const action = REPORT_ACTIONS[req.action as ReportAction] ? (req.action as ReportAction) : null;
  if (!action) throw new ApiError("invalid_request", "choose an action");
  const kinds: readonly ReportKind[] = REPORT_ACTIONS[action].kinds;
  const kind = req.kind as ReportKind;
  if (!kinds.includes(kind)) throw new ApiError("invalid_request", `${REPORT_ACTIONS[action].label} applies to ${either(kinds.map((k) => KIND_WORDS[k]))}`);
  if (typeof req.id !== "string" || req.id.trim() === "") throw new ApiError("invalid_request", "enter the id of the record");
  const id = req.id.trim();
  const reason = req.reason;
  const target = `${KIND_WORDS[kind].replace(/^an? /, "")} ${id}`;
  if (action === "hold") await holdBy(deps.store, user, { kind, id, reason });
  else if (action === "release") await releaseBy(deps.store, user, { kind, id, note: reason });
  else if (action === "suspend" || action === "unsuspend") await suspendBy(deps.store, user, { user_id: id, suspended: action === "suspend", reason: text(reason, "reason") });
  else if (action === "end") await endGameBy(deps, user, { instance_id: id, reason });
  else if (kind === "character") await removeCharacterBy(deps, user, { character_id: id, reason });
  else if (kind === "campaign") await removeCampaignBy(deps, user, { campaign_id: id, reason });
  else await removeAssetBy(deps.store, user, { hash: id, reason });
  const done = { hold: "Held", release: "Released the hold on", remove: "Removed", end: "Ended", suspend: "Suspended", unsuspend: "Lifted the suspension of" }[action];
  return `${done} ${target}.`;
}

/**
 * What unlisting a setting version leaves without it: drafts whose range only this listed version
 * satisfies, and listed adventures resolved to it.
 */
export async function settingDependents(store: Store, userId: string | null, input: unknown): Promise<{ drafts: number; adventures: number }> {
  await operator(store, userId, "setting_dependents");
  const req = onlyFields(input, ["id", "version"]);
  if (typeof req.id !== "string" || typeof req.version !== "string") throw new ApiError("invalid_request", "id and version are required");
  const { id, version } = req as { id: string; version: string };
  const others = (await store.allBundles()).filter((b) => b.kind === "setting" && b.origin === "operator" && b.listed && b.id === id && b.version !== version).map((b) => b.version);
  const deps = await store.settingDependents(id);
  const drafts = deps.drafts.filter((r): r is string => typeof r === "string" && satisfies(version, r) && !others.some((v) => satisfies(v, r))).length;
  return { drafts, adventures: deps.adventures.filter((v) => v === version).length };
}
