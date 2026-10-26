-- Operations (api.md, Administrative operations; runbooks/content-reports.md; data-model.md,
-- Deletion: holds and the shutdown purge). Access as in the store migration: service role only.

-- When an operator suspended the account under the Terms (api.md, Conventions).
alter table users add column suspended_at timestamptz;

-- What operators did, kept as the record a report requires (runbooks/content-reports.md, Records).
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

-- Holds -------------------------------------------------------------------------------------------

-- Sets (with a reason) or clears (null) a hold on a user, character, or campaign. Holding a record also
-- holds its owner, and holding a user holds the user's characters and authored campaigns, so no purge
-- erases a held record through its owner.
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
    owner := p_id;
  else
    raise exception 'unknown record kind %', p_kind using errcode = 'CD422';
  end if;
  if owner is null then return false; end if;
  if p_reason is not null then
    update users set held_at = coalesce(held_at, now()), hold_reason = coalesce(hold_reason, p_reason) where id = owner;
    if p_kind = 'user' then
      update characters set held_at = coalesce(held_at, now()), hold_reason = coalesce(hold_reason, p_reason) where owner_id = owner;
      update campaigns set held_at = coalesce(held_at, now()), hold_reason = coalesce(hold_reason, p_reason) where author_id = owner;
    end if;
  elsif p_kind = 'user' then
    update users set held_at = null, hold_reason = null where id = owner;
    update characters set held_at = null, hold_reason = null where owner_id = owner;
    update campaigns set held_at = null, hold_reason = null where author_id = owner;
  end if;
  return true;
end $$;

-- Removal and suspension ------------------------------------------------------------------------------

create function cadmium_set_suspended(p_id text, p_suspended boolean) returns boolean language plpgsql as $$
begin
  update users set suspended_at = case when p_suspended then coalesce(suspended_at, now()) else null end where id = p_id;
  return found;
end $$;

-- Hides a character from every user; it leaves any instance in the lobby. A character in a started
-- instance is taken out by the Coordinator first.
create function cadmium_remove_character(p_id text) returns boolean language plpgsql as $$
begin
  update instance_characters set left_at = now() where character_id = p_id and left_at is null;
  update characters set deleted_at = coalesce(deleted_at, now()), status = case when status = 'in_instance' then 'available' else status end, instance_id = null where id = p_id;
  return found;
end $$;

-- Every bundle version with its listing, for the operator console.
create function cadmium_all_bundles() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'version', version, 'system', system, 'system_versions', system_versions,
                                               'origin', origin, 'listed', listed, 'publisher_id', publisher_id, 'created_at', created_at)
                            order by kind, id, string_to_array(version, '.')::int[] desc), '[]'::jsonb)
  from bundles;
$$;

create function cadmium_is_operator(p_id text) returns boolean language sql stable as $$
  select coalesce((select operator from users where id = p_id and status = 'active'), false);
$$;

-- Shutdown ------------------------------------------------------------------------------------------

-- 90 days after shutdown (data-model.md, Deletion): erases every account and campaign that is not
-- held, and every bundle no held campaign uses.
create function cadmium_shutdown_purge() returns jsonb language plpgsql as $$
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
  for c in select id from campaigns where held_at is null loop
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
    revoke all on operator_log from anon, authenticated;
  end if;
end $$;
