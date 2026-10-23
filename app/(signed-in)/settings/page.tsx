// Settings (app-flow.md, Settings): Account, Appearance, Reminders, Calendar, Your data.
import { UserProfile } from "@clerk/nextjs";
import { ActionForm } from "@/components/action-form";
import { CopyButton } from "@/components/invite-form";
import { DeleteAccount } from "@/components/settings/delete-account";
import { EnablePush } from "@/components/settings/push";
import { ThemePicker } from "@/components/settings/theme";
import { listPushSubscriptions } from "@/lib/api/account";
import { getCalendarFeed } from "@/lib/api/schedules";
import { disableFeedAction, profileAction, remindersAction, removePushAction } from "@/lib/server/account-actions";
import { origin } from "@/lib/server/pages";
import { createFeedAction } from "@/lib/server/schedule-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const field = "rounded-control border border-border bg-page px-2 py-1";
const button = "rounded-control border border-border px-3 py-1 font-ui text-control";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 flex flex-col gap-3">
      <h2 className="font-display text-heading">{title}</h2>
      {children}
    </section>
  );
}

export default async function Settings() {
  const user = await pageUser();
  const store = serverStore();
  const browsers = await listPushSubscriptions(store, user.id);
  const feedKey = process.env.CALENDAR_FEED_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const feed = feedKey ? await getCalendarFeed(store, user.id, { key: feedKey, origin: await origin() }) : { url: null };
  const vapid = process.env.VAPID_PUBLIC_KEY;

  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <h1 className="font-display text-title">Settings</h1>

      <Section title="Account">
        <ActionForm action={profileAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-ui text-label">Display name</span>
            <input name="display_name" required maxLength={40} defaultValue={user.display_name} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-ui text-label">Time zone</span>
            <input name="timezone" required defaultValue={user.timezone} className={field} />
          </label>
          <div>
            <button type="submit" className={button}>
              Save
            </button>
          </div>
        </ActionForm>
        <UserProfile routing="hash" />
      </Section>

      <Section title="Appearance">
        <ThemePicker />
      </Section>

      <Section title="Reminders">
        <ActionForm action={remindersAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-ui text-label">Minutes before a session, separated by commas</span>
            <input name="lead_minutes" defaultValue={user.reminders.lead_minutes.join(", ")} className={field} />
          </label>
          <label className="flex items-baseline gap-2">
            <input type="checkbox" name="push" defaultChecked={user.reminders.push} /> Also as browser notifications
          </label>
          <div>
            <button type="submit" className={button}>
              Save
            </button>
          </div>
        </ActionForm>
        {vapid ? <EnablePush publicKey={vapid} /> : <p className="font-ui text-caption text-muted">Browser notifications are not configured on this server.</p>}
        {browsers.length > 0 && (
          <ul>
            {browsers.map((b) => (
              <li key={b.id} className="flex items-baseline justify-between border-b border-rule py-1">
                <span className="font-ui text-caption">{b.label || "Browser"}</span>
                <ActionForm action={removePushAction}>
                  <input type="hidden" name="subscription_id" value={b.id} />
                  <button type="submit" className="font-ui text-caption text-danger">
                    Remove
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Calendar">
        {feed.url ? (
          <div className="flex flex-wrap items-baseline gap-4">
            <span className="break-all font-mono text-code">{feed.url}</span>
            <CopyButton text={feed.url} />
            <ActionForm action={createFeedAction}>
              <button type="submit" className="font-ui text-control text-accent">
                New URL
              </button>
            </ActionForm>
            <ActionForm action={disableFeedAction}>
              <button type="submit" className="font-ui text-control text-danger">
                Turn off
              </button>
            </ActionForm>
          </div>
        ) : (
          <ActionForm action={createFeedAction}>
            <button type="submit" className={button}>
              Create feed
            </button>
          </ActionForm>
        )}
      </Section>

      <Section title="Your data">
        <p>
          <a href="/v1/me/export.zip" className="text-accent underline">
            Export my data
          </a>
        </p>
        <DeleteAccount name={user.display_name} />
      </Section>
    </div>
  );
}
