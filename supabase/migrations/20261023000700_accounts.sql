-- Settings, export, and deletion (app-flow.md, Settings; api.md, Users, Data export; data-model.md,
-- Push subscription, Deletion). Access as in the store migration: service role only.

create table push_subscriptions (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  label text not null default '' check (char_length(label) <= 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_by_user on push_subscriptions (user_id);

-- Holds for reports of apparently illegal content (data-model.md, Deletion); operators set them.
alter table users add column held_at timestamptz, add column hold_reason text;
alter table characters add column held_at timestamptz, add column hold_reason text;
alter table campaigns add column held_at timestamptz, add column hold_reason text;

-- Users ---------------------------------------------------------------------------------------------

-- Updates the fields a user edits in Settings; null leaves a field unchanged.
create function cadmium_update_me(p_id text, p_display_name text, p_timezone text, p_reminders jsonb) returns jsonb language sql as $$
  update users set display_name = coalesce(p_display_name, display_name), timezone = coalesce(p_timezone, timezone),
                   reminders = coalesce(p_reminders, reminders)
   where id = p_id and status = 'active'
  returning to_jsonb(users.*);
$$;

-- The recovery stage: the account closes and is hidden from members.
create function cadmium_request_deletion(p_id text) returns jsonb language sql as $$
  update users set status = 'closing', deletion_requested_at = now() where id = p_id and status = 'active'
  returning to_jsonb(users.*);
$$;

-- Restores a closing account within 30 days of the request.
create function cadmium_restore_account(p_id text) returns jsonb language sql as $$
  update users set status = 'active', deletion_requested_at = null
   where id = p_id and status = 'closing' and deletion_requested_at > now() - interval '30 days'
  returning to_jsonb(users.*);
$$;

-- Campaigns show only active members: closing accounts are hidden (data-model.md, Deletion).
create or replace function cadmium_campaign(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description, 'author_id', c.author_id,
    'system', c.system, 'system_versions', c.system_versions, 'modules', c.modules,
    'archived', c.archived, 'invite_link_code', c.invite_link_code, 'created_at', c.created_at,
    'materials', coalesce((select jsonb_agg(jsonb_build_object('kind', m.kind, 'id', m.bundle_id, 'version', m.bundle_version)
                                            order by m.position)
                             from campaign_materials m where m.campaign_id = c.id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', u.display_name, 'role', m.role)
                                          order by m.role, m.joined_at, m.user_id)
                           from campaign_members m join users u on u.id = m.user_id and u.status = 'active'
                          where m.campaign_id = c.id), '[]'::jsonb),
    'instance_ids', coalesce((select jsonb_agg(i.id order by i.created_at, i.id)
                                from instances i where i.campaign_id = c.id and i.deleted_at is null), '[]'::jsonb))
  from campaigns c where c.id = p_id and c.deleted_at is null;
$$;

-- Push subscriptions ---------------------------------------------------------------------------------

create function cadmium_add_push(p_id text, p_user text, p_endpoint text, p_public_key text, p_auth_secret text, p_label text) returns jsonb
language sql as $$
  insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, label) values (p_id, p_user, p_endpoint, p_public_key, p_auth_secret, p_label)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label
  returning jsonb_build_object('id', id, 'label', label, 'created_at', created_at, 'last_used_at', last_used_at);
$$;

create function cadmium_list_push(p_user text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', label, 'created_at', created_at, 'last_used_at', last_used_at,
                                               'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth) order by created_at), '[]'::jsonb)
  from push_subscriptions where user_id = p_user;
$$;

create function cadmium_remove_push(p_id text, p_user text) returns boolean language plpgsql as $$
begin
  delete from push_subscriptions where id = p_id and user_id = p_user;
  return found;
end $$;

-- A push service reported the subscription gone; or it delivered, and the time is recorded.
create function cadmium_push_result(p_endpoint text, p_gone boolean) returns void language sql as $$
  delete from push_subscriptions where endpoint = p_endpoint and p_gone;
  update push_subscriptions set last_used_at = now() where endpoint = p_endpoint and not p_gone;
$$;

-- Export --------------------------------------------------------------------------------------------

-- Every record that refers to the user (api.md, Data export), grouped by export file.
create function cadmium_export_user(p_user text) returns jsonb language sql stable as $$
  with authored as (select id from campaigns where author_id = p_user),
       instances_authored as (select id from instances where campaign_id in (select id from authored))
  select jsonb_build_object(
    'profile', (select to_jsonb(u.*) - 'calendar_token_hash' from users u where u.id = p_user),
    'push_subscriptions', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'created_at', created_at)) from push_subscriptions where user_id = p_user), '[]'::jsonb),
    'characters', coalesce((select jsonb_agg(to_jsonb(c.*) order by c.created_at) from characters c where c.owner_id = p_user), '[]'::jsonb),
    'adventures', coalesce((select jsonb_agg(b.data) from bundles b where b.origin = 'author' and b.publisher_id = p_user), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object(
        'campaign', to_jsonb(c.*),
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

-- Purge ---------------------------------------------------------------------------------------------

-- Accounts and campaigns whose deletion was requested more than 90 days before p_now, not held.
create function cadmium_purge_due(p_now timestamptz) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(id) from users where status in ('closing', 'deleted') and deletion_requested_at <= p_now - interval '90 days' and held_at is null), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(id) from campaigns where deleted_at <= p_now - interval '90 days' and held_at is null), '[]'::jsonb));
$$;

-- Erases a campaign with its instances, their records, schedules, and invitations; characters of
-- other users in its instances become available again.
create function cadmium_purge_campaign(p_id text) returns void language plpgsql as $$
begin
  update characters set status = 'available', instance_id = null
   where instance_id in (select id from instances where campaign_id = p_id);
  delete from invitations where campaign_id = p_id;
  delete from instance_characters where instance_id in (select id from instances where campaign_id = p_id);
  delete from instances where campaign_id = p_id;
  delete from campaigns where id = p_id;
end $$;

-- Erases an account and what it owns (data-model.md, Deletion: purging an account). The Clerk user is
-- deleted by the caller through Clerk's API.
create function cadmium_purge_user(p_user text) returns void language plpgsql as $$
declare
  c text;
  mine text[];
  gone jsonb;
begin
  if exists (select 1 from users where id = p_user and held_at is not null) then
    raise exception 'user % is held', p_user using errcode = 'CD423';
  end if;
  select coalesce(array_agg(id), '{}') into mine from characters where owner_id = p_user;
  -- The user's remaining events in other users' instances name a former player.
  update events set payload = payload || '{"actor_label": "Former player"}'::jsonb
   where actor_id = any (mine)
     and instance_id in (select i.id from instances i join campaigns k on k.id = i.campaign_id where k.author_id <> p_user);
  delete from input_logs where user_id = p_user;
  for c in select id from campaigns where author_id = p_user loop
    perform cadmium_purge_campaign(c);
  end loop;
  delete from instance_characters where user_id = p_user;
  delete from characters where owner_id = p_user;
  delete from invitations where inviter_id = p_user or invitee_user_id = p_user;
  delete from scheduled_sessions where created_by = p_user;
  -- Instances pinning one of the user's bundles end without an ending.
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'version', version)), '[]'::jsonb) into gone
    from bundles where origin = 'author' and publisher_id = p_user;
  update instances set status = 'ended', ended_at = coalesce(ended_at, now()), round_deadline = null
   where status <> 'ended'
     and exists (select 1 from jsonb_array_elements(materials) m, jsonb_array_elements(gone) g
                  where m->>'kind' = g->>'kind' and m->>'id' = g->>'id' and m->>'version' = g->>'version');
  delete from bundles where origin = 'author' and publisher_id = p_user;
  delete from scheduler_marks where key like '%:' || p_user || ':%';
  delete from rate_windows where user_id = p_user;
  delete from users where id = p_user;
end $$;

-- Access --------------------------------------------------------------------------------------------

alter table push_subscriptions enable row level security;

do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'cadmium\_%' loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on push_subscriptions from anon, authenticated;
  end if;
end $$;
