-- Accounts: get_me, push subscriptions, the data export, deletion, and the purge
-- (docs/spec/docs/app-flow.md, Settings; docs/spec/docs/api.md, Users, Data export;
-- docs/spec/docs/data-model.md, Push subscription, Deletion).

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

-- Users ---------------------------------------------------------------------------------------------

-- The ids get_me lists, newest first: the user's characters, the campaigns they belong to that are not
-- archived, and the campaigns they author; none of them deleted.
create function cadmium_user_ids(p_user text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'character_ids', coalesce((select jsonb_agg(id order by created_at desc, id desc) from characters
                                where owner_id = p_user and deleted_at is null), '[]'::jsonb),
    'active_campaign_ids', coalesce((select jsonb_agg(c.id order by c.created_at desc, c.id desc)
                                       from campaigns c join campaign_members m on m.campaign_id = c.id and m.user_id = p_user
                                      where c.deleted_at is null and not c.archived), '[]'::jsonb),
    'authored_campaign_ids', coalesce((select jsonb_agg(id order by created_at desc, id desc) from campaigns
                                        where author_id = p_user and deleted_at is null), '[]'::jsonb));
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

-- Every record that refers to the user (docs/spec/docs/api.md, Data export), grouped by export file.
-- Operator and moderation fields (the operator flag, suspension, holds, removal) and secrets are left
-- out.
create function cadmium_export_user(p_user text) returns jsonb language sql stable as $$
  with authored as (select id from campaigns where author_id = p_user),
       instances_authored as (select id from instances where campaign_id in (select id from authored))
  select jsonb_build_object(
    'profile', (select to_jsonb(u.*) - array['calendar_token_hash', 'operator', 'suspended_at', 'held_at', 'hold_reason', 'hold_direct'] from users u where u.id = p_user),
    'push_subscriptions', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'created_at', created_at)) from push_subscriptions where user_id = p_user), '[]'::jsonb),
    'characters', coalesce((select jsonb_agg(to_jsonb(c.*) - array['held_at', 'hold_reason', 'removed_at'] order by c.created_at) from characters c where c.owner_id = p_user), '[]'::jsonb),
    'adventures', coalesce((select jsonb_agg(b.data) from bundles b where b.origin = 'author' and b.publisher_id = p_user), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object(
        'campaign', to_jsonb(c.*) - array['held_at', 'hold_reason', 'removed_at'],
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

-- Accounts and campaigns whose deletion was requested more than 90 days before p_now, not held and, for
-- a campaign, not authored by a held user.
create function cadmium_purge_due(p_now timestamptz) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(id) from users where status in ('closing', 'deleted') and deletion_requested_at <= p_now - interval '90 days' and held_at is null), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(c.id) from campaigns c
                            where c.deleted_at <= p_now - interval '90 days' and c.held_at is null
                              and not exists (select 1 from users u where u.id = c.author_id and u.held_at is not null)), '[]'::jsonb));
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

-- Erases an account and what it owns (docs/spec/docs/data-model.md, Deletion: purging an account). The
-- Clerk user is deleted by the caller through Clerk's API.
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

-- The purge's work on characters, drafts, and images: characters and drafts deleted more than 90 days
-- ago, then uploaded images no record refers to. None is erased while it or its owner (the uploader, for
-- an image) is held. Returns the counts.
create function cadmium_purge_content(p_now timestamptz) returns jsonb language plpgsql as $$
declare
  c integer;
  d integer;
  a integer;
begin
  delete from characters ch
   where ch.deleted_at <= p_now - interval '90 days' and ch.held_at is null
     and not exists (select 1 from users u where u.id = ch.owner_id and u.held_at is not null);
  get diagnostics c = row_count;
  delete from material_drafts md
   where md.deleted_at <= p_now - interval '90 days'
     and not exists (select 1 from users u where u.id = md.owner_id and u.held_at is not null);
  get diagnostics d = row_count;
  delete from assets
   where jsonb_array_length(bundle_refs) = 0 and held_at is null
     and not exists (select 1 from characters where portrait_asset = assets.hash)
     and not exists (select 1 from users u where u.id = assets.uploader_id and u.held_at is not null);
  get diagnostics a = row_count;
  return jsonb_build_object('characters', c, 'drafts', d, 'assets', a);
end $$;

-- Access --------------------------------------------------------------------------------------------

alter table push_subscriptions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on push_subscriptions from anon, authenticated;
  end if;
end $$;

select cadmium_service_only(array['cadmium_user_ids', 'cadmium_request_deletion', 'cadmium_restore_account',
  'cadmium_add_push', 'cadmium_list_push', 'cadmium_remove_push', 'cadmium_push_result',
  'cadmium_export_user', 'cadmium_purge_due', 'cadmium_purge_campaign', 'cadmium_purge_user',
  'cadmium_purge_content']);
