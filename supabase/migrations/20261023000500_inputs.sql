-- Parsed inputs (api.md, submit_input: a character has at most one input in processing; architecture.md,
-- Model adapters: the raw model request and response are recorded in the input log).
-- Access as in the store migration: functions and tables for the service role only.

alter table input_logs add column character_id text;
create index input_logs_processing on input_logs (instance_id, character_id) where outcome is null;

-- Whether the character has an input still in processing, started within the last p_seconds; older
-- unfinished inputs are treated as abandoned.
create function cadmium_input_processing(p_instance text, p_character text, p_seconds integer) returns boolean
language sql stable as $$
  select exists (select 1 from input_logs
                  where instance_id = p_instance and character_id = p_character and outcome is null
                    and created_at > now() - make_interval(secs => p_seconds));
$$;

create function cadmium_set_input_character(p_id text, p_character text) returns void language sql as $$
  update input_logs set character_id = p_character where id = p_id;
$$;

-- Records what the parser saw and returned: the parser context and the model exchanges.
create function cadmium_record_parse(p_id text, p_parser_context jsonb, p_tool_calls jsonb) returns void language sql as $$
  update input_logs set parser_context = p_parser_context, tool_calls = p_tool_calls where id = p_id;
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
