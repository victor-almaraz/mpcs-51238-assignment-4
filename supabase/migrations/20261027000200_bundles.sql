-- Published settings and adventures (docs/spec/docs/data-model.md, Records: Bundle;
-- docs/spec/docs/api.md, Materials). A bundle version is stored once and never changes; only its listing
-- does.

create table bundles (
  kind text not null check (kind in ('setting', 'adventure')),
  id text not null,
  version text not null,
  system text not null,
  system_versions text not null,
  publisher_id text,
  draft_id text,
  data jsonb not null,
  origin text not null check (origin in ('operator', 'author')),
  listed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (kind, id, version)
);

-- Bundle data is immutable; only `listed` changes after publication.
create function bundles_immutable() returns trigger language plpgsql as $$
begin
  if new.data is distinct from old.data or new.kind <> old.kind or new.id <> old.id or new.version <> old.version then
    raise exception 'bundle data is immutable' using errcode = 'CD001';
  end if;
  return new;
end $$;
create trigger bundles_immutable before update on bundles for each row execute function bundles_immutable();

create function cadmium_put_bundle(
  p_kind text, p_id text, p_version text, p_system text, p_system_versions text,
  p_publisher_id text, p_draft_id text, p_data jsonb, p_origin text, p_listed boolean
) returns void language sql as $$
  insert into bundles (kind, id, version, system, system_versions, publisher_id, draft_id, data, origin, listed)
  values (p_kind, p_id, p_version, p_system, p_system_versions, p_publisher_id, p_draft_id, p_data, p_origin, p_listed);
$$;

create function cadmium_get_bundle(p_kind text, p_id text, p_version text) returns jsonb language sql stable as $$
  select data from bundles where kind = p_kind and id = p_id and version = p_version;
$$;

create function cadmium_set_listed(p_kind text, p_id text, p_version text, p_listed boolean) returns void language sql as $$
  update bundles set listed = p_listed where kind = p_kind and id = p_id and version = p_version;
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

-- A bundle with what decides who may use it.
create function cadmium_material(p_kind text, p_id text, p_version text) returns jsonb language sql stable as $$
  select jsonb_build_object('kind', kind, 'id', id, 'version', version, 'system', system, 'system_versions', system_versions,
                            'origin', origin, 'listed', listed, 'publisher_id', publisher_id, 'manifest', data->'manifest')
  from bundles where kind = p_kind and id = p_id and version = p_version;
$$;

-- The latest version of each material a user may choose for the given declared systems: listed
-- operator bundles and the user's own published adventures, or only the latter with `p_own`.
create function cadmium_list_materials(p_user text, p_systems jsonb, p_kind text, p_own boolean) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(m order by m->>'kind' desc, m->>'id'), '[]'::jsonb)
  from (
    select distinct on (kind, id)
           jsonb_build_object('kind', kind, 'id', id, 'version', version, 'system', system, 'system_versions', system_versions,
                              'origin', origin, 'listed', listed, 'publisher_id', publisher_id, 'manifest', data->'manifest') m
      from bundles
     where system in (select jsonb_array_elements_text(p_systems))
       and (p_kind is null or kind = p_kind)
       and ((origin = 'author' and publisher_id = p_user) or (not p_own and origin = 'operator' and listed))
     order by kind, id, string_to_array(version, '.')::int[] desc
  ) t;
$$;

-- Access -------------------------------------------------------------------------------------------

alter table bundles enable row level security;

-- bundles_immutable runs only as a trigger, so no role calls it.
do $$
begin
  revoke execute on function bundles_immutable() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function bundles_immutable() from anon, authenticated;
    revoke all on bundles from anon, authenticated;
  end if;
end $$;

select cadmium_service_only(array['cadmium_put_bundle', 'cadmium_get_bundle', 'cadmium_set_listed',
  'cadmium_listed_bundles', 'cadmium_material', 'cadmium_list_materials']);
