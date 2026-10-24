-- Assets (data-model.md, Asset; decisions/0005-art.md): images stored once by content hash, shared by
-- pack art and player portraits. Access as in the store migration: service role only.

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
  -- SPEC_ISSUES.md#asset-delivery: files live in the database; each is at most 1 MB.
  data bytea not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  held_at timestamptz,
  hold_reason text
);

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

alter table assets enable row level security;

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
    revoke all on assets from anon, authenticated;
  end if;
end $$;
