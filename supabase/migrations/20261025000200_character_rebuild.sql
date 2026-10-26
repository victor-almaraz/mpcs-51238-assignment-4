-- Rebuilding a character's role and abilities before its first game (api.md, rebuild_character).
-- Access as in the store migration: service role only.

-- Makes the named functions callable by the service role only: revokes Postgres's grant to PUBLIC and
-- Supabase's to anon and authenticated, where those roles exist. Each later migration calls it for its
-- own functions.
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

-- Whether the character has ever joined an instance.
create function cadmium_character_played(p_id text) returns boolean language sql stable as $$
  select exists (select 1 from instance_characters where character_id = p_id);
$$;

-- Writes a rebuilt sheet and name while the character is available and has never joined an instance;
-- null otherwise.
create function cadmium_rebuild_character(p_id text, p_name text, p_sheet jsonb) returns jsonb language sql as $$
  update characters set name = p_name, sheet = p_sheet
   where id = p_id and deleted_at is null and status = 'available'
     and not exists (select 1 from instance_characters where character_id = p_id)
  returning to_jsonb(characters.*);
$$;

select cadmium_service_only(array['cadmium_service_only', 'cadmium_character_played', 'cadmium_rebuild_character']);
