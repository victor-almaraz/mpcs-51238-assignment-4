// The deployment's Web Push configuration (app-flow.md, Stack: Push). Server-only.

import { CONTACT } from "../legal";
import { webPush } from "../notifier/push";

/**
 * Web Push from `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (default: `mailto:` the
 * contact address). Undefined when either key is unset, so reminders reach users only in the app.
 */
export function webPushFromEnv(store: Parameters<typeof webPush>[0], env: Record<string, string | undefined> = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return undefined;
  const subject = env.VAPID_SUBJECT?.trim() || `mailto:${env.CONTACT_EMAIL?.trim() || CONTACT}`;
  return webPush(store, { publicKey, privateKey, subject });
}
