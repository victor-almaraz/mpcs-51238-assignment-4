"use server";
// Server actions for campaigns, invitations, and the instance lobby. Each calls an operation in
// lib/api through `attempt`.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { archiveCampaign, createCampaign, disableInviteLink, joinByLink, removeMember, rotateInviteLink, setMaterials, updateCampaign } from "../api/campaigns";
import { addCharacter, createInstance, endInstance, pauseInstance, removeCharacter, resumeInstance, startInstance } from "../api/instances";
import { acceptInvitation, declineInvitation, invite, previewInvitation, revokeInvitation } from "../api/invitations";
import { attempt, type FormState } from "./forms";
import { serverDeps } from "./coordinator";
import { serverStore } from "./supabase";

export type InviteState = FormState & { code?: string; url?: string };

const str = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
};

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

function refresh(campaignId: unknown): FormState {
  revalidatePath(`/campaigns/${String(campaignId)}`, "layout");
  return { error: null };
}

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
  if ("error" in r) return r;
  redirect(`/campaigns/${r.ok.id}`);
}

export async function updateCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  const r = await attempt((uid) => updateCampaign(serverStore(), uid, { campaign_id: id, title: str(form, "title"), description: str(form, "description") ?? "", modules: modulesFrom(form) }));
  return "error" in r ? r : refresh(id);
}

export async function setMaterialsAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  const r = await attempt((uid) => setMaterials(serverStore(), uid, { campaign_id: id, materials: materialsFrom(form) }));
  return "error" in r ? r : refresh(id);
}

export async function archiveCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  const r = await attempt((uid) => archiveCampaign(serverStore(), uid, id));
  return "error" in r ? r : refresh(id);
}

export async function removeMemberAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  const r = await attempt((uid) => removeMember(serverDeps(), uid, { campaign_id: id, user_id: str(form, "user_id") }));
  return "error" in r ? r : refresh(id);
}

export async function inviteAction(_: InviteState, form: FormData): Promise<InviteState> {
  const id = str(form, "campaign_id");
  const message = str(form, "message");
  const note = str(form, "note");
  const r = await attempt((uid) => invite(serverStore(), uid, { campaign_id: id, ...(message ? { message } : {}), ...(note ? { note } : {}) }));
  if ("error" in r) return r;
  refresh(id);
  return { error: null, code: r.ok.code, url: r.ok.url };
}

export async function revokeInvitationAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => revokeInvitation(serverStore(), uid, str(form, "invitation_id")));
  return "error" in r ? r : refresh(str(form, "campaign_id"));
}

export async function rotateInviteLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  const r = await attempt((uid) => rotateInviteLink(serverStore(), uid, id));
  return "error" in r ? r : refresh(id);
}

export async function disableInviteLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "campaign_id");
  const r = await attempt((uid) => disableInviteLink(serverStore(), uid, id));
  return "error" in r ? r : refresh(id);
}

export async function acceptInvitationAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => acceptInvitation(serverStore(), uid, str(form, "code")));
  if ("error" in r) return r;
  redirect(`/campaigns/${r.ok.id}`);
}

export async function declineInvitationAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => declineInvitation(serverStore(), uid, str(form, "code")));
  if ("error" in r) return r;
  redirect("/dashboard");
}

export async function joinByLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => joinByLink(serverStore(), uid, str(form, "code")));
  if ("error" in r) return r;
  redirect(`/campaigns/${r.ok.id}`);
}

/** The dashboard's code field: an invitation code or an invite link code. */
export async function enterCodeAction(_: FormState, form: FormData): Promise<FormState> {
  const raw = (str(form, "code") ?? "").trim();
  // A pasted link works too: keep the last path segment.
  const code = raw.split("/").filter(Boolean).at(-1) ?? "";
  if (code === "") return { error: "Enter a code." };
  const invitation = await attempt(() => previewInvitation(serverStore(), code));
  if ("ok" in invitation) redirect(`/invite/${encodeURIComponent(code)}`);
  redirect(`/join/${encodeURIComponent(code)}`);
}

export async function createInstanceAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => createInstance(serverStore(), uid, { campaign_id: str(form, "campaign_id"), name: str(form, "name") }));
  if ("error" in r) return r;
  redirect(`/instances/${r.ok.id}`);
}

export async function addCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "instance_id");
  const r = await attempt((uid) => addCharacter(serverDeps(), uid, { instance_id: id, character_id: str(form, "character_id") }));
  if ("error" in r) return r;
  revalidatePath(`/instances/${id}`);
  return { error: null };
}

export async function removeCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "instance_id");
  const r = await attempt((uid) => removeCharacter(serverDeps(), uid, { instance_id: id, character_id: str(form, "character_id") }));
  if ("error" in r) return r;
  revalidatePath(`/instances/${id}`);
  return { error: null };
}

/** Start, Pause, Resume, and End in the lobby (app-flow.md, Instance lobby: Controls). */
export async function instanceControlAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "instance_id");
  const controls = { start: startInstance, pause: pauseInstance, resume: resumeInstance, end: endInstance };
  const control = str(form, "control") ?? "";
  // Own keys only: "constructor" or "toString" would otherwise find Object's.
  if (!Object.hasOwn(controls, control)) return { error: "Unknown control." };
  const run = controls[control as keyof typeof controls];
  const r = await attempt((uid) => run(serverDeps(), uid, id));
  if ("error" in r) return r;
  revalidatePath(`/instances/${id}`);
  return { error: null };
}
