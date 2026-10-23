-- Users and characters (data-model.md, Records: User, Character). Clerk owns identities: `users.id` is
-- the Clerk user id, kept current by the Clerk webhook (app-flow.md, Stack constraints).
-- Access as in the store migration: functions and tables for the service role only.

create table users (
  id text primary key,
  email text not null unique,
  -- Clerk holds the credential; this records the external identity.
  credential text not null default 'clerk',
  display_name text not null check (char_length(display_name) between 1 and 40),
  timezone text not null default 'UTC',
  reminders jsonb not null default '{"push": true, "lead_minutes": [1440, 15]}',
  calendar_token_hash text,
  operator boolean not null default false,
  status text not null default 'active' check (status in ('active', 'closing', 'deleted')),
  deletion_requested_at timestamptz,
  terms_accepted_at timestamptz,
  -- SPEC_ISSUES.md#terms-version: the accepted version, so a changed document asks again.
  terms_version text,
  created_at timestamptz not null default now()
);

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
  check ((status = 'in_instance') = (instance_id is not null))
);
create index characters_by_owner on characters (owner_id, created_at);

-- Users -------------------------------------------------------------------------------------------

-- Creates or updates a user from Clerk. A deleted user is never revived by a late update.
create function cadmium_upsert_user(p_id text, p_email text, p_display_name text, p_terms_accepted_at timestamptz) returns jsonb
language sql as $$
  insert into users (id, email, display_name, terms_accepted_at)
  values (p_id, p_email, p_display_name, p_terms_accepted_at)
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        terms_accepted_at = coalesce(users.terms_accepted_at, excluded.terms_accepted_at)
    where users.status <> 'deleted'
  returning to_jsonb(users.*);
$$;

create function cadmium_get_user(p_id text) returns jsonb language sql stable as $$
  select to_jsonb(u.*) from users u where id = p_id;
$$;

create function cadmium_accept_terms(p_id text, p_version text) returns jsonb language sql as $$
  update users set terms_accepted_at = now(), terms_version = p_version where id = p_id and status = 'active'
  returning to_jsonb(users.*);
$$;

-- The user's account is closed at Clerk; deletion stages come with Settings (sprint 19).
create function cadmium_mark_user_deleted(p_id text) returns void language sql as $$
  update users set status = 'deleted', deletion_requested_at = coalesce(deletion_requested_at, now()) where id = p_id;
$$;

-- Characters ---------------------------------------------------------------------------------------

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

-- The owner's characters, newest first, optionally filtered; `p_after` is the id of the last row of
-- the previous page.
create function cadmium_list_characters(p_owner text, p_system text, p_status text, p_limit integer, p_after text) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(c.*) order by c.created_at desc, c.id desc), '[]'::jsonb)
  from (
    select * from characters
     where owner_id = p_owner and deleted_at is null
       and (p_system is null or system = p_system)
       and (p_status is null or status = p_status)
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

-- Listed operator bundles of a kind for one or more systems, latest version of each id.
create function cadmium_listed_bundles(p_kind text, p_systems jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(data order by id), '[]'::jsonb)
  from (
    select distinct on (id) id, data
      from bundles
     where kind = p_kind and listed and origin = 'operator'
       and system in (select jsonb_array_elements_text(p_systems))
     order by id, string_to_array(version, '.')::int[] desc
  ) b;
$$;

-- Access -------------------------------------------------------------------------------------------

alter table users enable row level security;
alter table characters enable row level security;

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
    revoke all on users, characters from anon, authenticated;
  end if;
end $$;
