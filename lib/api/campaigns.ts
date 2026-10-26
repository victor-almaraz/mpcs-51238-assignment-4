// Campaigns (api.md, Campaigns; data-model.md, Campaign, Campaign member, Campaign material).

import { validRange } from "../materials/semver";
import type { CampaignRecord, Store, UserRecord } from "../store";
import { cryptoEntropy, type Entropy } from "./entropy";
import { withStages } from "./deletion";
import { ApiError, onlyFields } from "./errors";
import { paged, pageOf } from "./paging";
import { endAny, takeOut, type Deps } from "./instances";
import { checkMaterials } from "./materials";
import { systemOrThrow } from "./systems";
import { caller } from "./users";

export type Role = "author" | "player";

/** The campaign object of api.md: `invite_link_code` only for the author. */
export function campaignView(c: CampaignRecord, userId: string) {
  const { invite_link_code, ...rest } = c;
  return c.author_id === userId ? { ...rest, invite_link_code } : rest;
}

export function roleOf(c: CampaignRecord, userId: string): Role | undefined {
  return c.members.find((m) => m.user_id === userId)?.role;
}

/** The campaign and the caller's role; not_found for non-members, forbidden below `need`. */
export async function membership(store: Store, user: UserRecord, campaignId: unknown, need: Role | "member" = "member"): Promise<{ campaign: CampaignRecord; role: Role }> {
  if (typeof campaignId !== "string") throw new ApiError("invalid_request", "campaign_id must be a string");
  const campaign = await store.getCampaign(campaignId);
  const role = campaign && roleOf(campaign, user.id);
  if (!campaign || !role) throw new ApiError("not_found", "no such campaign");
  if (need === "author" && role !== "author") throw new ApiError("forbidden", "only the campaign's author may do this");
  return { campaign, role };
}

/** The text, trimmed, when it has `min` to `max` characters. */
function text(v: unknown, field: string, min: number, max: number): string {
  const t = typeof v === "string" ? v.trim() : undefined;
  if (t === undefined || t.length < min || t.length > max) throw new ApiError("invalid_request", `${field} must have ${min} to ${max} characters`);
  return t;
}

function modulesOf(v: unknown, system: string): string[] {
  const known = systemOrThrow(system).MODULES;
  if (!Array.isArray(v) || !v.every((m) => typeof m === "string")) throw new ApiError("invalid_request", "modules must be a list of module ids");
  const unknown = v.filter((m) => !known.includes(m));
  if (unknown.length > 0) throw new ApiError("invalid_request", `${system} has no module ${unknown.join(", ")}`);
  return [...new Set(v as string[])];
}

export async function createCampaign(store: Store, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "create_campaign");
  const req = onlyFields(input, ["title", "description", "system", "system_versions", "modules", "materials"]);
  const system = systemOrThrow(req.system).ID;
  if (typeof req.system_versions !== "string" || !validRange(req.system_versions)) throw new ApiError("invalid_request", "system_versions must be a version range such as ^1.0");
  const terms = { author_id: user.id, system, system_versions: req.system_versions, modules: modulesOf(req.modules ?? [], system) };
  const materials = await checkMaterials(store, terms, req.materials, { requireUsable: true });
  const campaign = await store.createCampaign({
    id: entropy.id("k"),
    title: text(req.title, "title", 1, 80),
    description: req.description === undefined ? "" : text(req.description, "description", 0, 2000),
    ...terms,
    materials,
  });
  return campaignView(campaign, user.id);
}

export async function listCampaigns(store: Store, userId: string | null, input: unknown = {}) {
  const user = await caller(store, userId, "list_campaigns");
  const req = onlyFields(input, ["role", "archived", "limit", "cursor"]);
  if (req.role !== undefined && req.role !== "author" && req.role !== "player") throw new ApiError("invalid_request", "role must be author or player");
  if (req.archived !== undefined && typeof req.archived !== "boolean") throw new ApiError("invalid_request", "archived must be a boolean");
  const { limit, cursor } = pageOf(req);
  const rows = await store.listCampaigns(user.id, { role: req.role as Role | undefined, archived: req.archived as boolean | undefined, limit: limit + 1, after: cursor });
  return paged(rows, limit, (c) => campaignView(c, user.id));
}

export async function getCampaign(store: Store, userId: string | null, campaignId: unknown) {
  const user = await caller(store, userId, "get_campaign");
  return campaignView((await membership(store, user, campaignId)).campaign, user.id);
}

export async function updateCampaign(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "update_campaign");
  const req = onlyFields(input, ["campaign_id", "title", "description", "modules"]);
  const { campaign } = await membership(store, user, req.campaign_id, "author");
  const title = req.title === undefined ? undefined : text(req.title, "title", 1, 80);
  const description = req.description === undefined ? undefined : text(req.description, "description", 0, 2000);
  let modules: string[] | undefined;
  if (req.modules !== undefined) {
    modules = modulesOf(req.modules, campaign.system);
    // The current materials must still fit the new modules; their listing no longer matters.
    await checkMaterials(store, { ...campaign, modules }, campaign.materials, { requireUsable: false });
  }
  return campaignView(await store.updateCampaign(campaign.id, { title, description, modules }), user.id);
}

export async function setMaterials(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "set_materials");
  const req = onlyFields(input, ["campaign_id", "materials"]);
  const { campaign } = await membership(store, user, req.campaign_id, "author");
  const materials = await checkMaterials(store, campaign, req.materials, { requireUsable: true });
  return campaignView(await store.setMaterials(campaign.id, materials), user.id);
}

export async function archiveCampaign(store: Store, userId: string | null, campaignId: unknown) {
  const user = await caller(store, userId, "archive_campaign");
  const { campaign } = await membership(store, user, campaignId, "author");
  if (campaign.archived) throw new ApiError("conflict", "the campaign is already archived");
  return campaignView(await store.archiveCampaign(campaign.id), user.id);
}

// SPEC_ISSUES.md#campaign-unarchive: api.md archives a campaign with no way back.
export async function unarchiveCampaign(store: Store, userId: string | null, campaignId: unknown) {
  const user = await caller(store, userId, "unarchive_campaign");
  const { campaign } = await membership(store, user, campaignId, "author");
  if (!campaign.archived) throw new ApiError("conflict", "the campaign is not archived");
  return campaignView(await store.unarchiveCampaign(campaign.id), user.id);
}

// SPEC_ISSUES.md#campaign-unarchive: restore_campaign needs the deleted campaign's id, which no list gives.
/** The caller's campaigns deleted less than 30 days ago, which they can restore, with the dates of each stage. */
export async function listDeletedCampaigns(store: Store, userId: string | null) {
  const user = await caller(store, userId, "list_deleted_campaigns");
  return (await store.deletedCampaigns(user.id)).map(withStages);
}

/** Takes the member's characters out of the campaign's instances, writing their sheets back. */
async function releaseMember(deps: Deps, campaign: CampaignRecord, memberId: string): Promise<void> {
  for (const id of campaign.instance_ids) {
    const instance = await deps.store.instanceView(id);
    if (!instance) continue;
    for (const c of instance.characters.filter((c) => c.user_id === memberId)) await takeOut(deps, (await deps.store.instanceView(id))!, c.id);
  }
}

export async function leaveCampaign(deps: Deps, userId: string | null, campaignId: unknown) {
  const user = await caller(deps.store, userId, "leave_campaign");
  const { campaign, role } = await membership(deps.store, user, campaignId);
  if (role === "author") throw new ApiError("conflict", "the author cannot leave the campaign");
  await releaseMember(deps, campaign, user.id);
  await deps.store.removeMember(campaign.id, user.id);
}

export async function removeMember(deps: Deps, userId: string | null, input: unknown) {
  const user = await caller(deps.store, userId, "remove_member");
  const req = onlyFields(input, ["campaign_id", "user_id"]);
  const { campaign } = await membership(deps.store, user, req.campaign_id, "author");
  const target = campaign.members.find((m) => m.user_id === req.user_id);
  if (!target) throw new ApiError("not_found", "no such member");
  if (target.role === "author") throw new ApiError("conflict", "the author cannot be removed");
  await releaseMember(deps, campaign, target.user_id);
  await deps.store.removeMember(campaign.id, target.user_id);
}

/** Deletes a campaign after the author confirms its title; its instances end. Recoverable for 30 days. */
export async function deleteCampaign(deps: Deps, userId: string | null, input: unknown) {
  const user = await caller(deps.store, userId, "delete_campaign");
  const req = onlyFields(input, ["campaign_id", "confirm"]);
  const { campaign } = await membership(deps.store, user, req.campaign_id, "author");
  if (typeof req.confirm !== "string" || req.confirm.trim() !== campaign.title.trim()) throw new ApiError("invalid_request", "type the campaign's title exactly as shown to delete it");
  await endGames(deps, campaign);
  await deps.store.deleteCampaign(campaign.id);
}

/** Ends every game of the campaign, whatever its state. */
export async function endGames(deps: Deps, campaign: CampaignRecord): Promise<void> {
  for (const id of campaign.instance_ids) {
    const instance = await deps.store.instanceView(id);
    if (instance) await endAny(deps, instance);
  }
}

export async function restoreCampaign(store: Store, userId: string | null, campaignId: unknown) {
  const user = await caller(store, userId, "restore_campaign");
  if (typeof campaignId !== "string") throw new ApiError("invalid_request", "campaign_id must be a string");
  const deleted = await store.deletedCampaign(campaignId);
  if (!deleted || deleted.author_id !== user.id) throw new ApiError("not_found", "no such deleted campaign");
  if (!(await store.restoreCampaign(campaignId))) throw new ApiError("conflict", "the campaign was deleted more than 30 days ago");
  return campaignView((await store.getCampaign(campaignId))!, user.id);
}

/** An invite link code: three groups of four base32 characters (60 bits). */
function linkCode(entropy: Entropy): string {
  return entropy.code(12).replace(/(.{4})(?=.)/g, "$1-");
}

export async function rotateInviteLink(store: Store, userId: string | null, campaignId: unknown, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "rotate_invite_link");
  const { campaign } = await membership(store, user, campaignId, "author");
  if (campaign.archived) throw new ApiError("conflict", "an archived campaign accepts no new members");
  const code = linkCode(entropy);
  await store.setInviteLink(campaign.id, code);
  return { invite_link_code: code };
}

export async function disableInviteLink(store: Store, userId: string | null, campaignId: unknown) {
  const user = await caller(store, userId, "disable_invite_link");
  const { campaign } = await membership(store, user, campaignId, "author");
  await store.setInviteLink(campaign.id, null);
}

/** Codes are compared without case or surrounding space, so a code read aloud still works. */
export function normalizeCode(code: unknown): string {
  if (typeof code !== "string" || code.trim() === "" || code.length > 64) throw new ApiError("invalid_request", "code must be a non-empty string");
  return code.trim().toUpperCase();
}

export async function joinByLink(store: Store, userId: string | null, code: unknown) {
  const user = await caller(store, userId, "join_by_link");
  const id = await store.campaignByLink(normalizeCode(code));
  if (!id) throw new ApiError("not_found", "the invite link is not valid");
  await store.addMember(id, user.id);
  return campaignView((await store.getCampaign(id))!, user.id);
}

/** What the join page shows for an invite link code: the campaign's title and author. */
export async function previewInviteLink(store: Store, code: unknown) {
  const id = await store.campaignByLink(normalizeCode(code));
  const campaign = id && (await store.getCampaign(id));
  if (!campaign) throw new ApiError("not_found", "the invite link is not valid");
  const author = campaign.members.find((m) => m.role === "author")!;
  return { campaign_title: campaign.title, author_display_name: author.display_name };
}
