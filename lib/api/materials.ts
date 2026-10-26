// Materials and compatibility (api.md, Systems and materials: list_materials; Campaigns: the
// system_mismatch and invalid_request rules for materials; systems/README.md, Compatibility).

import type { AdventureManifest } from "../bundle/adventure";
import { satisfies } from "../materials/semver";
import type { MaterialRecord, MaterialRef, Store } from "../store";
import { SYSTEMS } from "../systems";
import { plural } from "../text";
import { ApiError, onlyFields } from "./errors";
import { accepted, systemOrThrow } from "./systems";
import { caller } from "./users";

/**
 * The material object of api.md; adventures add `requires_settings` and `players`. `modules` lists the
 * modules the material requires, so campaign forms can preselect them.
 */
export function materialView(m: MaterialRecord) {
  const base = { kind: m.kind, id: m.id, version: m.version, title: m.manifest.title, system: m.system, system_versions: m.system_versions, modules: m.manifest.system.modules.slice() };
  if (m.kind === "setting") return base;
  const a = m.manifest as AdventureManifest;
  return { ...base, requires_settings: a.requires_settings.map((r) => ({ id: r.id, versions: r.versions })), players: a.players };
}

export async function listMaterials(store: Store, userId: string | null, input: unknown = {}) {
  const user = await caller(store, userId, "list_materials");
  const req = onlyFields(input, ["system", "kind", "owner"]);
  if (req.kind !== undefined && req.kind !== "setting" && req.kind !== "adventure") throw new ApiError("invalid_request", "kind must be setting or adventure");
  if (req.owner !== undefined && req.owner !== "me") throw new ApiError("invalid_request", "owner must be me");
  const systems = req.system === undefined ? Object.keys(SYSTEMS) : accepted(systemOrThrow(req.system).ID);
  const list = await store.listMaterials(user.id, systems, (req.kind as string | undefined) ?? null, req.owner === "me");
  return list.map(materialView);
}

/** The version range a new campaign or draft declares for `version`: its major and minor version, as `^1.2`. */
export function defaultRange(version: string): string {
  const [major, minor] = version.split(".");
  return `^${major}.${minor}`;
}

/**
 * Whether a declaration for `system` with version range `range` fits a campaign of `campaignSystem`
 * with range `campaignRange`: the system is accepted, and the installed version of the declared system
 * satisfies its range and, for the campaign's own system, the campaign's range too.
 */
export function fits(system: string, range: string, campaignSystem: string, campaignRange: string): string | null {
  if (!accepted(campaignSystem).includes(system)) return `a ${campaignSystem} campaign does not accept ${system}`;
  const installed = SYSTEMS[system]?.VERSION;
  if (!installed || !satisfies(installed, range)) return `no installed ${system} version satisfies ${range}`;
  if (system === campaignSystem && !satisfies(installed, campaignRange)) return `${range} does not overlap the campaign's ${campaignRange}`;
  return null;
}

export interface CampaignTerms {
  author_id: string;
  system: string;
  system_versions: string;
  modules: string[];
}

function refsOf(input: unknown): MaterialRef[] {
  if (!Array.isArray(input)) throw new ApiError("invalid_request", "materials must be a list");
  return input.map((m, i) => {
    const r = onlyFields(m, ["kind", "id", "version"]);
    if ((r.kind !== "setting" && r.kind !== "adventure") || typeof r.id !== "string" || typeof r.version !== "string") {
      throw new ApiError("invalid_request", `materials[${i}] must have kind (setting or adventure), id, and version`);
    }
    return { kind: r.kind, id: r.id, version: r.version };
  });
}

/**
 * Checks a campaign's materials: each one usable by the author, compatible with the campaign's system,
 * versions, and modules; exactly one adventure; and settings satisfying its `requires_settings`.
 * Returns them with settings first, in the given order, then the adventure.
 */
export async function checkMaterials(store: Store, campaign: CampaignTerms, input: unknown, opts: { requireUsable: boolean }): Promise<MaterialRef[]> {
  const refs = refsOf(input);
  const seen = new Set<string>();
  for (const r of refs) {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) throw new ApiError("invalid_request", `${r.kind} ${r.id} is listed twice`);
    seen.add(key);
  }
  const found = await Promise.all(refs.map((r) => store.material(r.kind, r.id, r.version)));
  const records = refs.map((r, i): MaterialRecord => {
    const m = found[i];
    const usable = m && (m.origin === "operator" ? m.listed || !opts.requireUsable : m.publisher_id === campaign.author_id);
    if (!m || !usable) throw new ApiError("invalid_request", `no material ${r.kind} ${r.id} ${r.version} is available`);
    const mismatch = fits(m.system, m.system_versions, campaign.system, campaign.system_versions);
    if (mismatch) throw new ApiError("system_mismatch", `${r.kind} ${r.id}: ${mismatch}`);
    const missing = m.manifest.system.modules.filter((mod) => !campaign.modules.includes(mod));
    if (missing.length > 0) throw new ApiError("system_mismatch", `${r.kind} ${r.id} requires the module${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`);
    return m;
  });
  const adventures = records.filter((m) => m.kind === "adventure");
  const settings = records.filter((m) => m.kind === "setting");
  if (adventures.length !== 1) throw new ApiError("invalid_request", "a campaign has exactly one adventure");
  if (settings.length === 0) throw new ApiError("invalid_request", "a campaign has at least one setting");
  for (const req of (adventures[0]!.manifest as AdventureManifest).requires_settings) {
    if (!settings.some((s) => s.id === req.id && satisfies(s.version, req.versions))) {
      throw new ApiError("invalid_request", `the adventure requires setting ${req.id} ${req.versions}`);
    }
  }
  return [...settings, ...adventures].map((m) => ({ kind: m.kind, id: m.id, version: m.version }));
}

/** A bundle version as `delete_bundle` and `delete_material` take it. */
export function bundleRef(input: unknown, kinds: readonly string[] = ["setting", "adventure"]): MaterialRef {
  const req = onlyFields(input, ["kind", "id", "version"]);
  if (!kinds.includes(req.kind as string) || typeof req.id !== "string" || typeof req.version !== "string") throw new ApiError("invalid_request", `kind (${kinds.join(" or ")}), id, and version are required`);
  return { kind: req.kind as MaterialRef["kind"], id: req.id, version: req.version };
}

/**
 * Deletes a bundle version that no campaign's materials and no game use. A version in use stays, since
 * its games replay from it; the conflict says how many use it, and unlisting hides it from new
 * campaigns instead.
 */
export async function deleteUnused(store: Store, ref: MaterialRef): Promise<void> {
  const uses = await store.deleteBundle(ref.kind, ref.id, ref.version);
  if (uses.campaigns > 0 || uses.games > 0) {
    const by = [uses.campaigns > 0 && plural(uses.campaigns, "campaign"), uses.games > 0 && plural(uses.games, "game")].filter(Boolean).join(" and ");
    throw new ApiError("conflict", `${ref.kind} ${ref.id} ${ref.version} is used by ${by}, which replay from it, so it cannot be deleted; unlist it to keep it out of new campaigns`);
  }
}

/** delete_material: the author deletes a version of their own published adventure that nothing uses. */
export async function deleteMaterial(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "delete_material");
  const ref = bundleRef(input, ["adventure"]);
  const m = await store.material(ref.kind, ref.id, ref.version);
  if (!m || m.origin !== "author" || m.publisher_id !== user.id) throw new ApiError("not_found", "no such published adventure of yours");
  await deleteUnused(store, ref);
}
