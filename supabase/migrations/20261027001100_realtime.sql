-- Realtime: the one access to the database outside the service role (docs/spec/docs/app-flow.md,
-- Real-time channels). Private channels `instance:{id}`, for members of the instance's campaign, and
-- `user:{id}`, for that user, admit only a user who is active and not suspended; a deleted campaign's
-- channels close with it. The user id is the Clerk user id, the `sub` claim of the Clerk session token
-- that Supabase accepts through its Clerk third-party auth integration.

-- Whether the signed-in user may receive messages on p_topic. PL/pgSQL, so the function is created where
-- `auth` does not exist (tests) and resolved when called. Names are schema-qualified because the search
-- path is empty.
create function realtime_may_receive(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  me text := auth.jwt() ->> 'sub';
begin
  if not public.cadmium_user_active(me) then return false; end if;
  if p_topic like 'user:%' then return substr(p_topic, 6) = me; end if;
  if p_topic like 'instance:%' then
    return exists (select 1 from public.instances i
                     join public.campaigns c on c.id = i.campaign_id and c.deleted_at is null
                     join public.campaign_members m on m.campaign_id = i.campaign_id
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
