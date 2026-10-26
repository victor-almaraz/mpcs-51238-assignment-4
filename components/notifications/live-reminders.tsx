"use client";
// Keeps /notifications current (app-flow.md, Route map: user stream). A `session_reminder` on the user
// channel re-renders the page at once; a refresh every minute, the Scheduler's own cadence, covers a
// channel that is down or not configured and moves reminders from Upcoming to Recent as they fall due.
import { BellDot, Radio, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerkSession } from "@/components/clerk";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { realtimeClient, subscribeUser } from "@/lib/broadcast/client";
import { plural } from "@/lib/text";

/** How often to re-render the list without a message. */
const REFRESH_MS = 60_000;

export function LiveReminders({ userId, realtime }: { userId: string; realtime: { url: string; key: string } | null }) {
  const router = useRouter();
  const { session } = useClerkSession();
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    if (!realtime || !session) return () => clearInterval(t);
    const client = realtimeClient(realtime.url, realtime.key, () => session.getToken());
    const stop = subscribeUser(client, userId, (m) => {
      if (m.type !== "session_reminder") return;
      setFresh((n) => n + 1);
      router.refresh();
    });
    return () => {
      clearInterval(t);
      stop();
    };
  }, [router, realtime, session, userId]);

  return (
    <p className={`inline-flex items-center gap-2 text-caption ${fresh > 0 ? "font-medium text-accent" : "text-muted"}`} aria-live="polite">
      {fresh > 0 ? <BellDot {...ICON_DENSE} /> : realtime ? <Radio {...ICON_DENSE} /> : <RefreshCw {...ICON_DENSE} />}
      {fresh > 0 ? `${plural(fresh, "new reminder")} since you opened this page.` : realtime ? "New reminders appear here as they arrive." : "This page refreshes every minute."}
    </p>
  );
}
