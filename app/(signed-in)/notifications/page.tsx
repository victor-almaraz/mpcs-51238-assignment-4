// Notifications (app-flow.md, Route map: session reminders, user stream): the reminders the Scheduler
// has sent in the last 7 days, newest first, and those it will send in the next 7 days, soonest first.
// Each row leads to the instance lobby, where Web Push reminders also open (api.md, Messages).
import Link from "next/link";
import { LiveReminders } from "@/components/notifications/live-reminders";
import { formatWhen } from "@/components/when";
import { listReminders, type ReminderView } from "@/lib/api/notifications";
import { requestTime } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const row = "flex flex-wrap items-baseline justify-between gap-2 border-b border-rule py-1";
const meta = "ml-2 font-ui text-caption text-muted";

function lead(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}

function Reminders({ list, timezone, empty }: { list: ReminderView[]; timezone: string; empty: string }) {
  if (list.length === 0) return <p className="mt-2 text-muted">{empty}</p>;
  return (
    <ul className="mt-2">
      {list.map((r) => (
        <li key={`${r.session_id}:${r.occurrence_start}:${r.lead_minutes}`} className={row}>
          <span>
            <Link href={`/instances/${r.instance_id}`} className="text-accent">
              {r.title}
            </Link>{" "}
            starts {formatWhen(r.starts_at, timezone)}
            <span className={meta}>
              {r.instance_name} · {r.campaign_title}
            </span>
          </span>
          <span className="flex gap-3 font-ui text-caption text-muted">
            <span>
              {lead(r.lead_minutes)} before · {formatWhen(r.remind_at, timezone)}
            </span>
            <Link href={`/instances/${r.instance_id}/schedule`} className="text-accent">
              Schedule
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function Notifications() {
  const user = await pageUser();
  const { recent, upcoming } = await listReminders(serverStore(), user.id, {}, new Date(requestTime()));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">Notifications</h1>
      <p className="mt-1 font-ui text-caption text-muted">
        Session reminders, in {user.timezone}.{" "}
        <Link href="/settings" className="text-accent">
          Change lead times
        </Link>
      </p>
      <div className="mt-2">
        <LiveReminders userId={user.id} realtime={url && key ? { url, key } : null} />
      </div>

      <section className="mt-8">
        <h2 className="font-display text-heading">Recent</h2>
        <Reminders list={recent} timezone={user.timezone} empty="No reminders in the last 7 days." />
      </section>

      <section className="mt-8">
        <h2 className="font-display text-heading">Upcoming</h2>
        <Reminders list={upcoming} timezone={user.timezone} empty="No reminders due in the next 7 days." />
      </section>
    </div>
  );
}
