-- Adventure drafts (data-model.md, Material draft; api.md, Adventure drafts). Access as in the store
-- migration: service role only.

create table material_drafts (
  id text primary key,
  owner_id text not null references users (id) on delete cascade,
  kind text not null default 'adventure' check (kind = 'adventure'),
  material_id text not null check (material_id ~ '^[a-z][a-z0-9_]{0,63}$'),
  system text not null,
  title text not null check (char_length(title) between 1 and 80),
  document jsonb not null,
  revision integer not null default 1,
  diagnostics jsonb not null default '[]',
  last_published_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- The adventure id is unique per owner among drafts that are not deleted.
create unique index material_drafts_owner_material on material_drafts (owner_id, material_id) where deleted_at is null;

create function cadmium_draft_json(d material_drafts) returns jsonb language sql stable as $$
  select to_jsonb(d.*) - 'deleted_at';
$$;

create function cadmium_create_draft(p_id text, p_owner text, p_material_id text, p_system text, p_title text, p_document jsonb) returns jsonb
language sql as $$
  insert into material_drafts (id, owner_id, material_id, system, title, document)
  values (p_id, p_owner, p_material_id, p_system, p_title, p_document)
  returning cadmium_draft_json(material_drafts);
$$;

create function cadmium_get_draft(p_id text) returns jsonb language sql stable as $$
  select cadmium_draft_json(d) from material_drafts d where id = p_id and deleted_at is null;
$$;

-- Drafts of an owner, most recently saved first, as summaries without the document.
create function cadmium_list_drafts(p_owner text, p_limit integer, p_after text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(cadmium_draft_json(d) - 'document' order by d.updated_at desc, d.id desc), '[]'::jsonb)
  from (
    select * from material_drafts
     where owner_id = p_owner and deleted_at is null
       and (p_after is null or (updated_at, id) < (select updated_at, id from material_drafts where id = p_after))
     order by updated_at desc, id desc
     limit p_limit
  ) d;
$$;

-- Saves when the stored revision is p_revision; returns the new revision, or null when it is stale.
create function cadmium_save_draft(p_id text, p_revision integer, p_document jsonb, p_title text, p_diagnostics jsonb) returns jsonb
language sql as $$
  update material_drafts
     set document = p_document, title = p_title, diagnostics = p_diagnostics, revision = revision + 1, updated_at = now()
   where id = p_id and revision = p_revision and deleted_at is null
  returning jsonb_build_object('revision', revision, 'saved_at', updated_at);
$$;

create function cadmium_set_draft_diagnostics(p_id text, p_diagnostics jsonb) returns void language sql as $$
  update material_drafts set diagnostics = p_diagnostics where id = p_id;
$$;

create function cadmium_set_draft_published(p_id text, p_version text) returns void language sql as $$
  update material_drafts set last_published_version = p_version where id = p_id;
$$;

create function cadmium_delete_draft(p_id text) returns void language sql as $$
  update material_drafts set deleted_at = now() where id = p_id and deleted_at is null;
$$;

create function cadmium_restore_draft(p_id text) returns jsonb language sql as $$
  update material_drafts set deleted_at = null
   where id = p_id and deleted_at > now() - interval '30 days'
  returning cadmium_draft_json(material_drafts);
$$;

create function cadmium_deleted_draft(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', id, 'owner_id', owner_id, 'deleted_at', deleted_at) from material_drafts where id = p_id and deleted_at is not null;
$$;

-- Published versions of an adventure id with their publisher, for the version and ownership checks.
create function cadmium_adventure_versions(p_id text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('version', version, 'publisher_id', publisher_id, 'origin', origin)), '[]'::jsonb)
  from bundles where kind = 'adventure' and id = p_id;
$$;

-- Drafts deleted more than 90 days ago are erased with the daily purge.
create function cadmium_purge_drafts(p_now timestamptz) returns integer language plpgsql as $$
declare
  n integer;
begin
  delete from material_drafts where deleted_at <= p_now - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- The owner's drafts for the data export.
create function cadmium_user_drafts(p_owner text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(cadmium_draft_json(d) order by d.created_at), '[]'::jsonb) from material_drafts d where owner_id = p_owner;
$$;

alter table material_drafts enable row level security;

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
    revoke all on material_drafts from anon, authenticated;
  end if;
end $$;
