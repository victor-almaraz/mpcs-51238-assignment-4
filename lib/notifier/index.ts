// The Notifier (architecture.md, Components): session reminders on the user stream, and by Web Push
// where the user enabled it. Cadmium sends no email.

import { userTopic, type Broadcaster } from "../broadcast";

export interface Reminder {
  instance_id: string;
  session_id: string;
  occurrence_start: string;
  starts_at: string;
  title: string;
}

export interface Notifier {
  remind(userId: string, push: boolean, reminder: Reminder): Promise<void>;
}

/**
 * Reminders on the user channel. `push`, when given, delivers Web Push to the user's subscriptions;
 * without it (no VAPID keys), reminders reach users only in the app.
 */
export function notifier(broadcast: Broadcaster, push?: (userId: string, reminder: Reminder) => Promise<void>): Notifier {
  return {
    async remind(userId, wantsPush, r) {
      await broadcast.send(userTopic(userId), [{ type: "session_reminder", instance_id: r.instance_id, version: 0, session_id: r.session_id, occurrence_start: r.occurrence_start, starts_at: r.starts_at }]);
      if (wantsPush && push) await push(userId, r);
    },
  };
}
