// Notifications (app-flow.md, Route map: session reminders, user stream): the reminders the Scheduler
// has sent in the last 7 days, newest first, and those it will send in the next 7 days, soonest first.
// Each row leads to the instance lobby, where Web Push reminders also open (api.md, Messages).
import { BellRing, CalendarClock, Clock, Settings } from "lucide-react";
import { LiveReminders } from "@/components/notifications/live-reminders";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { List, ListRow } from "@/components/ui/list";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { formatWhen } from "@/components/when";
import { listReminders, type ReminderView } from "@/lib/api/notifications";
import { requestTime } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

function lead(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}

function Reminders({ list, timezone, empty }: { list: ReminderView[]; timezone: string; empty: string }) {
  if (list.length === 0) return <EmptyState icon={<BellRing {...ICON} />}>{empty}</EmptyState>;
  return (
    <List>
      {list.map((r) => (
        <ListRow
          key={`${r.session_id}:${r.occurrence_start}:${r.lead_minutes}`}
          icon={r.sent ? <BellRing {...ICON_DENSE} /> : <Clock {...ICON_DENSE} />}
          title={r.title}
          href={`/instances/${r.instance_id}`}
          badge={<Badge tone={r.sent ? "neutral" : "accent"}>{r.sent ? "Sent" : "Due"}</Badge>}
          meta={
            <>
              <span className="text-ink">Starts {formatWhen(r.starts_at, timezone)}</span> · {r.instance_name} · {r.campaign_title}
              <br />
              <span className="tabular">
                {lead(r.lead_minutes)} before · {r.sent ? "sent" : "sends"} {formatWhen(r.remind_at, timezone)}
              </span>
            </>
          }
          actions={
            <ButtonLink href={`/instances/${r.instance_id}/schedule`} size="sm" variant="quiet" icon={<CalendarClock {...ICON_DENSE} />} aria-label={`Schedule for ${r.instance_name}`}>
              Schedule
            </ButtonLink>
          }
        />
      ))}
    </List>
  );
}

export default async function Notifications() {
  const user = await pageUser();
  const { recent, upcoming } = await listReminders(serverStore(), user.id, {}, new Date(requestTime()));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return (
    <Page>
      <PageHeader
        title="Notifications"
        description={`Session reminders for your games, in ${user.timezone}.`}
        actions={
          <ButtonLink href="/settings#reminders" icon={<Settings {...ICON_DENSE} />}>
            Change lead times
          </ButtonLink>
        }
      />
      <div className="-mt-4 mb-8">
        <LiveReminders userId={user.id} realtime={url && key ? { url, key } : null} />
      </div>

      <Section id="recent" title="Recent" description="Sent in the last 7 days, newest first.">
        <Reminders list={recent} timezone={user.timezone} empty="No reminders in the last 7 days." />
      </Section>

      <Section id="upcoming" title="Upcoming" description="Due in the next 7 days, soonest first.">
        <Reminders list={upcoming} timezone={user.timezone} empty="No reminders due in the next 7 days." />
      </Section>
    </Page>
  );
}
