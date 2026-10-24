-- Removes everything the migrations in supabase/migrations create, so they can be applied again from
-- the first. It deletes all Cadmium data: users, characters, campaigns, games, bundles, and assets.
-- Supabase's own schemas (auth, storage, realtime) are untouched except for Cadmium's Realtime policy.
-- Clerk accounts are not affected; users are recreated when they next sign in.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'realtime') then
    execute 'drop policy if exists "members receive instance and user channels" on realtime.messages';
  end if;
end $$;

drop table if exists
  bundles,
  instances,
  instance_characters,
  events,
  commits,
  input_logs,
  narrations,
  users,
  characters,
  campaigns,
  campaign_members,
  campaign_materials,
  invitations,
  rate_windows,
  scheduled_sessions,
  session_exceptions,
  rsvps,
  scheduler_marks,
  push_subscriptions,
  operator_log,
  material_drafts,
  assets,
  asset_uploads,
  cadmium_migrations
  cascade;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'cadmium\_%' or p.proname in ('realtime_may_receive', 'bundles_immutable'))
  loop
    execute format('drop function %s cascade', f);
  end loop;
end $$;
