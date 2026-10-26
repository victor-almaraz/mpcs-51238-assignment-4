-- Deleting a published bundle version that nothing uses (api.md, Admin: delete_bundle; Materials:
-- delete_material). Access as in the store migration: service role only.

-- Deletes the bundle version when no campaign's materials and no instance's pinned materials name it,
-- and drops it from its assets' references, so the daily purge erases art no other bundle uses.
-- Returns what uses it: zero campaigns and zero games when it was deleted, or the counts that kept it.
create function cadmium_delete_bundle(p_kind text, p_id text, p_version text) returns jsonb language plpgsql as $$
declare
  ref text := p_kind || ':' || p_id || '@' || p_version;
  in_campaigns integer;
  in_games integer;
begin
  select count(distinct campaign_id) into in_campaigns from campaign_materials
   where kind = p_kind and bundle_id = p_id and bundle_version = p_version;
  select count(*) into in_games from instances i
   where exists (select 1 from jsonb_array_elements(i.materials) m
                  where m->>'kind' = p_kind and m->>'id' = p_id and m->>'version' = p_version);
  if in_campaigns = 0 and in_games = 0 then
    delete from bundles where kind = p_kind and id = p_id and version = p_version;
    update assets set bundle_refs = (select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(bundle_refs) r where r->>'bundle_id' <> ref)
     where bundle_refs @> jsonb_build_array(jsonb_build_object('bundle_id', ref));
  end if;
  return jsonb_build_object('campaigns', in_campaigns, 'games', in_games);
end $$;

select cadmium_service_only(array['cadmium_delete_bundle']);
