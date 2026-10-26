"use server";
// Server actions for accounts and characters. Each calls an operation in lib/api through `attempt` or `save`.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { uploadAsset } from "../api/assets";
import { archiveCharacter, createCharacter, deleteCharacter, getCharacter, rebuildCharacter, restoreCharacter, retireCharacter, unarchiveCharacter, updateCharacter } from "../api/characters";
import { checkFitsCampaign } from "../api/instances";
import { acceptTerms } from "../api/users";
import { attempt, safeNext, save, type FormState } from "./forms";
import { serverStore } from "./supabase";

function profileFrom(form: FormData): Record<string, string> | undefined {
  const entries = [...form.entries()].filter(([k, v]) => k.startsWith("profile.") && typeof v === "string" && v.trim() !== "");
  return entries.length === 0 ? undefined : Object.fromEntries(entries.map(([k, v]) => [k.slice("profile.".length), (v as string).trim()]));
}

/** Accepts the terms and continues to `next`; a stale page or the rate limit is shown on the form. */
export async function acceptTermsAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((id) => acceptTerms(serverStore(), id, form.get("version")));
  if ("error" in r) return { error: r.error };
  redirect(safeNext(form.get("next")));
}

/** The creation form's choices: role, abilities, and the profile answers. */
function choicesFrom(form: FormData) {
  const profile = profileFrom(form);
  return { role: form.get("role"), abilities: form.getAll("abilities"), ...(profile ? { profile } : {}) };
}

/** With a campaign chosen in the form, its games must be able to use the abilities. */
const forCampaign = (form: FormData) => async (uid: string | null) => {
  const campaign = form.get("campaign");
  if (typeof campaign === "string" && campaign !== "") await checkFitsCampaign(serverStore(), uid, campaign, form.getAll("abilities"));
};

export async function createCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt(async (id) => {
    await forCampaign(form)(id);
    return createCharacter(serverStore(), id, { system: form.get("system"), name: form.get("name"), choices: choicesFrom(form) });
  });
  if ("error" in r) return { error: r.error };
  redirect(`/characters/${r.ok.id}`);
}

/** Change role and abilities: the creation form again, for a character that has not played. */
export async function rebuildCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const r = await attempt(async (uid) => {
    await forCampaign(form)(uid);
    return rebuildCharacter(serverStore(), uid, { character_id: id, name: form.get("name"), choices: choicesFrom(form) });
  });
  if ("error" in r) return { error: r.error };
  revalidatePath("/characters", "layout");
  redirect(`/characters/${String(id)}`);
}

/** Revalidates the character's page. */
const characterPage = (id: unknown) => () => revalidatePath(`/characters/${String(id)}`);

/** Revalidates the character's page and the Characters page. */
const characterPages = (id: unknown) => () => {
  revalidatePath(`/characters/${String(id)}`);
  revalidatePath("/characters");
};

export async function updateCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  return save((uid) => updateCharacter(serverStore(), uid, { character_id: id, name: form.get("name"), profile: profileFrom(form) ?? {} }), characterPage(id), "Saved.");
}

export async function retireCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  return save((uid) => retireCharacter(serverStore(), uid, id), characterPage(id));
}

export async function archiveCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  return save((uid) => archiveCharacter(serverStore(), uid, id), characterPages(id));
}

export async function unarchiveCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  return save((uid) => unarchiveCharacter(serverStore(), uid, id), characterPages(id));
}

/** Deletes the character once its name is typed. Returns to the Characters page, which lists it under Recently deleted. */
export async function deleteCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const r = await attempt(async (uid) => {
    const c = await getCharacter(serverStore(), uid, id);
    if (String(form.get("confirm") ?? "").trim() !== c.name.trim()) return { mismatch: true };
    await deleteCharacter(serverStore(), uid, id);
    return { mismatch: false };
  });
  if ("error" in r) return { error: r.error };
  if (r.ok.mismatch) return { error: "Type the character's name exactly to delete it." };
  revalidatePath("/characters");
  redirect("/characters");
}

export async function restoreCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  return save((uid) => restoreCharacter(serverStore(), uid, id), characterPages(id));
}

/** Upload portrait: stores the image, then sets it on the character (app-flow.md, Character editor). */
export async function uploadPortraitAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  const fields = Object.fromEntries(["alt", "license", "credit", "provenance"].map((k) => [k, form.get(k)]).filter(([, v]) => typeof v === "string" && v !== ""));
  const data = new Uint8Array(await file.arrayBuffer());
  return save(async (uid) => {
    const asset = await uploadAsset(serverStore(), uid, { kind: "portrait", ...fields }, data);
    return updateCharacter(serverStore(), uid, { character_id: id, portrait: asset.hash });
  }, characterPage(id));
}

export async function removePortraitAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  return save((uid) => updateCharacter(serverStore(), uid, { character_id: id, portrait: null }), characterPage(id));
}
