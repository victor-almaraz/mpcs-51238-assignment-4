"use server";
// Server actions for campaigns, invitations, and the instance lobby. Each calls an operation in
// lib/api through `attempt` or `save`.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { archiveCampaign, createCampaign, deleteCampaign, disableInviteLink, getCampaign, joinByLink, leaveCampaign, previewInviteLink, removeMember, restoreCampaign, rotateInviteLink, setMaterials, unarchiveCampaign, updateCampaign } from "../api/campaigns";
import { addCharacter, createInstance, endInstance, pauseInstance, removeCharacter, resumeInstance, startInstance } from "../api/instances";
import { acceptInvitation, declineInvitation, invite, previewInvitation, revokeInvitation } from "../api/invitations";
import { attempt, save, str, type FormState } from "./forms";
import { serverDeps } from "./coordinator";
import { serverStore } from "./supabase";

export type InviteState = FormState & { code?: string; url?: string };

/** Materials from the form: settings in the order given, then the adventure; values are `id@version`. */
function materialsFrom(form: FormData) {
  const ref = (kind: "setting" | "adventure", v: string) => {
    const at = v.lastIndexOf("@");
    return { kind, id: v.slice(0, at), version: v.slice(at + 1) };
  };
  const settings = form.getAll("settings").filter((v): v is string => typeof v === "string").map((v) => ref("setting", v));
  const adventure = str(form, "adventure");
  return adventure ? [...settings, ref("adventure", adventure)] : settings;
}

const modulesFrom = (form: FormData) => form.getAll("modules").filter((v): v is string => typeof v === "string");

/** Revalidates the campaign's pages and the hub. */
const campaignPages = (campaignId: unknown) => () => {
  revalidatePath(`/campaigns/${String(campaignId)}`, "layout");
  revalidatePath("/campaigns");
};

/** Revalidates the lobby of the instance. */
const lobby = (instanceId: unknown) => () => revalidatePath(`/instances/${String(instanceId)}`);

export async function createCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const description = str(form, "description");
  const r = await attempt((id) =>
    createCampaign(serverStore(), id, {
      title: str(form, "title"),
      ...(description ? { description } : {}),
      system: str(form, "system"),
      system_versions: str(form, "system_versions"),
      modules: modulesFrom(form),
      materials: materialsFrom(form),
    }),
  );
  if ("error" in r) return { error: r.error };
  redirect(`/campaigns/${r.ok.id}`);
}

export async function updateCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  return save((uid) => updateCampaign(serverStore(), uid, { campaign_id: id, title: str(form, "title"), description: str(form, "description") ?? "", modules: modulesFrom(form) }), campaignPages(id), "Saved.");
}

/**
 * Saves the Materials tab: first enables the modules the new materials require (the form submits them,
 * locked on), keeping those already on, then sets the materials, which check_materials checks against
 * the campaign's modules.
 */
export async function setMaterialsAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  return save(
    async (uid) => {
      const campaign = await getCampaign(serverStore(), uid, id);
      const modules = [...new Set([...campaign.modules, ...modulesFrom(form)])];
      if (modules.length > campaign.modules.length) await updateCampaign(serverStore(), uid, { campaign_id: id, modules });
      return setMaterials(serverStore(), uid, { campaign_id: id, materials: materialsFrom(form) });
    },
    campaignPages(id),
    "Materials saved. Games created from now on use them.",
  );
}

export async function archiveCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  return save((uid) => archiveCampaign(serverStore(), uid, id), campaignPages(id));
}

export async function unarchiveCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  return save((uid) => unarchiveCampaign(serverStore(), uid, id), campaignPages(id));
}

/** Deletes the campaign once its title is typed; its games end. Returns to the Campaigns page, which lists it under Recently deleted. */
export async function deleteCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  const r = await attempt((uid) => deleteCampaign(serverDeps(), uid, { campaign_id: id, confirm: str(form, "confirm") }));
  if ("error" in r) return { error: r.error };
  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
  redirect("/campaigns");
}

export async function restoreCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  return save((uid) => restoreCampaign(serverStore(), uid, id), () => {
    revalidatePath("/dashboard");
    campaignPages(id)();
  });
}

export async function leaveCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => leaveCampaign(serverDeps(), uid, str(form, "campaign_id")));
  if ("error" in r) return { error: r.error };
  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
  redirect("/campaigns");
}

export async function removeMemberAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  return save((uid) => removeMember(serverDeps(), uid, { campaign_id: id, user_id: str(form, "user_id") }), campaignPages(id));
}

export async function inviteAction(_: InviteState, form: FormData): Promise<InviteState> {
  const id = str(form, "campaign_id");
  const message = str(form, "message");
  const note = str(form, "note");
  const r = await attempt((uid) => invite(serverStore(), uid, { campaign_id: id, ...(message ? { message } : {}), ...(note ? { note } : {}) }));
  if ("error" in r) return { error: r.error };
  campaignPages(id)();
  return { error: null, code: r.ok.code, url: r.ok.url };
}

export async function revokeInvitationAction(_: FormState, form: FormData): Promise<FormState> {
  return save((uid) => revokeInvitation(serverStore(), uid, str(form, "invitation_id")), campaignPages(str(form, "campaign_id")), "Invitation revoked.");
}

export async function rotateInviteLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  return save((uid) => rotateInviteLink(serverStore(), uid, id), campaignPages(id), "The new invite link is ready. Earlier links no longer work.");
}

export async function disableInviteLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  return save((uid) => disableInviteLink(serverStore(), uid, id), campaignPages(id), "The invite link is off.");
}

export async function acceptInvitationAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => acceptInvitation(serverStore(), uid, str(form, "code")));
  if ("error" in r) return { error: r.error };
  redirect(`/campaigns/${r.ok.id}`);
}

export async function declineInvitationAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => declineInvitation(serverStore(), uid, str(form, "code")));
  if ("error" in r) return { error: r.error };
  redirect("/dashboard");
}

export async function joinByLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => joinByLink(serverStore(), uid, str(form, "code")));
  if ("error" in r) return { error: r.error };
  redirect(`/campaigns/${r.ok.id}`);
}

/** The dashboard's code field: an invitation code or an invite link code. */
export async function enterCodeAction(_: FormState, form: FormData): Promise<FormState> {
  const raw = (str(form, "code") ?? "").trim();
  // A pasted link works too: keep the last path segment.
  const code = raw.split("/").filter(Boolean).at(-1) ?? "";
  if (code === "") return { error: "Enter a code." };
  const invitation = await attempt(() => previewInvitation(serverStore(), code), { read: true });
  if ("ok" in invitation) redirect(`/invite/${encodeURIComponent(code)}`);
  const link = await attempt(() => previewInviteLink(serverStore(), code), { read: true });
  if ("ok" in link) redirect(`/join/${encodeURIComponent(code)}`);
  return { error: "No invitation or invite link matches this code. Check it with whoever sent it." };
}

export async function createInstanceAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => createInstance(serverStore(), uid, { campaign_id: str(form, "campaign_id"), name: str(form, "name"), sandbox: form.get("sandbox") === "1" }));
  if ("error" in r) return { error: r.error };
  redirect(`/instances/${r.ok.id}`);
}

export async function addCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "instance_id");
  return save((uid) => addCharacter(serverDeps(), uid, { instance_id: id, character_id: str(form, "character_id") }), lobby(id));
}

export async function removeCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "instance_id");
  return save((uid) => removeCharacter(serverDeps(), uid, { instance_id: id, character_id: str(form, "character_id") }), lobby(id));
}

/** Start, Pause, Resume, and End in the lobby (app-flow.md, Instance lobby: Controls). */
export async function instanceControlAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "instance_id");
  const controls = { start: startInstance, pause: pauseInstance, resume: resumeInstance, end: endInstance };
  const control = str(form, "control") ?? "";
  // Own keys only: "constructor" or "toString" would otherwise find Object's.
  if (!Object.hasOwn(controls, control)) return { error: "Unknown control." };
  const run = controls[control as keyof typeof controls];
  return save((uid) => run(serverDeps(), uid, id), lobby(id));
}
