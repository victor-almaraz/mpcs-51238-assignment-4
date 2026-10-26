-- Unarchiving a campaign, and an author's recently deleted campaigns (api.md, Campaigns).
-- Access as in the store migration: service role only.

create function cadmium_unarchive_campaign(p_id text) returns jsonb language plpgsql as $$
begin
  update campaigns set archived = false where id = p_id and deleted_at is null;
  return cadmium_campaign(p_id);
end $$;

-- The author's campaigns deleted less than 30 days ago, which restore_campaign can still bring back,
-- newest first, as summaries.
create function cadmium_deleted_campaigns(p_author text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'system', system, 'deleted_at', deleted_at) order by deleted_at desc), '[]'::jsonb)
  from campaigns
  where author_id = p_author and deleted_at is not null and deleted_at > now() - interval '30 days';
$$;

do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('cadmium_unarchive_campaign', 'cadmium_deleted_campaigns') loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
