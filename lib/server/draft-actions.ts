"use server";
// Server actions for the adventure editor and its pages.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SettingBundle } from "../bundle/setting";
import { archiveDraft, copyDraft, createDraft, deleteDraft, importDraft, publishDraft, restoreDraft, saveDraft, unarchiveDraft } from "../api/drafts";
import { editorReferences, type EditorReferences } from "../api/editor";
import { defaultRange, deleteMaterial } from "../api/materials";
import { attempt, save, str, type FormState } from "./forms";
import { serverStore } from "./supabase";

export async function createDraftAction(_: FormState, form: FormData): Promise<FormState> {
  const requires = form.getAll("settings").filter((v): v is string => typeof v === "string").map((v) => {
    const [id, version] = v.split("@");
    return { id: id!, versions: defaultRange(version ?? "0.0") };
  });
  const r = await attempt((uid) => createDraft(serverStore(), uid, { material_id: str(form, "material_id"), title: str(form, "title"), system: str(form, "system"), requires_settings: requires }));
  if ("error" in r) return { error: r.error };
  redirect(`/adventures/${r.ok.id}/edit`);
}

export async function importDraftAction(_: FormState, form: FormData): Promise<FormState> {
  const file = form.get("archive");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a ZIP file." };
  const data = new Uint8Array(await file.arrayBuffer());
  const r = await attempt((uid) => importDraft(serverStore(), uid, data));
  if ("error" in r) return { error: r.error };
  redirect(`/adventures/${r.ok.draft.id}/edit`);
}

export type SaveResult = { error: string | null; revision?: number; saved_at?: string; conflict?: boolean; diagnostics?: { pointer: string; severity: string; code: string; message: string }[] };

/** One save from the editor; `conflict` when the draft was saved elsewhere since `revision`. */
export async function saveDraftAction(input: { draft_id: string; document: Record<string, unknown>; revision: number }): Promise<SaveResult> {
  const r = await attempt((uid) => saveDraft(serverStore(), uid, input));
  return "error" in r ? { error: r.error, conflict: r.code === "conflict" } : { error: null, ...r.ok };
}

/** A copy of the editor's current document as a new draft, after a save conflict. */
export async function copyDraftAction(input: { document: Record<string, unknown>; title: string }): Promise<{ error: string | null; id?: string }> {
  const r = await attempt((uid) => copyDraft(serverStore(), uid, input));
  return "error" in r ? { error: r.error } : { error: null, id: r.ok.id };
}

/**
 * The bundles that satisfy `requires`, for the editor's in-browser validation and playtest, and the
 * pickers' references from them, after the author changes the required settings; null when the caller
 * does not own the draft.
 */
export async function requiredSettingsAction(draftId: string, requires: unknown): Promise<{ settings: SettingBundle[]; refs: EditorReferences } | null> {
  if (!Array.isArray(requires)) return null;
  const r = await attempt((uid) => editorReferences(serverStore(), uid, draftId, requires), { read: true });
  return "ok" in r ? r.ok : null;
}

export async function publishDraftAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => publishDraft(serverStore(), uid, { draft_id: str(form, "draft_id"), version: str(form, "version") }));
  if ("error" in r) return { error: r.error };
  revalidatePath("/adventures");
  redirect("/adventures");
}

/** Delete, Archive, Unarchive, and Restore, which change the My adventures page and the draft's own pages. */
/** Deletes a version of the caller's published adventure that no campaign or game uses. */
export async function deleteMaterialAction(_: FormState, form: FormData): Promise<FormState> {
  return save((uid) => deleteMaterial(serverStore(), uid, { kind: "adventure", id: str(form, "id"), version: str(form, "version") }), () => revalidatePath("/adventures", "layout"), `Deleted ${str(form, "id")} ${str(form, "version")}.`);
}

function onAdventures(op: (store: ReturnType<typeof serverStore>, userId: string | null, draftId: unknown) => Promise<unknown>) {
  return (form: FormData): Promise<FormState> => save((uid) => op(serverStore(), uid, str(form, "draft_id")), () => revalidatePath("/adventures", "layout"));
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
