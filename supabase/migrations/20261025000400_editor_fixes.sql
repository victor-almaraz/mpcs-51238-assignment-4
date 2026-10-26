-- The adventure id of a draft follows its document until the first publication, and the operator
-- console counts what requires a setting before unlisting one of its versions.

-- Sets the adventure id of a draft that has never been published; null when it has been, or is deleted.
-- Another of the owner's drafts with the same id fails the unique index material_drafts_owner_material.
create function cadmium_set_draft_material(p_id text, p_material_id text) returns jsonb language sql as $$
  update material_drafts set material_id = p_material_id
   where id = p_id and deleted_at is null and last_published_version is null
  returning cadmium_draft_json(material_drafts);
$$;

-- What requires setting p_id: the version range of each draft that is not deleted, and the resolved
-- version of each listed adventure.
create function cadmium_setting_dependents(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'drafts', coalesce((
      select jsonb_agg(r->>'versions')
        from material_drafts d,
             jsonb_array_elements(case when jsonb_typeof(d.document->'adventure'->'requires_settings') = 'array' then d.document->'adventure'->'requires_settings' else '[]'::jsonb end) r
       where d.deleted_at is null and jsonb_typeof(r) = 'object' and r->>'id' = p_id), '[]'::jsonb),
    'adventures', coalesce((
      select jsonb_agg(r->>'resolved')
        from bundles b,
             jsonb_array_elements(case when jsonb_typeof(b.data->'manifest'->'requires_settings') = 'array' then b.data->'manifest'->'requires_settings' else '[]'::jsonb end) r
       where b.kind = 'adventure' and b.listed and jsonb_typeof(r) = 'object' and r->>'id' = p_id), '[]'::jsonb));
$$;

do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('cadmium_set_draft_material', 'cadmium_setting_dependents') loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
