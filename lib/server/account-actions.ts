"use server";
// Server actions for Settings and for a closing account.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addPushSubscription, removePushSubscription, requestAccountDeletion, restoreAccount, updateMe } from "../api/account";
import { disableCalendarFeed } from "../api/schedules";
import { attempt, type FormState } from "./forms";
import { serverStore } from "./supabase";

const str = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
};

function done(): FormState {
  revalidatePath("/settings");
  return { error: null };
}

export async function profileAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => updateMe(serverStore(), uid, { display_name: str(form, "display_name"), timezone: str(form, "timezone") }));
  return "error" in r ? r : done();
}

export async function remindersAction(_: FormState, form: FormData): Promise<FormState> {
  const leads = (str(form, "lead_minutes") ?? "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const r = await attempt((uid) => updateMe(serverStore(), uid, { reminders: { push: form.get("push") === "on", lead_minutes: leads } }));
  return "error" in r ? r : done();
}

export async function addPushAction(subscription: { endpoint: string; keys: { p256dh: string; auth: string }; label: string }): Promise<{ error: string | null }> {
  const r = await attempt((uid) => addPushSubscription(serverStore(), uid, subscription));
  if ("error" in r) return r;
  revalidatePath("/settings");
  return { error: null };
}

export async function removePushAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => removePushSubscription(serverStore(), uid, str(form, "subscription_id")));
  return "error" in r ? r : done();
}

export async function disableFeedAction(_: FormState): Promise<FormState> {
  const r = await attempt((uid) => disableCalendarFeed(serverStore(), uid));
  return "error" in r ? r : done();
}

export async function deleteAccountAction(_: FormState, form: FormData): Promise<FormState & { closed?: boolean }> {
  const r = await attempt((uid) => requestAccountDeletion(serverStore(), uid, { confirm: str(form, "confirm") }));
  return "error" in r ? r : { error: null, closed: true };
}

export async function restoreAccountAction(_: FormState): Promise<FormState> {
  const r = await attempt((uid) => restoreAccount(serverStore(), uid));
  if ("error" in r) return r;
  redirect("/dashboard");
}
