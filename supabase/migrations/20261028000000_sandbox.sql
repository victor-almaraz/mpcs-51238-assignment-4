-- Sandbox games (docs/spec/docs/engine.md, Sandbox): the author marks a game a sandbox when creating it,
-- and the instance objects report the mark.

alter table instances add column sandbox boolean not null default false;

drop function cadmium_create_instance(text, text, text, text, text, jsonb, jsonb, bigint);

create function cadmium_create_instance(
  p_id text, p_campaign_id text, p_name text, p_system text, p_system_version text,
  p_modules jsonb, p_materials jsonb, p_seed bigint, p_sandbox boolean default false
) returns void language sql as $$
  insert into instances (id, campaign_id, name, system, system_version, modules, materials, seed, sandbox)
  values (p_id, p_campaign_id, p_name, p_system, p_system_version, p_modules, p_materials, p_seed, p_sandbox);
$$;

-- The seed is returned as text: it can exceed what a JSON number holds exactly.
create or replace function cadmium_get_instance(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', id, 'campaign_id', campaign_id, 'name', name, 'system', system, 'system_version', system_version,
    'modules', modules, 'materials', materials, 'status', status, 'seed', seed::text,
    'rng_algorithm', rng_algorithm, 'version', version, 'state', state, 'ending', ending, 'sandbox', sandbox)
  from instances where id = p_id and deleted_at is null;
$$;

-- The instance object of docs/spec/docs/api.md without `next_session`, which comes from the schedule.
create or replace function cadmium_instance(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', i.id, 'campaign_id', i.campaign_id, 'name', i.name, 'system', i.system,
    'system_version', i.system_version, 'modules', i.modules,
    'materials', (select coalesce(jsonb_agg(m - 'position' order by (m->>'position')::integer), '[]'::jsonb)
                    from jsonb_array_elements(i.materials) m),
    'status', i.status, 'version', i.version,
    'characters', coalesce((select jsonb_agg(jsonb_build_object('id', ch.id, 'user_id', ic.user_id, 'name', ch.name)
                                             order by ic.joined_at, ch.id)
                              from instance_characters ic join characters ch on ch.id = ic.character_id
                             where ic.instance_id = i.id and ic.left_at is null), '[]'::jsonb),
    'created_at', i.created_at, 'started_at', i.started_at, 'ended_at', i.ended_at, 'ending', i.ending,
    'sandbox', i.sandbox)
  from instances i where i.id = p_id and i.deleted_at is null;
$$;

-- Whether a game is a sandbox; /api/health calls it to report this migration.
create function cadmium_sandbox(p_id text) returns boolean language sql stable as $$
  select coalesce((select sandbox from instances where id = p_id), false);
$$;

select cadmium_service_only(array['cadmium_create_instance', 'cadmium_get_instance', 'cadmium_instance', 'cadmium_sandbox']);
