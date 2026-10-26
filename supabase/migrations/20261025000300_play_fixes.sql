-- Play fixes: every character that has played in an instance, so an ended game and its history still
-- name the party after the characters leave. Access as in the store migration: service role only.

-- The characters that have joined an instance, in joining order, with when each left; characters erased
-- with their account are absent, and their events carry "Former player".
create function cadmium_instance_roster(p_instance text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ch.id, 'user_id', ic.user_id, 'name', ch.name, 'left_at', ic.left_at)
                            order by ic.joined_at, ch.id), '[]'::jsonb)
  from instance_characters ic join characters ch on ch.id = ic.character_id
  where ic.instance_id = p_instance;
$$;

do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('cadmium_instance_roster') loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
