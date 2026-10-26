"use server";
// Server actions for the operator console.
import { revalidatePath } from "next/cache";
import { applyReport, deleteBundle, inspectInstance, publishBundle, replayInstance, restoreInstance, setListed } from "../api/admin";
import { serverDeps } from "./coordinator";
import { attempt, save, str, type FormState } from "./forms";

/** The console again. */
const consolePage = () => revalidatePath("/admin");

export async function publishAction(_: FormState, form: FormData): Promise<FormState> {
  const file = form.get("bundle");
  const raw = file instanceof File && file.size > 0 ? await file.text() : str(form, "json");
  let bundle: unknown;
  try {
    bundle = JSON.parse(raw ?? "");
  } catch {
    return { error: "The bundle is not JSON." };
  }
  const r = await attempt((uid) => publishBundle(serverDeps().store, uid, { kind: str(form, "kind"), bundle }));
  if ("error" in r) return { error: r.error };
  consolePage();
  return { error: null, saved: `Published ${r.ok.kind} ${r.ok.id} ${r.ok.version}.` };
}

export async function listedAction(_: FormState, form: FormData): Promise<FormState> {
  const listed = str(form, "listed") === "true";
  return save((uid) => setListed(serverDeps().store, uid, { kind: str(form, "kind"), id: str(form, "id"), version: str(form, "version"), listed }), consolePage, `${listed ? "Listed" : "Unlisted"} ${str(form, "id")} ${str(form, "version")}.`);
}

/** Deletes a bundle version that no campaign or game uses; one in use stays, and the error says how many use it. */
export async function deleteBundleAction(_: FormState, form: FormData): Promise<FormState> {
  return save((uid) => deleteBundle(serverDeps().store, uid, { kind: str(form, "kind"), id: str(form, "id"), version: str(form, "version") }), consolePage, `Deleted ${str(form, "kind")} ${str(form, "id")} ${str(form, "version")}.`);
}

export async function restoreAction(_: FormState, form: FormData): Promise<FormState> {
  return save((uid) => restoreInstance(serverDeps().store, uid, { instance_id: str(form, "instance_id"), to_version: Number(str(form, "to_version")), reason: str(form, "reason") }), consolePage, `Restored the game to version ${str(form, "to_version")}.`);
}

export async function reportAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => applyReport(serverDeps(), uid, { action: str(form, "action"), kind: str(form, "kind"), id: str(form, "id"), reason: str(form, "reason") }));
  if ("error" in r) return { error: r.error };
  consolePage();
  return { error: null, saved: r.ok };
}

export type Inspection = {
  error: string | null;
  instance?: { id: string; name: string; status: string; version: number; state: unknown };
  /** Whether replaying the event log reproduces the stored state, or why the replay failed. */
  replay?: { matches_stored: boolean; diverges_at: number | null } | { error: string };
};

/** Inspect: the game's full state, written to the operator log with the reason, and its replay check. */
export async function inspectAction(_: Inspection, form: FormData): Promise<Inspection> {
  const store = serverDeps().store;
  const r = await attempt((uid) => inspectInstance(store, uid, str(form, "inspect")?.trim(), str(form, "reason")));
  if ("error" in r) return { error: r.error };
  const i = r.ok;
  const replay = await attempt((uid) => replayInstance(store, uid, { instance_id: i.id })).catch((e: Error) => ({ error: e.message }));
  consolePage();
  return {
    error: null,
    instance: { id: i.id, name: i.name, status: i.status, version: i.version, state: i.state },
    replay: "error" in replay ? { error: replay.error } : { matches_stored: replay.ok.matches_stored, diverges_at: replay.ok.diverges_at ?? null },
  };
}
