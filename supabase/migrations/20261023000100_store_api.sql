-- The store's API: one function per store operation, called through Supabase's REST interface
-- (`rpc`) with the secret key, and directly in tests. Only the service role may call them or read the
-- tables: Supabase exposes the public schema to the anon and authenticated roles, so this migration
-- revokes their access and enables row-level security with no policies.

create function cadmium_put_bundle(
  p_kind text, p_id text, p_version text, p_system text, p_system_versions text,
  p_publisher_id text, p_draft_id text, p_data jsonb, p_origin text, p_listed boolean
) returns void language sql as $$
  insert into bundles (kind, id, version, system, system_versions, publisher_id, draft_id, data, origin, listed)
  values (p_kind, p_id, p_version, p_system, p_system_versions, p_publisher_id, p_draft_id, p_data, p_origin, p_listed);
$$;

create function cadmium_get_bundle(p_kind text, p_id text, p_version text) returns jsonb language sql stable as $$
  select data from bundles where kind = p_kind and id = p_id and version = p_version;
$$;

create function cadmium_set_listed(p_kind text, p_id text, p_version text, p_listed boolean) returns void language sql as $$
  update bundles set listed = p_listed where kind = p_kind and id = p_id and version = p_version;
$$;

create function cadmium_create_instance(
  p_id text, p_campaign_id text, p_name text, p_system text, p_system_version text,
  p_modules jsonb, p_materials jsonb, p_seed bigint
) returns void language sql as $$
  insert into instances (id, campaign_id, name, system, system_version, modules, materials, seed)
  values (p_id, p_campaign_id, p_name, p_system, p_system_version, p_modules, p_materials, p_seed);
$$;

-- The seed is returned as text: it can exceed what a JSON number holds exactly.
create function cadmium_get_instance(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', id, 'campaign_id', campaign_id, 'name', name, 'system', system, 'system_version', system_version,
    'modules', modules, 'materials', materials, 'status', status, 'seed', seed::text,
    'rng_algorithm', rng_algorithm, 'version', version, 'state', state, 'ending', ending)
  from instances where id = p_id and deleted_at is null;
$$;

create function cadmium_set_status(p_id text, p_status text) returns void language sql as $$
  update instances set status = p_status where id = p_id;
$$;

create function cadmium_add_character(p_instance text, p_character text, p_user text) returns void language sql as $$
  insert into instance_characters (instance_id, character_id, user_id) values (p_instance, p_character, p_user);
$$;

-- Events after a version, in seq order, as { seq, version, actor_id, event }.
create function cadmium_events(p_instance text, p_after integer, p_limit integer) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'seq', seq, 'version', version, 'actor_id', actor_id,
           'event', jsonb_build_object('type', type) || payload) order by seq), '[]'::jsonb)
  from (select * from events where instance_id = p_instance and version > p_after order by seq limit p_limit) e;
$$;

-- Every commit with its input and events, in version order: what replay needs.
create function cadmium_commits(p_instance text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'version', c.version, 'input', c.input,
           'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type) || e.payload order by e.seq)
                                 from events e where e.instance_id = c.instance_id and e.version = c.version), '[]'::jsonb))
           order by c.version), '[]'::jsonb)
  from commits c where c.instance_id = p_instance;
$$;

-- Records an input; false when the idempotency key was already used by the user in the instance.
create function cadmium_log_input(
  p_id text, p_instance text, p_user text, p_key text, p_text text, p_parser_context jsonb, p_tool_calls jsonb
) returns boolean language plpgsql as $$
begin
  insert into input_logs (id, instance_id, user_id, idempotency_key, text, parser_context, tool_calls)
  values (p_id, p_instance, p_user, p_key, p_text, p_parser_context, p_tool_calls)
  on conflict (instance_id, user_id, idempotency_key) do nothing;
  return found;
end $$;

create function cadmium_reject_input(p_id text) returns void language sql as $$
  update input_logs set outcome = 'rejected' where id = p_id;
$$;

create function cadmium_input_by_key(p_instance text, p_user text, p_key text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', id, 'outcome', outcome, 'version', version)
  from input_logs where instance_id = p_instance and user_id = p_user and idempotency_key = p_key;
$$;

create function cadmium_put_narration(p_instance text, p_version integer, p_text text, p_source text) returns void language sql as $$
  insert into narrations (instance_id, version, text, source) values (p_instance, p_version, p_text, p_source)
  on conflict (instance_id, version) do nothing;
$$;

-- A cheap call for health checks: proves the schema is applied and the caller may use it.
create function cadmium_health() returns jsonb language sql stable as $$
  select jsonb_build_object('schema', 'ok');
$$;

-- Access: tables readable only by the service role; functions callable only by it. Supabase's roles exist
-- only on Supabase, so the grants are skipped where they are absent (as in the test database).
alter table bundles enable row level security;
alter table instances enable row level security;
alter table instance_characters enable row level security;
alter table events enable row level security;
alter table commits enable row level security;
alter table input_logs enable row level security;
alter table narrations enable row level security;

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
    revoke all on bundles, instances, instance_characters, events, commits, input_logs, narrations from anon, authenticated;
  end if;
end $$;
