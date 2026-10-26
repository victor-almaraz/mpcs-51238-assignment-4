-- Archiving characters and adventure drafts, and an owner's recently deleted characters and drafts
-- (SPEC_ISSUES.md#character-draft-archive). Access as in the store migration: service role only.

alter table characters add column archived boolean not null default false;
alter table material_drafts add column archived boolean not null default false;

-- Archives or unarchives a character that is not deleted; a character in an instance cannot be archived.
create function cadmium_set_character_archived(p_id text, p_archived boolean) returns jsonb language sql as $$
  update characters set archived = p_archived
   where id = p_id and deleted_at is null and (not p_archived or status <> 'in_instance')
  returning to_jsonb(characters.*);
$$;

create function cadmium_set_draft_archived(p_id text, p_archived boolean) returns jsonb language sql as $$
  update material_drafts set archived = p_archived where id = p_id and deleted_at is null
  returning cadmium_draft_json(material_drafts);
$$;

-- An archived character does not join instances.
create or replace function cadmium_join_instance(p_instance text, p_character text, p_user text) returns boolean language plpgsql as $$
begin
  update characters set status = 'in_instance', instance_id = p_instance
   where id = p_character and owner_id = p_user and status = 'available' and deleted_at is null and not archived;
  if not found then return false; end if;
  insert into instance_characters (instance_id, character_id, user_id) values (p_instance, p_character, p_user)
  on conflict (instance_id, character_id) do update set joined_at = now(), left_at = null, user_id = excluded.user_id;
  return true;
end $$;

-- The owner's characters and drafts, newest first, optionally only the archived or the unarchived ones.
drop function cadmium_list_characters(text, text, text, integer, text);
create function cadmium_list_characters(p_owner text, p_system text, p_status text, p_limit integer, p_after text, p_archived boolean default null) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(c.*) order by c.created_at desc, c.id desc), '[]'::jsonb)
  from (
    select * from characters
     where owner_id = p_owner and deleted_at is null
       and (p_system is null or system = p_system)
       and (p_status is null or status = p_status)
       and (p_archived is null or archived = p_archived)
       and (p_after is null or (created_at, id) < (select created_at, id from characters where id = p_after))
     order by created_at desc, id desc
     limit p_limit
  ) c;
$$;

drop function cadmium_list_drafts(text, integer, text);
create function cadmium_list_drafts(p_owner text, p_limit integer, p_after text, p_archived boolean default null) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(cadmium_draft_json(d) - 'document' order by d.updated_at desc, d.id desc), '[]'::jsonb)
  from (
    select * from material_drafts
     where owner_id = p_owner and deleted_at is null
       and (p_archived is null or archived = p_archived)
       and (p_after is null or (updated_at, id) < (select updated_at, id from material_drafts where id = p_after))
     order by updated_at desc, id desc
     limit p_limit
  ) d;
$$;

-- The owner's characters and drafts deleted less than 30 days ago, which restore_character and
-- restore_draft can still bring back, newest first, as summaries.
create function cadmium_deleted_characters(p_owner text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'system', system, 'deleted_at', deleted_at) order by deleted_at desc), '[]'::jsonb)
  from characters
  where owner_id = p_owner and deleted_at is not null and deleted_at > now() - interval '30 days';
$$;

create function cadmium_deleted_drafts(p_owner text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'system', system, 'deleted_at', deleted_at) order by deleted_at desc), '[]'::jsonb)
  from material_drafts
  where owner_id = p_owner and deleted_at is not null and deleted_at > now() - interval '30 days';
$$;

do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('cadmium_set_character_archived', 'cadmium_set_draft_archived', 'cadmium_join_instance', 'cadmium_list_characters', 'cadmium_list_drafts', 'cadmium_deleted_characters', 'cadmium_deleted_drafts') loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
