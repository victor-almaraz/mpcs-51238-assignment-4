-- Account fixes: the Clerk sync keeps the display name set in Settings; holds keep what the Privacy
-- Policy (section 7) says they keep; the data export leaves out moderation records; suspended users get
-- no reminders; and /notifications reads which reminders the Scheduler has sent. Access as in the store
-- migration: service role only.

-- Whether the user was held for themself, as opposed to only through a held character or campaign.
alter table users add column hold_direct boolean not null default false;
update users set hold_direct = true where held_at is not null;

-- Creates a user from Clerk, or updates the email address of an existing one. The display name comes
-- from Clerk only when the user is created; after that the user sets it in Settings. A deleted user is
-- never revived by a late update.
create or replace function cadmium_upsert_user(p_id text, p_email text, p_display_name text, p_terms_accepted_at timestamptz) returns jsonb
language sql as $$
  insert into users (id, email, display_name, terms_accepted_at)
  values (p_id, p_email, p_display_name, p_terms_accepted_at)
  on conflict (id) do update
    set email = excluded.email,
        terms_accepted_at = coalesce(users.terms_accepted_at, excluded.terms_accepted_at)
    where users.status <> 'deleted'
  returning to_jsonb(users.*);
$$;

-- Holds -------------------------------------------------------------------------------------------

-- Sets (with a reason) or clears (null) a hold on a user, character, or campaign. Holding a record also
-- holds its owner; a held owner's characters, campaigns, drafts, and uploaded images are kept by every
-- purge. Releasing a record releases its owner when the owner was not held for themself and none of
-- their other records is held; releasing a user leaves their records' holds, and the user stays held
-- while any of them is.
create or replace function cadmium_set_hold(p_kind text, p_id text, p_reason text) returns boolean language plpgsql as $$
declare
  owner text;
begin
  if p_kind = 'character' then
    select owner_id into owner from characters where id = p_id;
    update characters set held_at = case when p_reason is null then null else coalesce(held_at, now()) end, hold_reason = p_reason where id = p_id;
  elsif p_kind = 'campaign' then
    select author_id into owner from campaigns where id = p_id;
    update campaigns set held_at = case when p_reason is null then null else coalesce(held_at, now()) end, hold_reason = p_reason where id = p_id;
  elsif p_kind = 'user' then
    select id into owner from users where id = p_id;
  else
    raise exception 'unknown record kind %', p_kind using errcode = 'CD422';
  end if;
  if owner is null then return false; end if;
  if p_reason is not null then
    update users set held_at = coalesce(held_at, now()), hold_reason = coalesce(hold_reason, p_reason),
                     hold_direct = hold_direct or p_kind = 'user'
     where id = owner;
  else
    if p_kind = 'user' then
      update users set hold_direct = false where id = owner;
    end if;
    update users set held_at = null, hold_reason = null
     where id = owner and not hold_direct
       and not exists (select 1 from characters where owner_id = owner and held_at is not null)
       and not exists (select 1 from campaigns where author_id = owner and held_at is not null);
  end if;
  return true;
end $$;

-- Purge ---------------------------------------------------------------------------------------------

-- Accounts and campaigns whose deletion was requested more than 90 days before p_now, not held and, for
-- a campaign, not authored by a held user.
create or replace function cadmium_purge_due(p_now timestamptz) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(id) from users where status in ('closing', 'deleted') and deletion_requested_at <= p_now - interval '90 days' and held_at is null), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(c.id) from campaigns c
                            where c.deleted_at <= p_now - interval '90 days' and c.held_at is null
                              and not exists (select 1 from users u where u.id = c.author_id and u.held_at is not null)), '[]'::jsonb));
$$;

-- Drafts deleted more than 90 days ago are erased with the daily purge, unless their owner is held.
create or replace function cadmium_purge_drafts(p_now timestamptz) returns integer language plpgsql as $$
declare
  n integer;
begin
  delete from material_drafts d
   where d.deleted_at <= p_now - interval '90 days'
     and not exists (select 1 from users u where u.id = d.owner_id and u.held_at is not null);
  get diagnostics n = row_count;
  return n;
end $$;

-- The purge's work on characters and images: characters deleted more than 90 days ago, then uploaded
-- images no record refers to. Neither is erased while it or its owner (the uploader, for an image) is
-- held. Returns the counts.
create or replace function cadmium_purge_content(p_now timestamptz) returns jsonb language plpgsql as $$
declare
  c integer;
  a integer;
begin
  delete from characters ch
   where ch.deleted_at <= p_now - interval '90 days' and ch.held_at is null
     and not exists (select 1 from users u where u.id = ch.owner_id and u.held_at is not null);
  get diagnostics c = row_count;
  delete from assets
   where jsonb_array_length(bundle_refs) = 0 and held_at is null
     and not exists (select 1 from characters where portrait_asset = assets.hash)
     and not exists (select 1 from users u where u.id = assets.uploader_id and u.held_at is not null);
  get diagnostics a = row_count;
  return jsonb_build_object('characters', c, 'assets', a);
end $$;

-- 90 days after shutdown (data-model.md, Deletion): erases every account and campaign that is not
-- held, and every bundle no held campaign uses. A held user's campaigns are kept.
create or replace function cadmium_shutdown_purge() returns jsonb language plpgsql as $$
declare
  u text;
  c text;
  users_erased integer := 0;
  campaigns_erased integer := 0;
begin
  for u in select id from users where held_at is null loop
    if exists (select 1 from campaigns where author_id = u and held_at is not null)
       or exists (select 1 from characters where owner_id = u and held_at is not null) then
      continue;
    end if;
    perform cadmium_purge_user(u);
    users_erased := users_erased + 1;
  end loop;
  for c in select k.id from campaigns k
            where k.held_at is null and not exists (select 1 from users h where h.id = k.author_id and h.held_at is not null) loop
    perform cadmium_purge_campaign(c);
    campaigns_erased := campaigns_erased + 1;
  end loop;
  delete from bundles b where not exists (
    select 1 from campaign_materials m where m.kind = b.kind and m.bundle_id = b.id and m.bundle_version = b.version);
  delete from scheduler_marks;
  delete from rate_windows;
  return jsonb_build_object('users', users_erased, 'campaigns', campaigns_erased);
end $$;

-- Export --------------------------------------------------------------------------------------------

-- Every record that refers to the user (api.md, Data export), grouped by export file. Operator and
-- moderation fields (the operator flag, suspension, holds) and secrets are left out.
create or replace function cadmium_export_user(p_user text) returns jsonb language sql stable as $$
  with authored as (select id from campaigns where author_id = p_user),
       instances_authored as (select id from instances where campaign_id in (select id from authored))
  select jsonb_build_object(
    'profile', (select to_jsonb(u.*) - array['calendar_token_hash', 'operator', 'suspended_at', 'held_at', 'hold_reason', 'hold_direct'] from users u where u.id = p_user),
    'push_subscriptions', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'created_at', created_at)) from push_subscriptions where user_id = p_user), '[]'::jsonb),
    'characters', coalesce((select jsonb_agg(to_jsonb(c.*) - array['held_at', 'hold_reason'] order by c.created_at) from characters c where c.owner_id = p_user), '[]'::jsonb),
    'adventures', coalesce((select jsonb_agg(b.data) from bundles b where b.origin = 'author' and b.publisher_id = p_user), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object(
        'campaign', to_jsonb(c.*) - array['held_at', 'hold_reason'],
        'members', (select coalesce(jsonb_agg(to_jsonb(m.*)), '[]'::jsonb) from campaign_members m where m.campaign_id = c.id),
        'materials', (select coalesce(jsonb_agg(to_jsonb(m.*)), '[]'::jsonb) from campaign_materials m where m.campaign_id = c.id),
        'invitations', (select coalesce(jsonb_agg(to_jsonb(i.*) - 'token_hash'), '[]'::jsonb) from invitations i where i.campaign_id = c.id),
        'instances', (select coalesce(jsonb_agg(jsonb_build_object(
            'instance', to_jsonb(i.*),
            'characters', (select coalesce(jsonb_agg(to_jsonb(ic.*)), '[]'::jsonb) from instance_characters ic where ic.instance_id = i.id),
            'events', (select coalesce(jsonb_agg(jsonb_build_object('seq', e.seq, 'version', e.version, 'type', e.type) || e.payload order by e.seq), '[]'::jsonb) from events e where e.instance_id = i.id),
            'input_logs', (select coalesce(jsonb_agg(to_jsonb(l.*) order by l.created_at), '[]'::jsonb) from input_logs l where l.instance_id = i.id),
            'narrations', (select coalesce(jsonb_agg(to_jsonb(n.*) order by n.version), '[]'::jsonb) from narrations n where n.instance_id = i.id),
            'sessions', (select coalesce(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb) from scheduled_sessions s where s.instance_id = i.id))), '[]'::jsonb)
           from instances i where i.campaign_id = c.id))) from campaigns c where c.author_id = p_user), '[]'::jsonb),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('campaign_id', m.campaign_id, 'title', c.title, 'role', m.role, 'joined_at', m.joined_at))
                               from campaign_members m join campaigns c on c.id = m.campaign_id where m.user_id = p_user), '[]'::jsonb),
    'inputs', coalesce((select jsonb_agg(to_jsonb(l.*) || jsonb_build_object(
        'events', (select coalesce(jsonb_agg(jsonb_build_object('type', e.type) || e.payload order by e.seq), '[]'::jsonb) from events e where e.instance_id = l.instance_id and e.version = l.version),
        'narration', (select n.text from narrations n where n.instance_id = l.instance_id and n.version = l.version)) order by l.created_at)
      from input_logs l where l.user_id = p_user), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(to_jsonb(i.*) - 'token_hash') from invitations i where i.inviter_id = p_user or i.invitee_user_id = p_user), '[]'::jsonb),
    'schedule', jsonb_build_object(
      'rsvps', coalesce((select jsonb_agg(to_jsonb(r.*)) from rsvps r where r.user_id = p_user), '[]'::jsonb),
      'sessions', coalesce((select jsonb_agg(to_jsonb(s.*)) from scheduled_sessions s where s.created_by = p_user), '[]'::jsonb)));
$$;

-- Scheduler -----------------------------------------------------------------------------------------

-- What a scheduler run needs: sessions of instances that have not ended, those instances, and the
-- members of their campaigns with their reminder settings. Closing and suspended accounts get no
-- reminders (SPEC_ISSUES.md#account-suspension).
create or replace function cadmium_scheduler_snapshot() returns jsonb language sql stable as $$
  with i as (
    select id, status, campaign_id from instances where status <> 'ended' and deleted_at is null
  )
  select cadmium_schedules((select coalesce(jsonb_agg(id), '[]'::jsonb) from i))
         || jsonb_build_object(
              'instances', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'campaign_id', campaign_id)) from i), '[]'::jsonb),
              'members', coalesce((select jsonb_agg(jsonb_build_object('campaign_id', m.campaign_id, 'user_id', m.user_id, 'reminders', u.reminders))
                                     from campaign_members m join users u on u.id = m.user_id and u.status = 'active' and u.suspended_at is null
                                    where m.campaign_id in (select campaign_id from i)), '[]'::jsonb));
$$;

-- Which of the user's reminder keys (reminder:<session>:<occurrence>:<user>:<lead>) the Scheduler has
-- marked done: it marks each reminder just before sending it.
create function cadmium_reminder_marks(p_user text, p_keys jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(key), '[]'::jsonb) from scheduler_marks
   where key in (select jsonb_array_elements_text(p_keys)) and key like 'reminder:%:' || p_user || ':%';
$$;

do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('cadmium_upsert_user', 'cadmium_set_hold', 'cadmium_purge_due', 'cadmium_purge_drafts', 'cadmium_purge_content', 'cadmium_shutdown_purge', 'cadmium_export_user', 'cadmium_scheduler_snapshot', 'cadmium_reminder_marks') loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
