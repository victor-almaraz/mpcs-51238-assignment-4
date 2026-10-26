-- Operations: the operator log, holds, suspension, content removal, the operator console's bundle
-- views, and the shutdown purge (docs/spec/docs/api.md, Administrative operations;
-- docs/spec/docs/runbooks/content-reports.md; docs/spec/docs/data-model.md, Deletion).

-- What operators did, kept as the record a report requires (docs/spec/docs/runbooks/content-reports.md,
-- Records).
create table operator_log (
  id bigint generated always as identity primary key,
  operator_id text not null,
  action text not null,
  target text not null,
  detail text not null default '',
  at timestamptz not null default now()
);

create function cadmium_log_operation(p_operator text, p_action text, p_target text, p_detail text) returns void language sql as $$
  insert into operator_log (operator_id, action, target, detail) values (p_operator, p_action, p_target, p_detail);
$$;

create function cadmium_operator_log(p_limit integer) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.id desc), '[]'::jsonb)
  from (select * from operator_log order by id desc limit p_limit) l;
$$;

create function cadmium_is_operator(p_id text) returns boolean language sql stable as $$
  select coalesce((select operator from users where id = p_id and status = 'active'), false);
$$;

-- Holds, suspension, and removal ----------------------------------------------------------------------

-- Sets (with a reason) or clears (null) a hold on a user, character, or campaign. Holding a record also
-- holds its owner; a held owner's characters, campaigns, drafts, and uploaded images are kept by every
-- purge. Releasing a record releases its owner when the owner was not held for themself and none of
-- their other records is held; releasing a user leaves their records' holds, and the user stays held
-- while any of them is.
create function cadmium_set_hold(p_kind text, p_id text, p_reason text) returns boolean language plpgsql as $$
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

create function cadmium_set_suspended(p_id text, p_suspended boolean) returns boolean language plpgsql as $$
begin
  update users set suspended_at = case when p_suspended then coalesce(suspended_at, now()) else null end where id = p_id;
  return found;
end $$;

-- Hides a character from every user, deleted or not; it leaves any instance in the lobby. A character in
-- a started instance is taken out by the Coordinator first.
create function cadmium_remove_character(p_id text) returns boolean language plpgsql as $$
begin
  update instance_characters set left_at = now() where character_id = p_id and left_at is null;
  update characters set deleted_at = coalesce(deleted_at, now()), removed_at = coalesce(removed_at, now()),
                        status = case when status = 'in_instance' then 'available' else status end, instance_id = null
   where id = p_id;
  return found;
end $$;

-- Hides a campaign from every user, deleted or not; its games are ended first.
create function cadmium_remove_campaign(p_id text) returns boolean language plpgsql as $$
begin
  update campaigns set deleted_at = coalesce(deleted_at, now()), removed_at = coalesce(removed_at, now()), invite_link_code = null
   where id = p_id;
  return found;
end $$;

-- Bundles -------------------------------------------------------------------------------------------

-- Every bundle version with its listing, for the operator console.
create function cadmium_all_bundles() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'version', version, 'system', system, 'system_versions', system_versions,
                                               'origin', origin, 'listed', listed, 'publisher_id', publisher_id, 'created_at', created_at)
                            order by kind, id, string_to_array(version, '.')::int[] desc), '[]'::jsonb)
  from bundles;
$$;

-- What requires setting p_id: the version range of each draft that is not deleted, and the resolved
-- version of each listed adventure.
create function cadmium_setting_dependents(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'drafts', coalesce((
      select jsonb_agg(r->>'versions')
        from material_drafts d,
             jsonb_array_elements(case when jsonb_typeof(d.document->'adventure'->'requires_settings') = 'array' then d.document->'adventure'->'requires_settings' else '[]'::jsonb end) r
       where d.deleted_at is null and jsonb_typeof(r) = 'object' and r->>'id' = p_id), '[]'::jsonb),
    'adventures', coalesce((
      select jsonb_agg(r->>'resolved')
        from bundles b,
             jsonb_array_elements(case when jsonb_typeof(b.data->'manifest'->'requires_settings') = 'array' then b.data->'manifest'->'requires_settings' else '[]'::jsonb end) r
       where b.kind = 'adventure' and b.listed and jsonb_typeof(r) = 'object' and r->>'id' = p_id), '[]'::jsonb));
$$;

-- Deletes a published bundle version that nothing uses (docs/spec/docs/api.md, Admin: delete_bundle;
-- Materials: delete_material): no campaign's materials and no instance's pinned materials name it. The
-- version is also dropped from its assets' references, so the daily purge erases art no other bundle
-- uses. Returns what uses it: zero campaigns and zero games when it was deleted, or the counts that kept
-- it.
create function cadmium_delete_bundle(p_kind text, p_id text, p_version text) returns jsonb language plpgsql as $$
declare
  ref text := p_kind || ':' || p_id || '@' || p_version;
  in_campaigns integer;
  in_games integer;
begin
  select count(distinct campaign_id) into in_campaigns from campaign_materials
   where kind = p_kind and bundle_id = p_id and bundle_version = p_version;
  select count(*) into in_games from instances i
   where exists (select 1 from jsonb_array_elements(i.materials) m
                  where m->>'kind' = p_kind and m->>'id' = p_id and m->>'version' = p_version);
  if in_campaigns = 0 and in_games = 0 then
    delete from bundles where kind = p_kind and id = p_id and version = p_version;
    update assets set bundle_refs = (select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(bundle_refs) r where r->>'bundle_id' <> ref)
     where bundle_refs @> jsonb_build_array(jsonb_build_object('bundle_id', ref));
  end if;
  return jsonb_build_object('campaigns', in_campaigns, 'games', in_games);
end $$;

-- Shutdown ------------------------------------------------------------------------------------------

-- 90 days after shutdown (docs/spec/docs/data-model.md, Deletion): erases every account and campaign that
-- is not held, and every bundle no held campaign uses. Holding a record holds its owner
-- (cadmium_set_hold), so the owner of a held record is kept, and so are a held user's campaigns.
create function cadmium_shutdown_purge() returns jsonb language plpgsql as $$
declare
  u text;
  c text;
  users_erased integer := 0;
  campaigns_erased integer := 0;
begin
  for u in select id from users where held_at is null loop
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

-- Access --------------------------------------------------------------------------------------------

alter table operator_log enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on operator_log from anon, authenticated;
    revoke all on sequence operator_log_id_seq from anon, authenticated;
  end if;
end $$;

select cadmium_service_only(array['cadmium_log_operation', 'cadmium_operator_log', 'cadmium_is_operator',
  'cadmium_set_hold', 'cadmium_set_suspended', 'cadmium_remove_character', 'cadmium_remove_campaign',
  'cadmium_all_bundles', 'cadmium_setting_dependents', 'cadmium_delete_bundle', 'cadmium_shutdown_purge']);
