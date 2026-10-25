-- Access hardening (SECURITY_AUDIT.md, S-9 and S-10).
--
-- Supabase grants anon and authenticated every privilege on new tables, sequences, and functions in
-- public, and Postgres grants EXECUTE on new functions to PUBLIC. Every migration revokes those grants
-- for its own objects; revoking the defaults makes a migration that forgets fail closed. The defaults
-- belong to the role that runs this script (postgres in the Supabase SQL Editor), and cover only objects
-- that role creates later.
--
-- Suspension (SPEC_ISSUES.md#account-suspension) leaves a user able to read and export their own data,
-- not to keep receiving live game messages or calendar entries; a soft-deleted campaign's channels close
-- with it.

do $$
begin
  -- EXECUTE for PUBLIC is a built-in default, which only the global form can revoke: functions this
  -- role creates in any schema are then executable by their owner alone until a grant says otherwise.
  alter default privileges revoke execute on functions from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
    alter default privileges in schema public revoke all on functions from anon, authenticated;
    revoke all on sequence operator_log_id_seq from anon, authenticated;
    revoke execute on function bundles_immutable() from anon, authenticated;
  end if;
  revoke execute on function bundles_immutable() from public;
  -- The migration runner's own table (lib/store/migrate.ts), where it exists.
  if to_regclass('public.cadmium_migrations') is not null then
    alter table cadmium_migrations enable row level security;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      revoke all on cadmium_migrations from anon, authenticated;
    end if;
  end if;
end $$;

-- Whether the user may receive live messages and calendar entries: active, and not suspended.
create function cadmium_user_active(p_id text) returns boolean language sql stable as $$
  select exists (select 1 from public.users where id = p_id and status = 'active' and suspended_at is null);
$$;

-- Names are schema-qualified because the search path is empty.
create or replace function realtime_may_receive(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  me text := auth.jwt() ->> 'sub';
begin
  if not public.cadmium_user_active(me) then return false; end if;
  if p_topic like 'user:%' then return substr(p_topic, 6) = me; end if;
  if p_topic like 'instance:%' then
    return exists (select 1 from public.instances i
                     join public.campaigns c on c.id = i.campaign_id and c.deleted_at is null
                     join public.campaign_members m on m.campaign_id = i.campaign_id
                    where i.id = substr(p_topic, 10) and m.user_id = me);
  end if;
  return false;
end $$;

create or replace function cadmium_user_by_feed(p_hash text) returns jsonb language sql stable as $$
  select to_jsonb(u.*) from users u where calendar_token_hash = p_hash and cadmium_user_active(u.id);
$$;

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
end $$;
