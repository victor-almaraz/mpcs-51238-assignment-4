"use server";
// Server actions for accounts and characters. Each calls an operation in lib/api through `attempt`.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createCharacter, retireCharacter, updateCharacter } from "../api/characters";
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
