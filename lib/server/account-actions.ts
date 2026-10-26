"use server";
// Server actions for Settings and for a closing account.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addPushSubscription, removePushSubscription, requestAccountDeletion, restoreAccount, updateMe } from "../api/account";
import { disableCalendarFeed } from "../api/schedules";
import { attempt, save, str, type FormState } from "./forms";
import { serverStore } from "./supabase";

const settings = () => revalidatePath("/settings");

export async function profileAction(_: FormState, form: FormData): Promise<FormState> {
  return save((uid) => updateMe(serverStore(), uid, { display_name: str(form, "display_name"), timezone: str(form, "timezone") }), settings, "Account saved.");
}

export async function remindersAction(_: FormState, form: FormData): Promise<FormState> {
  const leads = (str(form, "lead_minutes") ?? "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  return save((uid) => updateMe(serverStore(), uid, { reminders: { push: form.get("push") === "on", lead_minutes: leads } }), settings, "Reminders saved.");
}

/** Adds this browser, and turns on browser notifications in the reminder settings if they were off. */
export async function addPushAction(subscription: { endpoint: string; keys: { p256dh: string; auth: string }; label: string }): Promise<{ error: string | null }> {
  return save(async (uid) => {
    const store = serverStore();
    await addPushSubscription(store, uid, subscription);
    const me = uid === null ? undefined : await store.getUser(uid);
    if (me && !me.reminders.push) await updateMe(store, uid, { reminders: { ...me.reminders, push: true } });
  }, settings);
}

export async function removePushAction(_: FormState, form: FormData): Promise<FormState> {
  return save((uid) => removePushSubscription(serverStore(), uid, str(form, "subscription_id")), settings, "Browser removed.");
}

export async function disableFeedAction(_: FormState): Promise<FormState> {
  return save((uid) => disableCalendarFeed(serverStore(), uid), settings, "Calendar feed turned off.");
}

export async function deleteAccountAction(_: FormState, form: FormData): Promise<FormState & { closed?: boolean }> {
  const r = await attempt((uid) => requestAccountDeletion(serverStore(), uid, { confirm: str(form, "confirm") }));
  return "error" in r ? { error: r.error } : { error: null, closed: true };
}

export async function restoreAccountAction(_: FormState): Promise<FormState> {
  const r = await attempt((uid) => restoreAccount(serverStore(), uid));
  if ("error" in r) return { error: r.error };
  redirect("/dashboard");
}
