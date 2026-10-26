"use server";
// Server actions for the schedule page, and the RSVP buttons of the dashboard and the instance lobby.
import { revalidatePath } from "next/cache";
import { calendarFeedKey, cancelSession, moveOccurrence, rotateCalendarFeed, rsvp, scheduleSession, updateSession } from "../api/schedules";
import { localInstant } from "../scheduler/zone";
import { save, str, type FormState } from "./forms";
import { origin } from "./pages";
import { serverStore } from "./supabase";

/** Revalidates the pages that show the instance's schedule. */
const schedulePages = (instanceId: unknown) => () => {
  revalidatePath(`/instances/${String(instanceId)}`);
  revalidatePath(`/instances/${String(instanceId)}/schedule`);
  revalidatePath("/dashboard");
  revalidatePath("/settings");
};

/** The form's weekly recurrence: every `every` weeks, `count` times when given; none when `every` is 0. */
function recurrenceFrom(form: FormData) {
  const every = Number(str(form, "every") ?? "0");
  const count = Number(str(form, "count") ?? "");
  return every > 0 ? { freq: "weekly", interval: every, ...(Number.isInteger(count) && count > 0 ? { count } : {}) } : null;
}

/** The fields the schedule and edit forms share. */
function sessionFields(form: FormData) {
  return {
    title: str(form, "title") ?? "",
    duration_minutes: Number(str(form, "duration_minutes")),
    recurrence: recurrenceFrom(form),
    auto_resume: form.get("auto_resume") === "on",
    auto_pause: form.get("auto_pause") === "on",
    notes: str(form, "notes") ?? "",
  };
}

export async function scheduleSessionAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "instance_id");
  const timezone = str(form, "timezone") ?? "UTC";
  return save((uid) => scheduleSession(serverStore(), uid, { instance_id: id, starts_at: localInstant(str(form, "starts_at"), timezone), timezone, ...sessionFields(form) }), schedulePages(id));
}

/**
 * Changes a series from the schedule page: title, duration, weekly recurrence, auto-resume and auto-pause,
 * and notes. The change applies to the whole series (SPEC_ISSUES.md#session-updates).
 */
export async function updateSessionAction(_: FormState, form: FormData): Promise<FormState> {
  return save((uid) => updateSession(serverStore(), uid, { session_id: str(form, "session_id"), ...sessionFields(form) }), schedulePages(str(form, "instance_id")), "Session saved.");
}

export async function rsvpAction(_: FormState, form: FormData): Promise<FormState> {
  return save((uid) => rsvp(serverStore(), uid, { session_id: str(form, "session_id"), occurrence_start: str(form, "occurrence_start"), response: str(form, "response") }), schedulePages(str(form, "instance_id")));
}

export async function moveOccurrenceAction(_: FormState, form: FormData): Promise<FormState> {
  return save(
    (uid) => moveOccurrence(serverStore(), uid, { session_id: str(form, "session_id"), occurrence_start: str(form, "occurrence_start"), starts_at: localInstant(str(form, "starts_at"), str(form, "timezone") ?? "UTC") }),
    schedulePages(str(form, "instance_id")),
  );
}

export async function cancelAction(_: FormState, form: FormData): Promise<FormState> {
  const occurrence = str(form, "occurrence_start");
  return save((uid) => cancelSession(serverStore(), uid, { session_id: str(form, "session_id"), ...(occurrence ? { occurrence_start: occurrence } : {}) }), schedulePages(str(form, "instance_id")));
}

export async function createFeedAction(_: FormState, form: FormData): Promise<FormState> {
  const key = calendarFeedKey();
  // Without a key every feed secret would be guessable from the user id.
  if (!key) return { error: "Calendar feeds are not configured." };
  const site = await origin();
  return save((uid) => rotateCalendarFeed(serverStore(), uid, { key, origin: site }), schedulePages(str(form, "instance_id")));
}
