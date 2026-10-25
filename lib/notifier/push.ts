// Web Push delivery of session reminders (app-flow.md, Stack: Push; api.md, User messages): a
// notification with the session title and start time that opens the instance lobby, encrypted to each
// of the user's subscriptions with the deployment's VAPID key pair. Subscriptions the push service
// reports gone are deleted (app-flow.md, Scheduled jobs).

import webpush, { type PushSubscription, type RequestOptions } from "web-push";
import type { Store } from "../store";
import type { Reminder } from "./index";

export interface VapidDetails {
  publicKey: string;
  privateKey: string;
  /** A `mailto:` or `https:` contact for push services. */
  subject: string;
}

export type Send = (subscription: PushSubscription, payload: string, options: RequestOptions) => Promise<unknown>;

/** Statuses with which a push service reports a subscription that no longer exists (RFC 8030). */
const GONE = new Set([404, 410]);

/** What `public/sw.js` shows: the session title, its start in the user's time zone, and the lobby link. */
export function pushPayload(r: Reminder, timeZone: string): { title: string; body: string; url: string } {
  const start = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(r.starts_at));
  return { title: r.title || "Session reminder", body: `Starts ${start}`, url: `/instances/${r.instance_id}` };
}

/**
 * Sends one reminder to every subscription of the user. A reminder expires at the session's start.
 * Throws after trying every subscription when any delivery failed for a reason other than a gone
 * subscription.
 */
export function webPush(
  store: Pick<Store, "listPush" | "pushResult" | "getUser">,
  vapid: VapidDetails,
  now: () => Date = () => new Date(),
  send: Send = webpush.sendNotification,
): (userId: string, reminder: Reminder) => Promise<void> {
  return async (userId, reminder) => {
    const subscriptions = await store.listPush(userId);
    if (subscriptions.length === 0) return;
    const user = await store.getUser(userId);
    const payload = JSON.stringify(pushPayload(reminder, user?.timezone ?? "UTC"));
    const TTL = Math.max(60, Math.round((Date.parse(reminder.starts_at) - now().getTime()) / 1000));
    const failed: string[] = [];
    for (const s of subscriptions) {
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { vapidDetails: vapid, TTL });
        await store.pushResult(s.endpoint, false);
      } catch (e) {
        const status = (e as { statusCode?: unknown }).statusCode;
        if (typeof status === "number" && GONE.has(status)) await store.pushResult(s.endpoint, true);
        else failed.push(`${s.label || s.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (failed.length > 0) throw new Error(`Web Push failed for ${failed.length} of ${subscriptions.length} subscriptions: ${failed.join("; ")}`);
  };
}
