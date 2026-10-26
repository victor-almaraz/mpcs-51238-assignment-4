"use server";
// Server actions for the adventure editor and its pages.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SettingBundle } from "../bundle/setting";
import { archiveDraft, createDraft, deleteDraft, getDraft, importDraft, publishDraft, requiredSettings, restoreDraft, saveDraft, unarchiveDraft, validateDraft } from "../api/drafts";
import { attempt, type FormState } from "./forms";
import { serverStore } from "./supabase";

const str = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
};

export async function createDraftAction(_: FormState, form: FormData): Promise<FormState> {
  const requires = form.getAll("settings").filter((v): v is string => typeof v === "string").map((v) => {
    const [id, version] = v.split("@");
    const [major, minor] = (version ?? "0.0").split(".");
    return { id: id!, versions: `^${major}.${minor}` };
  });
  const r = await attempt((uid) => createDraft(serverStore(), uid, { material_id: str(form, "material_id"), title: str(form, "title"), system: str(form, "system"), requires_settings: requires }));
  if ("error" in r) return r;
  redirect(`/adventures/${r.ok.id}/edit`);
}

export async function importDraftAction(_: FormState, form: FormData): Promise<FormState> {
  const file = form.get("archive");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a ZIP file." };
  const data = new Uint8Array(await file.arrayBuffer());
  const r = await attempt((uid) => importDraft(serverStore(), uid, data));
  if ("error" in r) return r;
  redirect(`/adventures/${r.ok.draft.id}/edit`);
}

export type SaveResult = { error: string | null; revision?: number; saved_at?: string; conflict?: boolean; diagnostics?: { pointer: string; severity: string; code: string; message: string }[] };

export async function saveDraftAction(input: { draft_id: string; document: Record<string, unknown>; revision: number }): Promise<SaveResult> {
  const r = await attempt((uid) => saveDraft(serverStore(), uid, input));
  if ("error" in r) return { error: r.error, conflict: /saved elsewhere/.test(r.error) };
  const d = await attempt((uid) => getDraft(serverStore(), uid, input.draft_id), { read: true });
  return { error: null, ...r.ok, diagnostics: "ok" in d ? d.ok.diagnostics : [] };
}

/** A copy of the editor's current document as a new draft, after a save conflict. */
export async function copyDraftAction(input: { document: Record<string, unknown>; material_id: string; title: string; system: string; requires: { id: string; versions: string }[] }): Promise<{ error: string | null; id?: string }> {
  const r = await attempt(async (uid) => {
    const id = `${input.material_id}_copy`.slice(0, 64);
    const d = await createDraft(serverStore(), uid, { material_id: id, title: input.title, system: input.system, requires_settings: input.requires });
    const document = { ...input.document, adventure: { ...(input.document.adventure as object), id } };
    await saveDraft(serverStore(), uid, { draft_id: d.id, document, revision: d.revision });
    return d;
  });
  return "error" in r ? { error: r.error } : { error: null, id: r.ok.id };
}

/**
 * The bundles that satisfy `requires`, for the editor's in-browser validation and playtest after the
 * author changes the required settings; null when the caller does not own the draft.
 */
export async function requiredSettingsAction(draftId: string, requires: unknown): Promise<SettingBundle[] | null> {
  if (!Array.isArray(requires)) return null;
  const r = await attempt(async (uid) => {
    await getDraft(serverStore(), uid, draftId);
    return requiredSettings(serverStore(), { adventure: { requires_settings: requires } });
  }, { read: true });
  return "ok" in r ? r.ok : null;
}

export async function publishDraftAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "draft_id");
  const r = await attempt((uid) => publishDraft(serverStore(), uid, { draft_id: id, version: str(form, "version") }));
  if ("error" in r) return r;
  revalidatePath("/adventures");
  redirect("/adventures");
}

/** Delete, Archive, Unarchive, and Restore, which change the My adventures page and the draft's own pages. */
function onAdventures(op: (store: ReturnType<typeof serverStore>, userId: string | null, draftId: unknown) => Promise<unknown>) {
  return async (form: FormData): Promise<FormState> => {
    const r = await attempt((uid) => op(serverStore(), uid, str(form, "draft_id")));
    if ("error" in r) return r;
    revalidatePath("/adventures", "layout");
    return { error: null };
  };
}

export async function deleteDraftAction(_: FormState, form: FormData): Promise<FormState> {
  return onAdventures(deleteDraft)(form);
}

export async function archiveDraftAction(_: FormState, form: FormData): Promise<FormState> {
  return onAdventures(archiveDraft)(form);
}

export async function unarchiveDraftAction(_: FormState, form: FormData): Promise<FormState> {
  return onAdventures(unarchiveDraft)(form);
}

export async function restoreDraftAction(_: FormState, form: FormData): Promise<FormState> {
  return onAdventures(restoreDraft)(form);
}
