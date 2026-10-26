-- Assets and portraits (docs/spec/docs/data-model.md, Asset, Deletion;
-- docs/spec/docs/decisions/0005-art.md; docs/spec/docs/api.md, Characters: upload_asset, update_character
-- portrait): images stored once by content hash, shared by pack art and player portraits.

create table assets (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('icon', 'portrait', 'tile')),
  mime text not null check (mime in ('image/svg+xml', 'image/png', 'image/webp')),
  bytes integer not null,
  width integer,
  height integer,
  alt text not null check (char_length(alt) between 1 and 200),
  license text not null default 'CC0-1.0',
  credit text,
  provenance text check (provenance is null or char_length(provenance) <= 500),
  uploader_id text references users (id) on delete set null,
  bundle_refs jsonb not null default '[]',
  -- The file's bytes, at most 1 MB (docs/spec/docs/setting-packs.md, Art).
  data bytea not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  held_at timestamptz,
  hold_reason text
);

-- Who uploaded each image: an identical file is stored once, and each uploader may use it.
create table asset_uploads (
  hash text not null references assets (hash) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  primary key (hash, user_id)
);

-- Assets -------------------------------------------------------------------------------------------

-- Stores an asset, or adds a bundle reference to the existing record of the same file.
create function cadmium_put_asset(p_asset jsonb, p_data text, p_bundle_ref jsonb) returns void language sql as $$
  insert into assets (hash, kind, mime, bytes, width, height, alt, license, credit, provenance, uploader_id, bundle_refs, data)
  values (p_asset->>'hash', p_asset->>'kind', p_asset->>'mime', length(decode(p_data, 'base64')),
          (p_asset->>'width')::integer, (p_asset->>'height')::integer, p_asset->>'alt', coalesce(p_asset->>'license', 'CC0-1.0'),
          p_asset->>'credit', p_asset->>'provenance', p_asset->>'uploader_id',
          case when p_bundle_ref is null then '[]'::jsonb else jsonb_build_array(p_bundle_ref) end, decode(p_data, 'base64'))
  on conflict (hash) do update
    set bundle_refs = case when p_bundle_ref is null or assets.bundle_refs @> jsonb_build_array(p_bundle_ref) then assets.bundle_refs
                           else assets.bundle_refs || jsonb_build_array(p_bundle_ref) end;
$$;

-- Adds a bundle reference to an asset that is already stored.
create function cadmium_add_asset_ref(p_hash text, p_bundle_ref jsonb) returns void language sql as $$
  update assets set bundle_refs = bundle_refs || jsonb_build_array(p_bundle_ref)
   where hash = p_hash and not bundle_refs @> jsonb_build_array(p_bundle_ref);
$$;

-- The bytes of an asset that is not removed, base64-encoded, with its type.
create function cadmium_get_asset(p_hash text) returns jsonb language sql stable as $$
  select jsonb_build_object('mime', mime, 'data', encode(data, 'base64')) from assets where hash = p_hash and removed_at is null;
$$;

-- An asset's record without its bytes.
create function cadmium_asset_meta(p_hash text) returns jsonb language sql stable as $$
  select to_jsonb(a.*) - 'data' from assets a where hash = p_hash;
$$;

-- Credits of the assets packs ship, for the attribution page.
create function cadmium_pack_credits() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('hash', hash, 'kind', kind, 'alt', alt, 'license', license, 'credit', credit, 'bundle_refs', bundle_refs) order by created_at), '[]'::jsonb)
  from assets where jsonb_array_length(bundle_refs) > 0 and removed_at is null;
$$;

-- An operator removes an asset after a report: it stops being served; clients fall back.
create function cadmium_remove_asset(p_hash text) returns boolean language plpgsql as $$
begin
  update assets set removed_at = coalesce(removed_at, now()) where hash = p_hash;
  return found;
end $$;

-- Uploads and portraits ----------------------------------------------------------------------------

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

-- Images the user uploaded, with their records and bytes, for the data export.
create function cadmium_user_assets(p_user text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg((to_jsonb(a.*) - 'data') || jsonb_build_object('data', encode(a.data, 'base64')) order by a.created_at), '[]'::jsonb)
  from assets a
  where a.hash in (select hash from asset_uploads where user_id = p_user)
     or a.hash in (select portrait_asset from characters where owner_id = p_user and portrait_asset is not null);
$$;

-- Access -------------------------------------------------------------------------------------------

alter table assets enable row level security;
alter table asset_uploads enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on assets, asset_uploads from anon, authenticated;
  end if;
end $$;

select cadmium_service_only(array['cadmium_put_asset', 'cadmium_add_asset_ref', 'cadmium_get_asset',
  'cadmium_asset_meta', 'cadmium_pack_credits', 'cadmium_remove_asset', 'cadmium_record_upload',
  'cadmium_uploaded_by', 'cadmium_set_portrait', 'cadmium_user_assets']);
