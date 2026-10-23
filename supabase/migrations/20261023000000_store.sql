-- The store (data-model.md, Records: Instance, Instance character, Event, Input log, Narration, Bundle;
-- Atomicity). Commits go through cadmium_commit, which writes every item of a commit in one transaction.
-- SPEC_ISSUES.md#replay-source: `commits` records each commit's input so that replay can re-run it.

create table bundles (
  kind text not null check (kind in ('setting', 'adventure')),
  id text not null,
  version text not null,
  system text not null,
  system_versions text not null,
  publisher_id text,
  draft_id text,
  data jsonb not null,
  origin text not null check (origin in ('operator', 'author')),
  listed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (kind, id, version)
);

-- Bundle data is immutable; only `listed` changes after publication.
create function bundles_immutable() returns trigger language plpgsql as $$
begin
  if new.data is distinct from old.data or new.kind <> old.kind or new.id <> old.id or new.version <> old.version then
    raise exception 'bundle data is immutable' using errcode = 'CD001';
  end if;
  return new;
end $$;
create trigger bundles_immutable before update on bundles for each row execute function bundles_immutable();

create table instances (
  id text primary key,
  campaign_id text not null,
  name text not null check (char_length(name) between 1 and 80),
  system text not null,
  system_version text not null,
  modules jsonb not null default '[]',
  materials jsonb not null,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'paused', 'ended')),
  -- SPEC_ISSUES.md#seed-range: seeds are non-negative and below 2^53.
  seed bigint not null check (seed >= 0 and seed < 9007199254740992),
  rng_algorithm text not null default 'splitmix64_v1',
  version integer not null default 0,
  state jsonb,
  ending text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz,
  unique (campaign_id, name)
);

create table instance_characters (
  instance_id text not null references instances (id) on delete cascade,
  character_id text not null,
  user_id text not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (instance_id, character_id)
);

create table events (
  instance_id text not null references instances (id) on delete cascade,
  seq integer not null check (seq >= 1),
  version integer not null,
  actor_id text,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
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
  unique (instance_id, user_id, idempotency_key)
);

create table narrations (
  instance_id text not null references instances (id) on delete cascade,
  version integer not null,
  text text not null,
  source text not null check (source in ('model', 'template')),
  primary key (instance_id, version)
);

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
