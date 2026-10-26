-- Access. Only the service role reaches the store: the server calls these functions through Supabase's
-- REST interface (`rpc`) with the secret key, and tests call them directly. Supabase exposes the public
-- schema to the anon and authenticated roles and grants them every privilege on new tables, sequences,
-- and functions there, and Postgres grants EXECUTE on new functions to PUBLIC. This migration revokes
-- those defaults, so an object created without its own revokes is closed, and defines
-- cadmium_service_only, which each migration calls for its functions. Each migration also enables
-- row-level security, with no policies, on its tables and revokes anon's and authenticated's access to
-- them. Supabase's roles exist only on Supabase, so statements that name them are skipped where the
-- roles are absent (as in the test database). The defaults belong to the role that runs the script
-- (postgres in the Supabase SQL Editor) and cover the objects it creates.

do $$
begin
  -- EXECUTE for PUBLIC is a built-in default, which only the global form can revoke: functions this
  -- role creates in any schema are then executable by their owner alone until a grant says otherwise.
  alter default privileges revoke execute on functions from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
    alter default privileges in schema public revoke all on functions from anon, authenticated;
  end if;
end $$;

-- Makes the named functions callable by the service role only: revokes Postgres's grant to PUBLIC and
-- Supabase's to anon and authenticated, where those roles exist. Each migration calls it for its own
-- functions.
create function cadmium_service_only(p_names text[]) returns void language plpgsql as $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any(p_names) loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

-- A cheap call for health checks: proves the schema is applied and the caller may use it.
create function cadmium_health() returns jsonb language sql stable as $$
  select jsonb_build_object('schema', 'ok');
$$;

select cadmium_service_only(array['cadmium_service_only', 'cadmium_health']);
