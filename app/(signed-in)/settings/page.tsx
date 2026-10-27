// Settings (app-flow.md, Settings; docs/design/README.md, Screens: Settings): a form page with
// Account, Appearance, Reminders, Calendar, Your data, and, set apart, Delete account.
import { UserProfile } from "@clerk/nextjs";
import { CalendarSync, Monitor, Trash2 } from "lucide-react";
import { demoMode } from "@/lib/server/demo";
import { ActionForm } from "@/components/action-form";
import { CopyButton } from "@/components/invite-form";
import { DeleteAccount } from "@/components/settings/delete-account";
import { ExportData } from "@/components/settings/export";
import { EnablePush } from "@/components/settings/push";
import { ThemePicker } from "@/components/settings/theme";
import { Button } from "@/components/ui/button";
import { Choice, described, Field, FieldGroup, TextInput } from "@/components/ui/field";
import { ICON_DENSE, IconButton } from "@/components/ui/icon-button";
import { DangerZone } from "@/components/ui/card";
import { Page, PageHeader } from "@/components/ui/page";
import { listPushSubscriptions } from "@/lib/api/account";
import { calendarFeedKey, getCalendarFeed } from "@/lib/api/schedules";
import { disableFeedAction, profileAction, remindersAction, removePushAction } from "@/lib/server/account-actions";
import { origin } from "@/lib/server/pages";
import { createFeedAction } from "@/lib/server/schedule-actions";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const SECTIONS = [
  ["account", "Account"],
  ["appearance", "Appearance"],
  ["reminders", "Reminders"],
  ["calendar", "Calendar"],
  ["data", "Your data"],
  ["danger", "Delete account"],
] as const;

export default async function Settings() {
  const user = await pageUser();
  const store = serverStore();
  const browsers = await listPushSubscriptions(store, user.id);
  const feedKey = calendarFeedKey();
  const feed = feedKey ? await getCalendarFeed(store, user.id, { key: feedKey, origin: await origin() }) : { url: null };
  const vapid = process.env.VAPID_PUBLIC_KEY;
  const leadHint = "Minutes before a session, separated by commas. For example: 1440, 60.";

  return (
    <Page>
      {/* The navigation and the form column, centred together like every narrow page. */}
      <div className="mx-auto max-w-[54rem] [&>*:last-child]:mb-0">
        <PageHeader title="Settings" />
        <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,40rem)]">
          <nav aria-label="Settings sections" className="hidden lg:block">
            {/* The top padding sets the first item level with the first card's heading. */}
            <ul className="sticky top-[calc(var(--size-topbar)+24px)] flex flex-col gap-1 pt-2.5">
              {SECTIONS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="-mx-3 flex h-9 items-center rounded-control px-3 text-control text-ink hover:bg-page">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col gap-8">
            <section id="account" aria-label="Account">
              <ActionForm action={profileAction}>
                <FieldGroup legend="Account" description="How other players see you, and the time zone for every date and time.">
                  <Field id="display_name" label="Display name">
                    <TextInput id="display_name" name="display_name" required maxLength={40} defaultValue={user.display_name} autoComplete="nickname" />
                  </Field>
                  <Field id="timezone" label="Time zone" hint="An IANA name, such as Europe/London or America/Chicago.">
                    <TextInput name="timezone" required defaultValue={user.timezone} {...described("timezone", { hint: true })} />
                  </Field>
                  {demoMode() && <p className="text-caption text-muted">Email, password, and sign-in methods are managed by Clerk here.</p>}
                  <div>
                    <Button type="submit">Save account</Button>
                  </div>
                </FieldGroup>
              </ActionForm>
              {!demoMode() && (
                <div className="relative mt-4 overflow-x-auto">
                  {/* Delete account is Cadmium's own, below, so the account goes through its 30-day recovery stage. */}
                  <UserProfile routing="hash" appearance={{ elements: { profileSection__danger: { display: "none" } } }} />
                </div>
              )}
            </section>

            <section id="appearance" aria-label="Appearance">
              <FieldGroup legend="Appearance" description="Kept in this browser.">
                <ThemePicker />
              </FieldGroup>
            </section>

            <section id="reminders" aria-label="Reminders">
              <FieldGroup legend="Reminders" description="Reminders before each session of your games. They are listed on the Notifications page.">
                <ActionForm action={remindersAction} className="flex flex-col gap-4">
                  <Field id="lead_minutes" label="Remind me" hint={leadHint}>
                    <TextInput name="lead_minutes" defaultValue={user.reminders.lead_minutes.join(", ")} inputMode="numeric" {...described("lead_minutes", { hint: leadHint })} />
                  </Field>
                  {/* Keyed so turning on a browser below, which turns this on, shows here. */}
                  <Choice key={String(user.reminders.push)} name="push" defaultChecked={user.reminders.push} label="Also as browser notifications" />
                  <div>
                    <Button type="submit">Save reminders</Button>
                  </div>
                </ActionForm>
                <div className="flex flex-col gap-3 border-t border-rule pt-4">
                  <p className="text-label font-medium text-ink">Browsers</p>
                  {vapid ? <EnablePush publicKey={vapid} /> : <p className="text-caption text-muted">Browser notifications are not configured on this server.</p>}
                  {browsers.length > 0 && (
                    <ul className="divide-y divide-rule rounded-card border border-rule">
                      {browsers.map((b) => (
                        <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="flex min-w-0 items-center gap-2 text-caption">
                            <Monitor {...ICON_DENSE} className="shrink-0 text-muted" />
                            <span className="truncate">{b.label || "Browser"}</span>
                          </span>
                          <ActionForm action={removePushAction}>
                            <input type="hidden" name="subscription_id" value={b.id} />
                            <IconButton type="submit" tone="danger" dense tip="end" label={`Remove ${b.label || "browser"}`} icon={<Trash2 {...ICON_DENSE} />} />
                          </ActionForm>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </FieldGroup>
            </section>

            <section id="calendar" aria-label="Calendar">
              <FieldGroup legend="Calendar" description="A private feed of your sessions for a calendar app. Anyone with the URL can read it.">
                {feed.url ? (
                  <>
                    <Field id="feed_url" label="Feed URL">
                      <TextInput id="feed_url" readOnly value={feed.url} className="bg-desk font-mono text-code" />
                    </Field>
                    <div className="flex flex-wrap items-center gap-3">
                      <CopyButton text={feed.url} />
                      <ActionForm action={createFeedAction}>
                        <Button type="submit" size="sm" icon={<CalendarSync {...ICON_DENSE} />}>
                          New URL
                        </Button>
                      </ActionForm>
                      <ActionForm action={disableFeedAction}>
                        <Button type="submit" size="sm" variant="danger">
                          Turn off
                        </Button>
                      </ActionForm>
                    </div>
                    <p className="text-caption text-muted">New URL replaces this one; the old URL stops working.</p>
                  </>
                ) : !feedKey ? (
                  <p className="text-caption text-muted">Calendar feeds are not configured on this server.</p>
                ) : (
                  <ActionForm action={createFeedAction}>
                    <Button type="submit" icon={<CalendarSync {...ICON_DENSE} />}>
                      Create feed
                    </Button>
                  </ActionForm>
                )}
              </FieldGroup>
            </section>

            <section id="data" aria-label="Your data">
              <FieldGroup legend="Your data" description="Everything your account owns, as a ZIP archive.">
                <div>
                  <ExportData />
                </div>
              </FieldGroup>
            </section>

            <DangerZone id="danger" title="Delete account">
              <DeleteAccount name={user.display_name} />
            </DangerZone>
          </div>
        </div>
      </div>
    </Page>
  );
}
