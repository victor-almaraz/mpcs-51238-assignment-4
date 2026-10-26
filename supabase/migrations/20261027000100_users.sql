-- Users (docs/spec/docs/data-model.md, Records: User; docs/spec/docs/api.md, Users). Clerk owns
-- identities: `users.id` is the Clerk user id, kept current by the Clerk webhook
-- (docs/spec/docs/app-flow.md, Stack constraints).

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
  -- The accepted terms version, so a changed document asks again (docs/spec/docs/data-model.md, User).
  terms_version text,
  created_at timestamptz not null default now(),
  -- The feed secret is derived from this generation, so its URL can be shown again while only its hash
  -- is stored (docs/spec/docs/api.md, Users, Calendar feed secret).
  calendar_feed_generation integer not null default 0,
  -- A hold for a report of apparently illegal content (docs/spec/docs/data-model.md, Deletion); operators
  -- set it.
  held_at timestamptz,
  hold_reason text,
  -- When an operator suspended the account under the Terms (docs/spec/docs/api.md, Conventions).
  suspended_at timestamptz,
  -- Whether the user was held for themself, as opposed to only through a held character or campaign.
  hold_direct boolean not null default false
);

-- Creates a user from Clerk, or updates the email address of an existing one. The display name comes
-- from Clerk only when the user is created; after that the user sets it in Settings. A deleted user is
-- never revived by a late update.
create function cadmium_upsert_user(p_id text, p_email text, p_display_name text, p_terms_accepted_at timestamptz) returns jsonb
language sql as $$
  insert into users (id, email, display_name, terms_accepted_at)
  values (p_id, p_email, p_display_name, p_terms_accepted_at)
  on conflict (id) do update
    set email = excluded.email,
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

-- Updates the fields a user edits in Settings; null leaves a field unchanged.
create function cadmium_update_me(p_id text, p_display_name text, p_timezone text, p_reminders jsonb) returns jsonb language sql as $$
  update users set display_name = coalesce(p_display_name, display_name), timezone = coalesce(p_timezone, timezone),
                   reminders = coalesce(p_reminders, reminders)
   where id = p_id and status = 'active'
  returning to_jsonb(users.*);
$$;

-- The user's account was deleted at Clerk.
create function cadmium_mark_user_deleted(p_id text) returns void language sql as $$
  update users set status = 'deleted', deletion_requested_at = coalesce(deletion_requested_at, now()) where id = p_id;
$$;

-- Whether the user may receive live messages and calendar entries: active, and not suspended.
create function cadmium_user_active(p_id text) returns boolean language sql stable as $$
  select exists (select 1 from public.users where id = p_id and status = 'active' and suspended_at is null);
$$;

-- Access -------------------------------------------------------------------------------------------

alter table users enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on users from anon, authenticated;
  end if;
end $$;

select cadmium_service_only(array['cadmium_upsert_user', 'cadmium_get_user', 'cadmium_accept_terms',
  'cadmium_update_me', 'cadmium_mark_user_deleted', 'cadmium_user_active']);
