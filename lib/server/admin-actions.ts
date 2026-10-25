"use server";
// Server actions for the operator console.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endGame, hold, publishBundle, release, removeAssetContent, removeCampaignContent, removeCharacterContent, restoreInstance, setListed, suspend } from "../api/admin";
import { ApiError } from "../api/errors";
import { serverDeps } from "./coordinator";
import { attempt, type FormState } from "./forms";

const str = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
};

/**
 * Back to the console without its query: re-rendering `/admin?inspect=…` would run the inspection again
 * and write it to the operator log a second time.
 */
function done(): never {
  revalidatePath("/admin");
  redirect("/admin");
}

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
  return "error" in r ? r : done();
}

export async function listedAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => setListed(serverDeps().store, uid, { kind: str(form, "kind"), id: str(form, "id"), version: str(form, "version"), listed: str(form, "listed") === "true" }));
  return "error" in r ? r : done();
}

export async function restoreAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => restoreInstance(serverDeps().store, uid, { instance_id: str(form, "instance_id"), to_version: Number(str(form, "to_version")), reason: str(form, "reason") }));
  return "error" in r ? r : done();
}

export async function reportAction(_: FormState, form: FormData): Promise<FormState> {
  const deps = serverDeps();
  const action = str(form, "action");
  const kind = str(form, "kind");
  const id = str(form, "id");
  const reason = str(form, "reason");
  const r = await attempt(async (uid) => {
    if (action === "hold") return hold(deps.store, uid, { kind, id, reason });
    if (action === "release") return release(deps.store, uid, { kind, id, note: reason });
    if (action === "suspend" || action === "unsuspend") return suspend(deps.store, uid, { user_id: id, suspended: action === "suspend", reason });
    if (action === "remove" && kind === "character") return removeCharacterContent(deps, uid, { character_id: id, reason });
    if (action === "remove" && kind === "campaign") return removeCampaignContent(deps, uid, { campaign_id: id, reason });
    if (action === "remove" && kind === "asset") return removeAssetContent(deps.store, uid, { hash: id, reason });
    if (action === "end") return endGame(deps, uid, { instance_id: id, reason });
    throw new ApiError("invalid_request", "unknown action");
  });
  return "error" in r ? r : done();
}
