"use server";
// Server actions for the schedule page and the dashboard's RSVP buttons.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { cancelSession, moveOccurrence, rotateCalendarFeed, rsvp, scheduleSession } from "../api/schedules";
import { instantOf } from "../scheduler/zone";
import { attempt, type FormState } from "./forms";
import { serverStore } from "./supabase";

const str = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
};

/** A `datetime-local` value read as wall time in `tz`, as an ISO instant. */
function instantFrom(local: string | undefined, tz: string): string | undefined {
  const m = local && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return undefined;
  return new Date(instantOf({ year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]!, second: 0 }, tz)).toISOString();
}

function refresh(instanceId: unknown): FormState {
  revalidatePath(`/instances/${String(instanceId)}/schedule`);
  revalidatePath("/dashboard");
  return { error: null };
}

export async function scheduleSessionAction(_: FormState, form: FormData): Promise<FormState> {
  const id = str(form, "instance_id");
  const timezone = str(form, "timezone") ?? "UTC";
  const every = Number(str(form, "every") ?? "0");
  const count = Number(str(form, "count") ?? "");
  const r = await attempt((uid) =>
    scheduleSession(serverStore(), uid, {
      instance_id: id,
      title: str(form, "title") ?? "",
      starts_at: instantFrom(str(form, "starts_at"), timezone),
      timezone,
      duration_minutes: Number(str(form, "duration_minutes")),
      recurrence: every > 0 ? { freq: "weekly", interval: every, ...(Number.isInteger(count) && count > 0 ? { count } : {}) } : null,
      auto_resume: form.get("auto_resume") === "on",
      auto_pause: form.get("auto_pause") === "on",
      notes: str(form, "notes") ?? "",
    }),
  );
  return "error" in r ? r : refresh(id);
}

export async function rsvpAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) => rsvp(serverStore(), uid, { session_id: str(form, "session_id"), occurrence_start: str(form, "occurrence_start"), response: str(form, "response") }));
  return "error" in r ? r : refresh(str(form, "instance_id"));
}

export async function moveOccurrenceAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await attempt((uid) =>
    moveOccurrence(serverStore(), uid, { session_id: str(form, "session_id"), occurrence_start: str(form, "occurrence_start"), starts_at: instantFrom(str(form, "starts_at"), str(form, "timezone") ?? "UTC") }),
  );
  return "error" in r ? r : refresh(str(form, "instance_id"));
}

export async function cancelAction(_: FormState, form: FormData): Promise<FormState> {
  const occurrence = str(form, "occurrence_start");
  const r = await attempt((uid) => cancelSession(serverStore(), uid, { session_id: str(form, "session_id"), ...(occurrence ? { occurrence_start: occurrence } : {}) }));
  return "error" in r ? r : refresh(str(form, "instance_id"));
}

export async function createFeedAction(_: FormState, form: FormData): Promise<FormState> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const key = process.env.CALENDAR_FEED_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const r = await attempt((uid) => rotateCalendarFeed(serverStore(), uid, { key, origin }));
  return "error" in r ? r : refresh(str(form, "instance_id"));
}
