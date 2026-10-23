-- The Instance Coordinator's records (architecture.md, Concurrency, Round timeouts; api.md, get_history,
-- Rate limits; app-flow.md, Real-time channels). Access as in the store migration: functions and
-- tables for the service role only, except the Realtime read policy, which members use.

-- The time at which the Coordinator invokes `advance`, or null when no wait is timed.
alter table instances add column round_deadline timestamptz;

-- Instances ---------------------------------------------------------------------------------------

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

-- Takes characters out of an instance, writing back each sheet and status: `p_sheets` is
-- `[{ id, sheet, status }]`. Characters already out are skipped, so the call can repeat.
create function cadmium_release_characters(p_instance text, p_sheets jsonb) returns void language plpgsql as $$
begin
  update characters ch
     set sheet = s.value->'sheet', status = s.value->>'status', instance_id = null
    from jsonb_array_elements(p_sheets) s
   where ch.id = s.value->>'id' and ch.instance_id = p_instance;
  update instance_characters ic set left_at = now()
    from jsonb_array_elements(p_sheets) s
   where ic.instance_id = p_instance and ic.character_id = s.value->>'id' and ic.left_at is null;
end $$;

-- Whether every member may see an event (app-flow.md, Real-time channels). Events stay private until
-- the Coordinator marks them, so a failure after the commit hides events rather than leaking them.
alter table events add column shared boolean not null default false;

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

-- Campaign deletion (api.md, Campaigns: delete_campaign is recoverable for 30 days; the erasure after
-- 90 days is a scheduled job).
create function cadmium_delete_campaign(p_id text) returns void language sql as $$
  update campaigns set deleted_at = now(), invite_link_code = null
   where id = p_id and deleted_at is null;
$$;

-- Restores a campaign deleted less than 30 days ago; false otherwise.
create function cadmium_restore_campaign(p_id text) returns boolean language plpgsql as $$
begin
  update campaigns set deleted_at = null
   where id = p_id and deleted_at is not null and deleted_at > now() - interval '30 days';
  return found;
end $$;

-- A deleted campaign's author and deletion time, for restore_campaign.
create function cadmium_deleted_campaign(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', id, 'author_id', author_id, 'deleted_at', deleted_at)
  from campaigns where id = p_id and deleted_at is not null;
$$;

-- Rate limits -------------------------------------------------------------------------------------

create table rate_windows (
  user_id text not null,
  scope text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (user_id, scope)
);

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

alter table rate_windows enable row level security;

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
    revoke all on rate_windows from anon, authenticated;
  end if;
end $$;

-- Realtime ----------------------------------------------------------------------------------------

-- Private channels (app-flow.md, Real-time channels): `instance:{id}` for members of the instance's
-- campaign, `user:{id}` for that user. The user id is the Clerk user id, the `sub` claim of the Clerk
-- session token that Supabase accepts through its Clerk third-party auth integration.
-- PL/pgSQL, so the function is created where `auth` does not exist (tests) and resolved when called.
create function realtime_may_receive(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  me text := auth.jwt() ->> 'sub';
begin
  if p_topic like 'user:%' then return substr(p_topic, 6) = me; end if;
  if p_topic like 'instance:%' then
    return exists (select 1 from instances i join campaign_members m on m.campaign_id = i.campaign_id
                    where i.id = substr(p_topic, 10) and m.user_id = me);
  end if;
  return false;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'realtime') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function realtime_may_receive(text) from public, anon;
    grant execute on function realtime_may_receive(text) to authenticated;
    execute 'create policy "members receive instance and user channels" on realtime.messages
               for select to authenticated using (realtime_may_receive((select realtime.topic())))';
  else
    -- Without Supabase (tests), auth.jwt() does not exist; the function is never called.
    revoke execute on function realtime_may_receive(text) from public;
  end if;
end $$;
