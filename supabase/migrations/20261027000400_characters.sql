-- Characters, and the characters that play in each game (docs/spec/docs/data-model.md, Records:
-- Character, Instance character; docs/spec/docs/api.md, Characters).

create table characters (
  id text primary key,
  owner_id text not null references users (id) on delete cascade,
  system text not null,
  system_version text not null,
  name text not null check (char_length(name) between 1 and 40),
  sheet jsonb not null,
  portrait_asset text,
  status text not null default 'available' check (status in ('available', 'in_instance', 'dead', 'retired')),
  instance_id text references instances (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- A hold for a report of apparently illegal content (docs/spec/docs/data-model.md, Deletion); operators
  -- set it.
  held_at timestamptz,
  hold_reason text,
  archived boolean not null default false,
  -- When an operator removed the character (docs/spec/docs/runbooks/content-reports.md). A removed
  -- character is deleted for good: its owner neither lists nor restores it, and the purge erases it as
  -- any deleted character.
  removed_at timestamptz,
  check ((status = 'in_instance') = (instance_id is not null))
);
create index characters_by_owner on characters (owner_id, created_at);

create table instance_characters (
  instance_id text not null references instances (id) on delete cascade,
  character_id text not null references characters (id),
  user_id text not null references users (id),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (instance_id, character_id)
);

-- Characters --------------------------------------------------------------------------------------

create function cadmium_create_character(
  p_id text, p_owner text, p_system text, p_system_version text, p_name text, p_sheet jsonb
) returns jsonb language sql as $$
  insert into characters (id, owner_id, system, system_version, name, sheet)
  values (p_id, p_owner, p_system, p_system_version, p_name, p_sheet)
  returning to_jsonb(characters.*);
$$;

create function cadmium_get_character(p_id text) returns jsonb language sql stable as $$
  select to_jsonb(c.*) from characters c where id = p_id and deleted_at is null;
$$;

-- The owner's characters, newest first, optionally filtered by system, status, and whether archived;
-- `p_after` is the id of the last row of the previous page.
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

-- Writes name and sheet together, so the sheet's own name stays equal to the record's.
create function cadmium_update_character(p_id text, p_name text, p_sheet jsonb) returns jsonb language sql as $$
  update characters set name = p_name, sheet = p_sheet where id = p_id and deleted_at is null
  returning to_jsonb(characters.*);
$$;

create function cadmium_set_character_status(p_id text, p_status text) returns jsonb language sql as $$
  update characters set status = p_status where id = p_id and deleted_at is null
  returning to_jsonb(characters.*);
$$;

-- Archives or unarchives a character that is not deleted; a character in an instance cannot be archived.
create function cadmium_set_character_archived(p_id text, p_archived boolean) returns jsonb language sql as $$
  update characters set archived = p_archived
   where id = p_id and deleted_at is null and (not p_archived or status <> 'in_instance')
  returning to_jsonb(characters.*);
$$;

-- Whether the character has ever joined an instance.
create function cadmium_character_played(p_id text) returns boolean language sql stable as $$
  select exists (select 1 from instance_characters where character_id = p_id);
$$;

-- Writes a rebuilt sheet and name while the character is available and has never joined an instance;
-- null otherwise.
create function cadmium_rebuild_character(p_id text, p_name text, p_sheet jsonb) returns jsonb language sql as $$
  update characters set name = p_name, sheet = p_sheet
   where id = p_id and deleted_at is null and status = 'available'
     and not exists (select 1 from instance_characters where character_id = p_id)
  returning to_jsonb(characters.*);
$$;

create function cadmium_delete_character(p_id text) returns void language sql as $$
  update characters set deleted_at = now() where id = p_id and deleted_at is null and status <> 'in_instance';
$$;

-- Restores a character deleted less than 30 days ago and not removed; null otherwise.
create function cadmium_restore_character(p_id text) returns jsonb language sql as $$
  update characters set deleted_at = null where id = p_id and deleted_at > now() - interval '30 days' and removed_at is null
  returning to_jsonb(characters.*);
$$;

-- A deleted character's owner and deletion time, for restore_character; none once removed.
create function cadmium_deleted_character(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', id, 'owner_id', owner_id, 'deleted_at', deleted_at) from characters
   where id = p_id and deleted_at is not null and removed_at is null;
$$;

-- The owner's characters deleted less than 30 days ago and not removed, which restore_character can
-- still bring back, newest first, as summaries.
create function cadmium_deleted_characters(p_owner text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'system', system, 'deleted_at', deleted_at) order by deleted_at desc), '[]'::jsonb)
  from characters
  where owner_id = p_owner and deleted_at is not null and deleted_at > now() - interval '30 days' and removed_at is null;
$$;

-- Characters in games -----------------------------------------------------------------------------

-- The instance object of docs/spec/docs/api.md without `next_session`, which comes from the schedule.
create function cadmium_instance(p_id text) returns jsonb language sql stable as $$
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
    'created_at', i.created_at, 'started_at', i.started_at, 'ended_at', i.ended_at, 'ending', i.ending)
  from instances i where i.id = p_id and i.deleted_at is null;
$$;

create function cadmium_list_instances(p_campaign text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(cadmium_instance(id) order by created_at, id), '[]'::jsonb)
  from instances where campaign_id = p_campaign and deleted_at is null;
$$;

create function cadmium_add_character(p_instance text, p_character text, p_user text) returns void language sql as $$
  insert into instance_characters (instance_id, character_id, user_id) values (p_instance, p_character, p_user);
$$;

-- Puts an available character into an instance; false when the character is no longer available. An
-- archived character does not join instances.
create function cadmium_join_instance(p_instance text, p_character text, p_user text) returns boolean language plpgsql as $$
begin
  update characters set status = 'in_instance', instance_id = p_instance
   where id = p_character and owner_id = p_user and status = 'available' and deleted_at is null and not archived;
  if not found then return false; end if;
  insert into instance_characters (instance_id, character_id, user_id) values (p_instance, p_character, p_user)
  on conflict (instance_id, character_id) do update set joined_at = now(), left_at = null, user_id = excluded.user_id;
  return true;
end $$;

-- Takes a character out of an instance, writing back its sheet when one is given.
create function cadmium_leave_instance(p_instance text, p_character text, p_sheet jsonb) returns boolean language plpgsql as $$
begin
  update instance_characters set left_at = now() where instance_id = p_instance and character_id = p_character and left_at is null;
  if not found then return false; end if;
  update characters set status = 'available', instance_id = null, sheet = coalesce(p_sheet, sheet)
   where id = p_character and instance_id = p_instance;
  return true;
end $$;

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

-- The characters that have joined an instance, in joining order, with when each left; characters erased
-- with their account are absent, and their events carry "Former player".
create function cadmium_instance_roster(p_instance text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ch.id, 'user_id', ic.user_id, 'name', ch.name, 'left_at', ic.left_at)
                            order by ic.joined_at, ch.id), '[]'::jsonb)
  from instance_characters ic join characters ch on ch.id = ic.character_id
  where ic.instance_id = p_instance;
$$;

-- Access -------------------------------------------------------------------------------------------

alter table characters enable row level security;
alter table instance_characters enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on characters, instance_characters from anon, authenticated;
  end if;
end $$;

select cadmium_service_only(array['cadmium_create_character', 'cadmium_get_character',
  'cadmium_list_characters', 'cadmium_update_character', 'cadmium_set_character_status',
  'cadmium_set_character_archived', 'cadmium_character_played', 'cadmium_rebuild_character',
  'cadmium_delete_character', 'cadmium_restore_character', 'cadmium_deleted_character',
  'cadmium_deleted_characters', 'cadmium_instance', 'cadmium_list_instances', 'cadmium_add_character',
  'cadmium_join_instance', 'cadmium_leave_instance', 'cadmium_release_characters', 'cadmium_instance_roster']);
