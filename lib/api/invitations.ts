// Invitations (api.md, Invitations; data-model.md, Invitation): single-use codes, stored only as hashes.

import { createHash } from "node:crypto";
import type { Store } from "../store";
import { campaignView, membership, normalizeCode } from "./campaigns";
import { cryptoEntropy, type Entropy } from "./entropy";
import { ApiError, onlyFields } from "./errors";
import { caller } from "./users";

const STATUSES = ["pending", "accepted", "declined", "revoked", "expired"];

export function codeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** An invitation code: four groups of five base32 characters (100 bits). */
function invitationCode(entropy: Entropy): string {
  return entropy.code(20).replace(/(.{5})(?=.)/g, "$1-");
}

function optionalText(v: unknown, field: string, max: number): string {
  if (v === undefined) return "";
  if (typeof v !== "string" || v.length > max) throw new ApiError("invalid_request", `${field} must have at most ${max} characters`);
  return v;
}

export async function invite(store: Store, userId: string | null, input: unknown, entropy: Entropy = cryptoEntropy) {
  const user = await caller(store, userId, "invite");
  const req = onlyFields(input, ["campaign_id", "instance_id", "message", "note"]);
  const { campaign } = await membership(store, user, req.campaign_id);
  if (campaign.archived) throw new ApiError("conflict", "an archived campaign accepts no invitations");
  if (req.instance_id !== undefined && (typeof req.instance_id !== "string" || !campaign.instance_ids.includes(req.instance_id))) {
    throw new ApiError("invalid_request", "instance_id is not an instance of the campaign");
  }
  const code = invitationCode(entropy);
  const invitation = await store.createInvitation({
    id: entropy.id("inv"),
    campaign_id: campaign.id,
    inviter_id: user.id,
    instance_id: (req.instance_id as string | undefined) ?? null,
    message: optionalText(req.message, "message", 500),
    note: optionalText(req.note, "note", 80),
    token_hash: codeHash(code),
  });
  return { invitation, code, url: `/invite/${code}` };
}

/** What anyone holding the code sees: nothing about members other than the inviter, and no note, which only members see. */
export async function previewInvitation(store: Store, code: unknown) {
  const i = await store.invitationByHash(codeHash(normalizeCode(code)));
  if (!i) throw new ApiError("not_found", "no such invitation");
  return { campaign_title: i.campaign_title, inviter_display_name: i.inviter.display_name, message: i.message, status: i.status, expires_at: i.expires_at };
}

/**
 * For the invitation page: the code's campaign, whether it is archived, and whether `userId` already
 * belongs to it, so the page offers Accept only when accepting can succeed.
 */
export async function invitationContext(store: Store, userId: string | null, code: unknown): Promise<{ campaignId: string; archived: boolean; member: boolean } | undefined> {
  const i = await store.invitationByHash(codeHash(normalizeCode(code)));
  const campaign = i && (await store.getCampaign(i.campaign_id));
  if (!campaign) return undefined;
  return { campaignId: campaign.id, archived: campaign.archived, member: !!userId && campaign.members.some((m) => m.user_id === userId) };
}

export async function listInvitations(store: Store, userId: string | null, input: unknown) {
  const user = await caller(store, userId, "list_invitations");
  const req = onlyFields(input, ["campaign_id", "status"]);
  const { campaign } = await membership(store, user, req.campaign_id);
  if (req.status !== undefined && !STATUSES.includes(req.status as string)) throw new ApiError("invalid_request", `status must be one of ${STATUSES.join(", ")}`);
  return store.listInvitations(campaign.id, req.status as string | undefined);
}

async function respond(store: Store, userId: string | null, code: unknown, accept: boolean) {
  const user = await caller(store, userId, accept ? "accept_invitation" : "decline_invitation");
  const hash = codeHash(normalizeCode(code));
  const invitation = await store.invitationByHash(hash);
  if (!invitation) throw new ApiError("not_found", "no such invitation");
  // A member presenting a code would use it up without effect.
  const campaign = (await store.getCampaign(invitation.campaign_id))!;
  if (campaign.members.some((m) => m.user_id === user.id)) throw new ApiError("conflict", "you are already a member of the campaign");
  const outcome = await store.respondInvitation(hash, user.id, accept);
  if (outcome === "not_found") throw new ApiError("not_found", "no such invitation");
  if (outcome === "archived") throw new ApiError("conflict", "the campaign is archived");
  if (outcome !== "done") throw new ApiError("conflict", `the invitation is ${outcome}`);
  return { user, campaignId: invitation.campaign_id };
}

export async function acceptInvitation(store: Store, userId: string | null, code: unknown) {
  const { user, campaignId } = await respond(store, userId, code, true);
  return campaignView((await store.getCampaign(campaignId))!, user.id);
}

export async function declineInvitation(store: Store, userId: string | null, code: unknown) {
  await respond(store, userId, code, false);
}

export async function revokeInvitation(store: Store, userId: string | null, invitationId: unknown) {
  const user = await caller(store, userId, "revoke_invitation");
  if (typeof invitationId !== "string") throw new ApiError("invalid_request", "invitation_id must be a string");
  const invitation = await store.getInvitation(invitationId);
  if (!invitation) throw new ApiError("not_found", "no such invitation");
  const { role } = await membership(store, user, invitation.campaign_id);
  if (invitation.inviter.user_id !== user.id && role !== "author") throw new ApiError("forbidden", "only the inviter or the author may revoke an invitation");
  if (!(await store.revokeInvitation(invitation.id))) throw new ApiError("conflict", `the invitation is ${invitation.status}`);
}
