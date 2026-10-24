-- Portrait uploads (api.md, Characters: upload_asset, update_character portrait, delete_character,
-- restore_character; data-model.md, Asset, Deletion). Access as in the store migration: service role only.

-- Who uploaded each image: an identical file is stored once, and each uploader may use it.
create table asset_uploads (
  hash text not null references assets (hash) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  primary key (hash, user_id)
);
alter table asset_uploads enable row level security;

create function cadmium_record_upload(p_hash text, p_user text) returns void language sql as $$
  insert into asset_uploads (hash, user_id) values (p_hash, p_user) on conflict do nothing;
$$;

create function cadmium_uploaded_by(p_hash text, p_user text) returns boolean language sql stable as $$
  select exists (select 1 from asset_uploads where hash = p_hash and user_id = p_user);
$$;

create function cadmium_set_portrait(p_character text, p_hash text) returns jsonb language sql as $$
  update characters set portrait_asset = p_hash where id = p_character and deleted_at is null
  returning to_jsonb(characters.*);
$$;

-- An asset's record without its bytes.
create function cadmium_asset_meta(p_hash text) returns jsonb language sql stable as $$
  select to_jsonb(a.*) - 'data' from assets a where hash = p_hash;
$$;

-- Images the user uploaded, with their records and bytes, for the data export.
create function cadmium_user_assets(p_user text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg((to_jsonb(a.*) - 'data') || jsonb_build_object('data', encode(a.data, 'base64')) order by a.created_at), '[]'::jsonb)
  from assets a
  where a.hash in (select hash from asset_uploads where user_id = p_user)
     or a.hash in (select portrait_asset from characters where owner_id = p_user and portrait_asset is not null);
$$;

create function cadmium_delete_character(p_id text) returns void language sql as $$
  update characters set deleted_at = now() where id = p_id and deleted_at is null and status <> 'in_instance';
$$;

create function cadmium_restore_character(p_id text) returns jsonb language sql as $$
  update characters set deleted_at = null where id = p_id and deleted_at > now() - interval '30 days'
  returning to_jsonb(characters.*);
$$;

create function cadmium_deleted_character(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', id, 'owner_id', owner_id, 'deleted_at', deleted_at) from characters where id = p_id and deleted_at is not null;
$$;

-- The purge's work on characters and images: characters deleted more than 90 days ago (not held),
-- then uploaded images no record refers to (not held). Returns the counts.
create function cadmium_purge_content(p_now timestamptz) returns jsonb language plpgsql as $$
declare
  c integer;
  a integer;
begin
  delete from characters where deleted_at <= p_now - interval '90 days' and held_at is null;
  get diagnostics c = row_count;
  delete from assets
   where jsonb_array_length(bundle_refs) = 0 and held_at is null
     and not exists (select 1 from characters where portrait_asset = assets.hash);
  get diagnostics a = row_count;
  return jsonb_build_object('characters', c, 'assets', a);
end $$;

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
    revoke all on asset_uploads from anon, authenticated;
  end if;
end $$;
