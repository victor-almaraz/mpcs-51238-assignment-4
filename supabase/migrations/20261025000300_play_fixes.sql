-- Play fixes: every character that has played in an instance, so an ended game and its history still
-- name the party after the characters leave. Access as in the store migration: service role only.

-- The characters that have joined an instance, in joining order, with when each left; characters erased
-- with their account are absent, and their events carry "Former player".
create function cadmium_instance_roster(p_instance text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ch.id, 'user_id', ic.user_id, 'name', ch.name, 'left_at', ic.left_at)
                            order by ic.joined_at, ch.id), '[]'::jsonb)
  from instance_characters ic join characters ch on ch.id = ic.character_id
  where ic.instance_id = p_instance;
$$;

select cadmium_service_only(array['cadmium_instance_roster']);
