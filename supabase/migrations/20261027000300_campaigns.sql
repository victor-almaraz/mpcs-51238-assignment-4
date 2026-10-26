-- Campaigns, their members and materials, their games, and invitations (docs/spec/docs/data-model.md,
-- Records: Campaign, Campaign member, Campaign material, Instance, Invitation; docs/spec/docs/api.md,
-- Campaigns, Invitations). Permission checks and material validation run in lib/api; these functions
-- keep each operation's writes in one transaction.

create table campaigns (
  id text primary key,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  author_id text not null references users (id),
  system text not null,
  system_versions text not null,
  modules jsonb not null default '[]',
  invite_link_code text unique,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- A hold for a report of apparently illegal content (docs/spec/docs/data-model.md, Deletion); operators
  -- set it.
  held_at timestamptz,
  hold_reason text,
  -- When an operator removed the campaign (docs/spec/docs/runbooks/content-reports.md). A removed
  -- campaign is deleted for good: its author neither lists nor restores it, and the purge erases it as
  -- any deleted campaign.
  removed_at timestamptz
);

create table campaign_members (
  campaign_id text not null references campaigns (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  role text not null check (role in ('author', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create unique index campaign_members_one_author on campaign_members (campaign_id) where role = 'author';
create index campaign_members_by_user on campaign_members (user_id);

create table campaign_materials (
  campaign_id text not null references campaigns (id) on delete cascade,
  kind text not null check (kind in ('setting', 'adventure')),
  bundle_id text not null,
  bundle_version text not null,
  position integer not null,
  primary key (campaign_id, kind, bundle_id),
  foreign key (kind, bundle_id, bundle_version) references bundles (kind, id, version)
);

-- A game: its status, pinned materials, seed, and engine state.
create table instances (
  id text primary key,
  campaign_id text not null references campaigns (id),
  name text not null check (char_length(name) between 1 and 80),
  system text not null,
  system_version text not null,
  modules jsonb not null default '[]',
  materials jsonb not null,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'paused', 'ended')),
  -- Seeds are in [0, 2^53 - 1] (docs/spec/docs/data-model.md, Instance).
  seed bigint not null check (seed >= 0 and seed < 9007199254740992),
  rng_algorithm text not null default 'splitmix64_v1',
  version integer not null default 0,
  state jsonb,
  ending text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz,
  -- The time at which the Coordinator invokes `advance`, or null when no wait is timed.
  round_deadline timestamptz,
  -- Set by auto_pause at an occurrence's end while a round is under way: the Coordinator pauses after
  -- the round closes.
  pause_requested boolean not null default false,
  unique (campaign_id, name)
);

create table invitations (
  id text primary key,
  campaign_id text not null references campaigns (id) on delete cascade,
  inviter_id text not null references users (id),
  note text not null default '' check (char_length(note) <= 80),
  invitee_user_id text references users (id),
  instance_id text references instances (id),
  message text not null default '' check (char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  responded_at timestamptz
);
create index invitations_by_campaign on invitations (campaign_id, created_at);

-- Campaigns ---------------------------------------------------------------------------------------

-- The campaign object of docs/spec/docs/api.md, with `invite_link_code`; lib/api removes it for players.
-- Members are active accounts only: closing accounts are hidden (docs/spec/docs/data-model.md, Deletion).
create function cadmium_campaign(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description, 'author_id', c.author_id,
    'system', c.system, 'system_versions', c.system_versions, 'modules', c.modules,
    'archived', c.archived, 'invite_link_code', c.invite_link_code, 'created_at', c.created_at,
    'materials', coalesce((select jsonb_agg(jsonb_build_object('kind', m.kind, 'id', m.bundle_id, 'version', m.bundle_version)
                                            order by m.position)
                             from campaign_materials m where m.campaign_id = c.id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', u.display_name, 'role', m.role)
                                          order by m.role, m.joined_at, m.user_id)
                           from campaign_members m join users u on u.id = m.user_id and u.status = 'active'
                          where m.campaign_id = c.id), '[]'::jsonb),
    'instance_ids', coalesce((select jsonb_agg(i.id order by i.created_at, i.id)
                                from instances i where i.campaign_id = c.id and i.deleted_at is null), '[]'::jsonb))
  from campaigns c where c.id = p_id and c.deleted_at is null;
$$;

create function cadmium_set_campaign_materials(p_id text, p_materials jsonb) returns void language sql as $$
  delete from campaign_materials where campaign_id = p_id;
  insert into campaign_materials (campaign_id, kind, bundle_id, bundle_version, position)
  select p_id, m->>'kind', m->>'id', m->>'version', (ord - 1)::integer
    from jsonb_array_elements(p_materials) with ordinality as t(m, ord);
$$;

create function cadmium_create_campaign(
  p_id text, p_title text, p_description text, p_author text, p_system text, p_system_versions text,
  p_modules jsonb, p_materials jsonb
) returns jsonb language plpgsql as $$
begin
  insert into campaigns (id, title, description, author_id, system, system_versions, modules)
  values (p_id, p_title, p_description, p_author, p_system, p_system_versions, p_modules);
  insert into campaign_members (campaign_id, user_id, role) values (p_id, p_author, 'author');
  perform cadmium_set_campaign_materials(p_id, p_materials);
  return cadmium_campaign(p_id);
end $$;

-- The user's campaigns, newest first; `p_after` is the id of the last campaign of the previous page.
create function cadmium_list_campaigns(p_user text, p_role text, p_archived boolean, p_limit integer, p_after text) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(cadmium_campaign(c.id) order by c.created_at desc, c.id desc), '[]'::jsonb)
  from (
    select c.id, c.created_at from campaigns c join campaign_members m on m.campaign_id = c.id and m.user_id = p_user
     where c.deleted_at is null
       and (p_role is null or m.role = p_role)
       and (p_archived is null or c.archived = p_archived)
       and (p_after is null or (c.created_at, c.id) < (select created_at, id from campaigns where id = p_after))
     order by c.created_at desc, c.id desc
     limit p_limit
  ) c;
$$;

create function cadmium_update_campaign(p_id text, p_title text, p_description text, p_modules jsonb) returns jsonb
language plpgsql as $$
begin
  update campaigns set title = coalesce(p_title, title), description = coalesce(p_description, description),
                       modules = coalesce(p_modules, modules)
   where id = p_id and deleted_at is null;
  return cadmium_campaign(p_id);
end $$;

create function cadmium_replace_campaign_materials(p_id text, p_materials jsonb) returns jsonb language plpgsql as $$
begin
  perform cadmium_set_campaign_materials(p_id, p_materials);
  return cadmium_campaign(p_id);
end $$;

create function cadmium_archive_campaign(p_id text) returns jsonb language plpgsql as $$
begin
  update campaigns set archived = true, invite_link_code = null where id = p_id and deleted_at is null;
  return cadmium_campaign(p_id);
end $$;

create function cadmium_unarchive_campaign(p_id text) returns jsonb language plpgsql as $$
begin
  update campaigns set archived = false where id = p_id and deleted_at is null;
  return cadmium_campaign(p_id);
end $$;

create function cadmium_set_invite_link(p_id text, p_code text) returns void language sql as $$
  update campaigns set invite_link_code = p_code where id = p_id and deleted_at is null;
$$;

create function cadmium_campaign_by_link(p_code text) returns text language sql stable as $$
  select id from campaigns where invite_link_code = p_code and deleted_at is null and not archived;
$$;

-- Adds a player; false when the user is already a member.
create function cadmium_add_member(p_campaign text, p_user text) returns boolean language plpgsql as $$
begin
  insert into campaign_members (campaign_id, user_id, role) values (p_campaign, p_user, 'player') on conflict do nothing;
  return found;
end $$;

-- Removes a player and takes their characters out of the campaign's instances in `lobby`. lib/api
-- refuses while one of them is in an instance that has started.
create function cadmium_remove_member(p_campaign text, p_user text) returns void language plpgsql as $$
begin
  update characters ch set status = 'available', instance_id = null
    from instance_characters ic join instances i on i.id = ic.instance_id
   where ic.character_id = ch.id and ic.user_id = p_user and ic.left_at is null and i.campaign_id = p_campaign
     and ch.instance_id = i.id;
  update instance_characters ic set left_at = now()
    from instances i
   where i.id = ic.instance_id and i.campaign_id = p_campaign and ic.user_id = p_user and ic.left_at is null;
  delete from campaign_members where campaign_id = p_campaign and user_id = p_user and role = 'player';
end $$;

-- Deletion and restore ----------------------------------------------------------------------------

-- Campaign deletion (docs/spec/docs/api.md, Campaigns: delete_campaign is recoverable for 30 days; the
-- erasure after 90 days is a scheduled job).
create function cadmium_delete_campaign(p_id text) returns void language sql as $$
  update campaigns set deleted_at = now(), invite_link_code = null
   where id = p_id and deleted_at is null;
$$;

-- Restores a campaign deleted less than 30 days ago and not removed; false otherwise.
create function cadmium_restore_campaign(p_id text) returns boolean language plpgsql as $$
begin
  update campaigns set deleted_at = null
   where id = p_id and deleted_at is not null and deleted_at > now() - interval '30 days' and removed_at is null;
  return found;
end $$;

-- A deleted campaign's author and deletion time, for restore_campaign; none once removed.
create function cadmium_deleted_campaign(p_id text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', id, 'author_id', author_id, 'deleted_at', deleted_at) from campaigns
   where id = p_id and deleted_at is not null and removed_at is null;
$$;

-- The author's campaigns deleted less than 30 days ago and not removed, which restore_campaign can
-- still bring back, newest first, as summaries.
create function cadmium_deleted_campaigns(p_author text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'system', system, 'deleted_at', deleted_at) order by deleted_at desc), '[]'::jsonb)
  from campaigns
  where author_id = p_author and deleted_at is not null and deleted_at > now() - interval '30 days' and removed_at is null;
$$;

-- Invitations -------------------------------------------------------------------------------------

-- The invitation object of docs/spec/docs/api.md, with `note`; a pending invitation past `expires_at` is
-- `expired`.
create function cadmium_invitation_json(i invitations) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', i.id, 'campaign_id', i.campaign_id, 'campaign_title', c.title,
    'inviter', jsonb_build_object('user_id', i.inviter_id, 'display_name', u.display_name),
    'note', i.note, 'instance_id', i.instance_id, 'message', i.message,
    'status', case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
    'created_at', i.created_at, 'expires_at', i.expires_at)
  from campaigns c, users u where c.id = i.campaign_id and u.id = i.inviter_id;
$$;

create function cadmium_create_invitation(
  p_id text, p_campaign text, p_inviter text, p_instance text, p_message text, p_note text, p_token_hash text
) returns jsonb language sql as $$
  insert into invitations (id, campaign_id, inviter_id, instance_id, message, note, token_hash)
  values (p_id, p_campaign, p_inviter, p_instance, p_message, p_note, p_token_hash)
  returning cadmium_invitation_json(invitations);
$$;

create function cadmium_get_invitation(p_id text) returns jsonb language sql stable as $$
  select cadmium_invitation_json(i) from invitations i where id = p_id;
$$;

create function cadmium_invitation_by_hash(p_token_hash text) returns jsonb language sql stable as $$
  select cadmium_invitation_json(i) from invitations i join campaigns c on c.id = i.campaign_id
   where i.token_hash = p_token_hash and c.deleted_at is null;
$$;

create function cadmium_list_invitations(p_campaign text, p_status text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(j order by j->>'created_at' desc), '[]'::jsonb)
  from (select cadmium_invitation_json(i) j from invitations i where campaign_id = p_campaign) t
  where p_status is null or j->>'status' = p_status;
$$;

-- Accepts or declines a pending invitation, binding it to the user; accepting adds a player. Returns
-- `done`, or why not: `not_found`, `archived`, or the invitation's status.
create function cadmium_respond_invitation(p_token_hash text, p_user text, p_accept boolean) returns text
language plpgsql as $$
declare
  inv invitations;
  is_archived boolean;
begin
  select * into inv from invitations where token_hash = p_token_hash for update;
  if not found then return 'not_found'; end if;
  select archived into is_archived from campaigns where id = inv.campaign_id and deleted_at is null;
  if not found then return 'not_found'; end if;
  if inv.status <> 'pending' then return inv.status; end if;
  if inv.expires_at <= now() then
    update invitations set status = 'expired' where id = inv.id;
    return 'expired';
  end if;
  if p_accept and is_archived then return 'archived'; end if;
  update invitations set status = case when p_accept then 'accepted' else 'declined' end,
                         invitee_user_id = p_user, responded_at = now()
   where id = inv.id;
  if p_accept then
    insert into campaign_members (campaign_id, user_id, role) values (inv.campaign_id, p_user, 'player') on conflict do nothing;
  end if;
  return 'done';
end $$;

-- Revokes a pending invitation; false when it is no longer pending.
create function cadmium_revoke_invitation(p_id text) returns boolean language plpgsql as $$
begin
  update invitations set status = 'revoked', responded_at = now()
   where id = p_id and status = 'pending' and expires_at > now();
  return found;
end $$;

-- Marks pending invitations past `expires_at` as expired, for the scheduled job; returns how many.
create function cadmium_expire_invitations() returns integer language plpgsql as $$
declare
  n integer;
begin
  update invitations set status = 'expired' where status = 'pending' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Access -------------------------------------------------------------------------------------------

alter table campaigns enable row level security;
alter table campaign_members enable row level security;
alter table campaign_materials enable row level security;
alter table instances enable row level security;
alter table invitations enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on campaigns, campaign_members, campaign_materials, instances, invitations from anon, authenticated;
  end if;
end $$;

select cadmium_service_only(array['cadmium_campaign', 'cadmium_set_campaign_materials',
  'cadmium_create_campaign', 'cadmium_list_campaigns', 'cadmium_update_campaign',
  'cadmium_replace_campaign_materials', 'cadmium_archive_campaign', 'cadmium_unarchive_campaign',
  'cadmium_set_invite_link', 'cadmium_campaign_by_link', 'cadmium_add_member', 'cadmium_remove_member',
  'cadmium_delete_campaign', 'cadmium_restore_campaign', 'cadmium_deleted_campaign',
  'cadmium_deleted_campaigns', 'cadmium_invitation_json', 'cadmium_create_invitation',
  'cadmium_get_invitation', 'cadmium_invitation_by_hash', 'cadmium_list_invitations',
  'cadmium_respond_invitation', 'cadmium_revoke_invitation', 'cadmium_expire_invitations']);
