"use server";
// Server actions for accounts and characters. Each calls an operation in lib/api through `attempt`.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { uploadAsset } from "../api/assets";
import { archiveCharacter, createCharacter, deleteCharacter, getCharacter, restoreCharacter, retireCharacter, unarchiveCharacter, updateCharacter } from "../api/characters";
import { acceptTerms } from "../api/users";
import { attempt, safeNext, type FormState } from "./forms";
import { serverStore } from "./supabase";

function profileFrom(form: FormData): Record<string, string> | undefined {
  const entries = [...form.entries()].filter(([k, v]) => k.startsWith("profile.") && typeof v === "string" && v.trim() !== "");
  return entries.length === 0 ? undefined : Object.fromEntries(entries.map(([k, v]) => [k.slice("profile.".length), (v as string).trim()]));
}

export async function acceptTermsAction(form: FormData): Promise<void> {
  const r = await attempt((id) => acceptTerms(serverStore(), id, form.get("version")));
  if ("error" in r) throw new Error(r.error);
  redirect(safeNext(form.get("next")));
}

export async function createCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const profile = profileFrom(form);
  const choices = { role: form.get("role"), abilities: form.getAll("abilities"), ...(profile ? { profile } : {}) };
  const r = await attempt((id) => createCharacter(serverStore(), id, { system: form.get("system"), name: form.get("name"), choices }));
  if ("error" in r) return { error: r.error };
  redirect(`/characters/${r.ok.id}`);
}

export async function updateCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const r = await attempt((uid) => updateCharacter(serverStore(), uid, { character_id: id, name: form.get("name"), profile: profileFrom(form) ?? {} }));
  if ("error" in r) return { error: r.error };
  revalidatePath(`/characters/${String(id)}`);
  return { error: null };
}

export async function retireCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const r = await attempt((uid) => retireCharacter(serverStore(), uid, id));
  if ("error" in r) return { error: r.error };
  revalidatePath(`/characters/${String(id)}`);
  return { error: null };
}

function refreshCharacter(id: unknown): FormState {
  revalidatePath(`/characters/${String(id)}`);
  revalidatePath("/characters");
  return { error: null };
}

export async function archiveCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const r = await attempt((uid) => archiveCharacter(serverStore(), uid, id));
  return "error" in r ? { error: r.error } : refreshCharacter(id);
}

export async function unarchiveCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const r = await attempt((uid) => unarchiveCharacter(serverStore(), uid, id));
  return "error" in r ? { error: r.error } : refreshCharacter(id);
}

/** Deletes the character once its name is typed. Returns to the Characters page, which lists it under Recently deleted. */
export async function deleteCharacterAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const r = await attempt(async (uid) => {
    const c = await getCharacter(serverStore(), uid, id);
    if (form.get("confirm") !== c.name) return { mismatch: true };
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
  const r = await attempt((uid) => restoreCharacter(serverStore(), uid, id));
  return "error" in r ? { error: r.error } : refreshCharacter(id);
}

/** Upload portrait: stores the image, then sets it on the character (app-flow.md, Character editor). */
export async function uploadPortraitAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  const fields = Object.fromEntries(["alt", "license", "credit", "provenance"].map((k) => [k, form.get(k)]).filter(([, v]) => typeof v === "string" && v !== ""));
  const data = new Uint8Array(await file.arrayBuffer());
  const r = await attempt(async (uid) => {
    const asset = await uploadAsset(serverStore(), uid, { kind: "portrait", ...fields }, data);
    return updateCharacter(serverStore(), uid, { character_id: id, portrait: asset.hash });
  });
  if ("error" in r) return { error: r.error };
  revalidatePath(`/characters/${String(id)}`);
  return { error: null };
}

export async function removePortraitAction(_: FormState, form: FormData): Promise<FormState> {
  const id = form.get("character_id");
  const r = await attempt((uid) => updateCharacter(serverStore(), uid, { character_id: id, portrait: null }));
  if ("error" in r) return { error: r.error };
  revalidatePath(`/characters/${String(id)}`);
  return { error: null };
}
