-- Schedules (data-model.md, Scheduled session, Session exception, RSVP; api.md, Scheduling;
-- app-flow.md, Scheduled jobs). Occurrences are computed in lib/scheduler, not stored.
-- Access as in the store migration: functions and tables for the service role only.

create table scheduled_sessions (
  id text primary key,
  instance_id text not null references instances (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 80),
  starts_at timestamptz not null,
  timezone text not null,
  duration_minutes integer not null check (duration_minutes between 15 and 720),
  recurrence jsonb,
  auto_resume boolean not null default true,
  auto_pause boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 500),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  -- SPEC_ISSUES.md#session-cancellation: when the series was cancelled; later occurrences are cancelled.
  cancelled_at timestamptz,
  created_by text not null references users (id),
  created_at timestamptz not null default now()
);
create index scheduled_sessions_by_instance on scheduled_sessions (instance_id);

create table session_exceptions (
  session_id text not null references scheduled_sessions (id) on delete cascade,
  occurrence_start timestamptz not null,
  status text not null check (status in ('cancelled', 'moved')),
  moved_to timestamptz,
  primary key (session_id, occurrence_start),
  check ((status = 'moved') = (moved_to is not null))
);

create table rsvps (
  session_id text not null references scheduled_sessions (id) on delete cascade,
  occurrence_start timestamptz not null,
  user_id text not null references users (id) on delete cascade,
  response text not null check (response in ('yes', 'no', 'maybe')),
  updated_at timestamptz not null default now(),
  primary key (session_id, occurrence_start, user_id)
);

-- Scheduler work done, keyed per occurrence and moment (and member and lead time for reminders), so
-- a repeated or concurrent run does nothing twice.
create table scheduler_marks (
  key text primary key,
  done_at timestamptz not null default now()
);

-- SPEC_ISSUES.md#calendar-feed-url: the feed secret is derived from this generation, so its URL can be
-- shown again while only its hash is stored.
alter table users add column calendar_feed_generation integer not null default 0;

-- Set by auto_pause at an occurrence's end while a round is under way: the Coordinator pauses after
-- the round closes.
alter table instances add column pause_requested boolean not null default false;

-- Sessions -----------------------------------------------------------------------------------------

create function cadmium_session_json(s scheduled_sessions) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', s.id, 'instance_id', s.instance_id, 'title', s.title, 'starts_at', s.starts_at, 'timezone', s.timezone,
    'duration_minutes', s.duration_minutes, 'recurrence', s.recurrence, 'auto_resume', s.auto_resume,
    'auto_pause', s.auto_pause, 'notes', s.notes, 'status', s.status, 'cancelled_at', s.cancelled_at,
    'created_by', s.created_by, 'created_at', s.created_at);
$$;

-- Creates or replaces a session from its full record.
create function cadmium_put_session(p_session jsonb) returns jsonb language sql as $$
  insert into scheduled_sessions (id, instance_id, title, starts_at, timezone, duration_minutes, recurrence,
                                  auto_resume, auto_pause, notes, status, cancelled_at, created_by)
  values (p_session->>'id', p_session->>'instance_id', p_session->>'title', (p_session->>'starts_at')::timestamptz,
          p_session->>'timezone', (p_session->>'duration_minutes')::integer, nullif(p_session->'recurrence', 'null'::jsonb),
          (p_session->>'auto_resume')::boolean, (p_session->>'auto_pause')::boolean, p_session->>'notes',
          p_session->>'status', (p_session->>'cancelled_at')::timestamptz, p_session->>'created_by')
  on conflict (id) do update set
    title = excluded.title, starts_at = excluded.starts_at, timezone = excluded.timezone,
    duration_minutes = excluded.duration_minutes, recurrence = excluded.recurrence,
    auto_resume = excluded.auto_resume, auto_pause = excluded.auto_pause, notes = excluded.notes,
    status = excluded.status, cancelled_at = excluded.cancelled_at
  returning cadmium_session_json(scheduled_sessions);
$$;

create function cadmium_get_session(p_id text) returns jsonb language sql stable as $$
  select cadmium_session_json(s) from scheduled_sessions s where id = p_id;
$$;

create function cadmium_set_exception(p_session text, p_occurrence_start timestamptz, p_status text, p_moved_to timestamptz) returns void
language sql as $$
  insert into session_exceptions (session_id, occurrence_start, status, moved_to)
  values (p_session, p_occurrence_start, p_status, p_moved_to)
  on conflict (session_id, occurrence_start) do update set status = excluded.status, moved_to = excluded.moved_to;
$$;

create function cadmium_rsvp(p_session text, p_occurrence_start timestamptz, p_user text, p_response text) returns void language sql as $$
  insert into rsvps (session_id, occurrence_start, user_id, response) values (p_session, p_occurrence_start, p_user, p_response)
  on conflict (session_id, occurrence_start, user_id) do update set response = excluded.response, updated_at = now();
$$;

-- Sessions of the given instances with their exceptions and RSVPs; all instances when p_instances is null.
create function cadmium_schedules(p_instances jsonb) returns jsonb language sql stable as $$
  with s as (
    select * from scheduled_sessions
     where p_instances is null or instance_id in (select jsonb_array_elements_text(p_instances))
  )
  select jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(cadmium_session_json(s) order by s.starts_at, s.id) from s), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(jsonb_build_object('session_id', x.session_id, 'occurrence_start', x.occurrence_start,
                                                               'status', x.status, 'moved_to', x.moved_to))
                              from session_exceptions x where x.session_id in (select id from s)), '[]'::jsonb),
    'rsvps', coalesce((select jsonb_agg(jsonb_build_object('session_id', r.session_id, 'occurrence_start', r.occurrence_start,
                                                          'user_id', r.user_id, 'response', r.response))
                         from rsvps r where r.session_id in (select id from s)), '[]'::jsonb));
$$;

-- Instances of the campaigns a user belongs to, for the dashboard and the calendar feed.
create function cadmium_user_instances(p_user text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'status', i.status, 'campaign_id', c.id,
                                               'campaign_title', c.title) order by i.created_at, i.id), '[]'::jsonb)
  from instances i join campaigns c on c.id = i.campaign_id and c.deleted_at is null
  join campaign_members m on m.campaign_id = c.id and m.user_id = p_user
  where i.deleted_at is null;
$$;

-- Scheduler ----------------------------------------------------------------------------------------

-- Records a unit of scheduler work; false when it was already done.
create function cadmium_schedule_mark(p_key text) returns boolean language plpgsql as $$
begin
  insert into scheduler_marks (key) values (p_key) on conflict do nothing;
  return found;
end $$;

-- What a scheduler run needs: sessions of instances that have not ended, those instances, and the
-- members of their campaigns with their reminder settings.
create function cadmium_scheduler_snapshot() returns jsonb language sql stable as $$
  with i as (
    select id, status, campaign_id from instances where status <> 'ended' and deleted_at is null
  )
  select cadmium_schedules((select coalesce(jsonb_agg(id), '[]'::jsonb) from i))
         || jsonb_build_object(
              'instances', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'campaign_id', campaign_id)) from i), '[]'::jsonb),
              'members', coalesce((select jsonb_agg(jsonb_build_object('campaign_id', m.campaign_id, 'user_id', m.user_id, 'reminders', u.reminders))
                                     from campaign_members m join users u on u.id = m.user_id and u.status = 'active'
                                    where m.campaign_id in (select campaign_id from i)), '[]'::jsonb));
$$;

create function cadmium_expired_deadlines(p_now timestamptz) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(id), '[]'::jsonb) from instances
   where status = 'active' and round_deadline is not null and round_deadline <= p_now and deleted_at is null;
$$;

create function cadmium_expire_invitations() returns integer language plpgsql as $$
declare
  n integer;
begin
  update invitations set status = 'expired' where status = 'pending' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

create function cadmium_set_pause_requested(p_id text, p_requested boolean) returns void language sql as $$
  update instances set pause_requested = p_requested where id = p_id;
$$;

create function cadmium_pause_requested(p_id text) returns boolean language sql stable as $$
  select coalesce((select pause_requested from instances where id = p_id), false);
$$;

-- Calendar feeds -----------------------------------------------------------------------------------

-- Enables (with the secret's hash) or disables (null) a user's feed; returns the new generation.
create function cadmium_set_calendar_feed(p_user text, p_hash text) returns integer language sql as $$
  update users set calendar_token_hash = p_hash,
                   calendar_feed_generation = calendar_feed_generation + case when p_hash is null then 0 else 1 end
   where id = p_user
  returning calendar_feed_generation;
$$;

create function cadmium_user_by_feed(p_hash text) returns jsonb language sql stable as $$
  select to_jsonb(u.*) from users u where calendar_token_hash = p_hash and status = 'active';
$$;

-- Access -------------------------------------------------------------------------------------------

alter table scheduled_sessions enable row level security;
alter table session_exceptions enable row level security;
alter table rsvps enable row level security;
alter table scheduler_marks enable row level security;

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
    revoke all on scheduled_sessions, session_exceptions, rsvps, scheduler_marks from anon, authenticated;
  end if;
end $$;
