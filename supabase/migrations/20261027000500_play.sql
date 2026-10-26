-- Play: each game's event log, committed inputs, input logs, and narration, and the Instance
-- Coordinator's records (docs/spec/docs/data-model.md, Records: Instance, Event, Commit, Input log,
-- Narration; Atomicity; docs/spec/docs/architecture.md, Concurrency, Round timeouts, Model adapters;
-- docs/spec/docs/api.md, submit_input, get_history, Rate limits). Commits go through cadmium_commit,
-- which writes every item of a commit in one transaction; `commits` records each commit's input so
-- that replay can re-run it.

create table events (
  instance_id text not null references instances (id) on delete cascade,
  seq integer not null check (seq >= 1),
  version integer not null,
  actor_id text,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  -- Whether every member may see the event (docs/spec/docs/app-flow.md, Real-time channels). Events stay
  -- private until the Coordinator marks them, so a failure after the commit hides events rather than
  -- leaking them.
  shared boolean not null default false,
  primary key (instance_id, seq)
);
create index events_by_version on events (instance_id, version);

create table commits (
  instance_id text not null references instances (id) on delete cascade,
  version integer not null check (version >= 1),
  input jsonb not null,
  created_at timestamptz not null default now(),
  primary key (instance_id, version)
);

-- Each typed input, with the parser context and the raw model exchanges (docs/spec/docs/architecture.md,
-- Model adapters).
create table input_logs (
  id text primary key,
  instance_id text not null references instances (id) on delete cascade,
  user_id text not null,
  idempotency_key text not null,
  text text check (char_length(text) <= 500),
  parser_context jsonb,
  tool_calls jsonb not null default '[]',
  outcome text check (outcome in ('committed', 'rejected', 'fallback')),
  version integer,
  created_at timestamptz not null default now(),
  -- The character acting; a character has at most one input in processing (docs/spec/docs/api.md,
  -- submit_input).
  character_id text,
  unique (instance_id, user_id, idempotency_key)
);
create index input_logs_processing on input_logs (instance_id, character_id) where outcome is null;

create table narrations (
  instance_id text not null references instances (id) on delete cascade,
  version integer not null,
  text text not null,
  source text not null check (source in ('model', 'template')),
  primary key (instance_id, version)
);

-- Requests counted per user and scope in fixed windows (docs/spec/docs/api.md, Rate limits).
create table rate_windows (
  user_id text not null,
  scope text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (user_id, scope)
);

-- Instances ---------------------------------------------------------------------------------------

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

-- Changes status outside a commit (pause, resume, end without an ending). Fails with CD409 unless the
-- stored version is p_expected, so it serializes with commits.
create function cadmium_set_instance_status(p_id text, p_expected integer, p_status text, p_deadline timestamptz) returns void
language plpgsql as $$
begin
  update instances
     set status = p_status,
         round_deadline = p_deadline,
         ended_at = case when p_status = 'ended' and ended_at is null then now() else ended_at end
   where id = p_id and version = p_expected and deleted_at is null;
  if not found then
    raise exception 'instance % is not at version %', p_id, p_expected using errcode = 'CD409';
  end if;
end $$;

-- Sets the deadline of the wait that began at version p_version; a later commit has its own.
create function cadmium_set_deadline(p_id text, p_version integer, p_deadline timestamptz) returns void language sql as $$
  update instances set round_deadline = p_deadline where id = p_id and version = p_version;
$$;

create function cadmium_deadline(p_id text) returns timestamptz language sql stable as $$
  select round_deadline from instances where id = p_id;
$$;

-- Commits -----------------------------------------------------------------------------------------

-- One commit, atomically: the events with contiguous seq, the state, the version incremented by 1, the
-- commit's input, and the input log outcome. Fails with CD409 unless the stored version is p_expected.
create function cadmium_commit(
  p_instance text,
  p_expected integer,
  p_state jsonb,
  p_events jsonb,
  p_input jsonb,
  p_input_log text default null,
  p_outcome text default null,
  p_status text default null,
  p_ending text default null
) returns integer language plpgsql as $$
declare
  v integer;
  base integer;
begin
  update instances
     set version = version + 1,
         state = p_state,
         status = coalesce(p_status, status),
         ending = coalesce(p_ending, ending),
         started_at = case when p_status = 'active' and started_at is null then now() else started_at end,
         ended_at = case when p_status = 'ended' and ended_at is null then now() else ended_at end
   where id = p_instance and version = p_expected
   returning version into v;
  if v is null then
    raise exception 'instance % is not at version %', p_instance, p_expected using errcode = 'CD409';
  end if;
  select coalesce(max(seq), 0) into base from events where instance_id = p_instance;
  insert into events (instance_id, seq, version, actor_id, type, payload)
  select p_instance, base + e.n, v, e.value ->> 'actor', e.value ->> 'type', e.value - 'type'
    from jsonb_array_elements(p_events) with ordinality as e(value, n);
  insert into commits (instance_id, version, input) values (p_instance, v, p_input);
  if p_input_log is not null then
    update input_logs set outcome = p_outcome, version = v where id = p_input_log and instance_id = p_instance;
    if not found then
      raise exception 'input log % does not exist', p_input_log using errcode = 'CD404';
    end if;
  end if;
  return v;
end $$;

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

-- Marks the events of one commit that every member may see, by their 1-based position in the commit.
create function cadmium_share_events(p_instance text, p_version integer, p_positions jsonb) returns void language sql as $$
  with ordered as (
    select seq, row_number() over (order by seq) as n from events where instance_id = p_instance and version = p_version
  )
  update events e set shared = true
    from ordered o
   where e.instance_id = p_instance and e.seq = o.seq
     and o.n in (select (jsonb_array_elements_text(p_positions))::bigint);
$$;

-- History: commits after a version, ascending, with each commit's actor, shared events, and narration.
create function cadmium_history(p_instance text, p_after integer, p_limit integer) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'version', c.version,
           'actor_id', c.input #>> '{call,actor}',
           'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type) || e.payload order by e.seq)
                                 from events e where e.instance_id = c.instance_id and e.version = c.version and e.shared), '[]'::jsonb),
           'narration', (select jsonb_build_object('text', n.text, 'source', n.source)
                           from narrations n where n.instance_id = c.instance_id and n.version = c.version))
           order by c.version), '[]'::jsonb)
  from (select * from commits where instance_id = p_instance and version > p_after order by version limit p_limit) c;
$$;

-- Inputs and narration ----------------------------------------------------------------------------

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

create function cadmium_set_input_character(p_id text, p_character text) returns void language sql as $$
  update input_logs set character_id = p_character where id = p_id;
$$;

-- Records what the parser saw and returned: the parser context and the model exchanges.
create function cadmium_record_parse(p_id text, p_parser_context jsonb, p_tool_calls jsonb) returns void language sql as $$
  update input_logs set parser_context = p_parser_context, tool_calls = p_tool_calls where id = p_id;
$$;

create function cadmium_reject_input(p_id text) returns void language sql as $$
  update input_logs set outcome = 'rejected' where id = p_id;
$$;

create function cadmium_input_by_key(p_instance text, p_user text, p_key text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', id, 'outcome', outcome, 'version', version)
  from input_logs where instance_id = p_instance and user_id = p_user and idempotency_key = p_key;
$$;

-- Whether the character has an input still in processing, started within the last p_seconds; older
-- unfinished inputs are treated as abandoned.
create function cadmium_input_processing(p_instance text, p_character text, p_seconds integer) returns boolean
language sql stable as $$
  select exists (select 1 from input_logs
                  where instance_id = p_instance and character_id = p_character and outcome is null
                    and created_at > now() - make_interval(secs => p_seconds));
$$;

create function cadmium_put_narration(p_instance text, p_version integer, p_text text, p_source text) returns void language sql as $$
  insert into narrations (instance_id, version, text, source) values (p_instance, p_version, p_text, p_source)
  on conflict (instance_id, version) do nothing;
$$;

-- Rate limits -------------------------------------------------------------------------------------

-- Counts one request in a fixed window; returns 0 when allowed, or the milliseconds until the window
-- ends when the limit is exceeded.
create function cadmium_rate_hit(p_user text, p_scope text, p_window_seconds integer, p_limit integer) returns integer
language plpgsql as $$
declare
  w rate_windows;
  now_ts timestamptz := clock_timestamp();
begin
  insert into rate_windows (user_id, scope, window_start, hits) values (p_user, p_scope, now_ts, 1)
  on conflict (user_id, scope) do update
    set window_start = case when rate_windows.window_start + make_interval(secs => p_window_seconds) <= now_ts then now_ts else rate_windows.window_start end,
        hits = case when rate_windows.window_start + make_interval(secs => p_window_seconds) <= now_ts then 1 else rate_windows.hits + 1 end
  returning * into w;
  if w.hits <= p_limit then return 0; end if;
  return greatest(1, ceil(extract(epoch from (w.window_start + make_interval(secs => p_window_seconds) - now_ts)) * 1000))::integer;
end $$;

-- Access -------------------------------------------------------------------------------------------

alter table events enable row level security;
alter table commits enable row level security;
alter table input_logs enable row level security;
alter table narrations enable row level security;
alter table rate_windows enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on events, commits, input_logs, narrations, rate_windows from anon, authenticated;
  end if;
end $$;

select cadmium_service_only(array['cadmium_create_instance', 'cadmium_get_instance', 'cadmium_set_status',
  'cadmium_set_instance_status', 'cadmium_set_deadline', 'cadmium_deadline', 'cadmium_commit',
  'cadmium_events', 'cadmium_commits', 'cadmium_share_events', 'cadmium_history', 'cadmium_log_input',
  'cadmium_set_input_character', 'cadmium_record_parse', 'cadmium_reject_input', 'cadmium_input_by_key',
  'cadmium_input_processing', 'cadmium_put_narration', 'cadmium_rate_hit']);
