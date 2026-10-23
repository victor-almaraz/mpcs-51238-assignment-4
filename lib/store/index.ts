// The store (engine-implementation.md, Module boundaries: records, events, snapshots, bundles;
// data-model.md, Records and Atomicity). Each operation is one SQL function from supabase/migrations,
// called through an `Rpc`: supabase-js `.rpc()` in production, plain SQL in tests. Commits go through
// `cadmium_commit`, which writes every item of a commit in one transaction.

import type { AdventureBundle } from "../bundle/adventure";
import type { SettingBundle } from "../bundle/setting";
import type { Commit, CommitInput, GameEvent, State } from "../engine";
import type { SessionException, SessionRecord } from "../scheduler/occurrences";

/** Calls a store function by name with named arguments; rejects with an error carrying `code`. */
export interface Rpc {
  call<T>(fn: string, args: Record<string, unknown>): Promise<T>;
}

/** What tests and the migration runner need from a Postgres connection. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(script: string): Promise<void>;
  /** Runs `fn` on one connection inside a transaction, committing when it resolves and rolling back when it throws. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** The stored version is not the expected one: another writer committed first. */
export class VersionConflict extends Error {
  constructor(
    readonly instanceId: string,
    readonly expected: number,
  ) {
    super(`instance ${instanceId} is not at version ${expected}`);
  }
}

export type InstanceStatus = "lobby" | "active" | "paused" | "ended";

export interface InstanceRecord {
  id: string;
  campaign_id: string;
  name: string;
  system: string;
  system_version: string;
  modules: string[];
  materials: { kind: "setting" | "adventure"; id: string; version: string; position: number }[];
  status: InstanceStatus;
  seed: string;
  rng_algorithm: string;
  version: number;
  state: State | null;
  ending: string | null;
}

export interface NewInstance {
  id: string;
  campaign_id: string;
  name: string;
  system: string;
  system_version: string;
  modules: string[];
  materials: InstanceRecord["materials"];
  seed: number;
}

export interface CommitRequest {
  instanceId: string;
  expectedVersion: number;
  state: State;
  events: readonly GameEvent[];
  input: CommitInput;
  /** The input log row the commit answers, and its outcome. */
  inputLog?: { id: string; outcome: "committed" | "fallback" };
  status?: InstanceStatus;
  ending?: string | null;
}

export interface StoredEvent {
  seq: number;
  version: number;
  actor_id: string | null;
  event: GameEvent;
}

export interface NewInputLog {
  id: string;
  instance_id: string;
  user_id: string;
  idempotency_key: string;
  text: string | null;
  parser_context?: unknown;
  tool_calls?: unknown[];
}

export interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  timezone: string;
  reminders: { push: boolean; lead_minutes: number[] };
  operator: boolean;
  status: "active" | "closing" | "deleted";
  deletion_requested_at: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  calendar_token_hash?: string | null;
  calendar_feed_generation?: number;
  held_at?: string | null;
  suspended_at?: string | null;
  created_at: string;
}

export interface CharacterRecord {
  id: string;
  owner_id: string;
  system: string;
  system_version: string;
  name: string;
  sheet: Record<string, unknown> & { status: string };
  portrait_asset: string | null;
  status: "available" | "in_instance" | "dead" | "retired";
  instance_id: string | null;
  created_at: string;
}

export interface MaterialRef {
  kind: "setting" | "adventure";
  id: string;
  version: string;
}

/** A bundle as a campaign material: identity, system, who may use it, and its manifest. */
export interface MaterialRecord extends MaterialRef {
  system: string;
  system_versions: string;
  origin: "operator" | "author";
  listed: boolean;
  publisher_id: string | null;
  manifest: (SettingBundle | AdventureBundle)["manifest"];
}

export interface CampaignRecord {
  id: string;
  title: string;
  description: string;
  author_id: string;
  system: string;
  system_versions: string;
  modules: string[];
  archived: boolean;
  invite_link_code: string | null;
  created_at: string;
  materials: MaterialRef[];
  members: { user_id: string; display_name: string; role: "author" | "player" }[];
  instance_ids: string[];
}

export interface InvitationRecord {
  id: string;
  campaign_id: string;
  campaign_title: string;
  inviter: { user_id: string; display_name: string };
  note: string;
  instance_id: string | null;
  message: string;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  created_at: string;
  expires_at: string;
}

/** The instance object of api.md, without the engine state. */
export interface InstanceView {
  id: string;
  campaign_id: string;
  name: string;
  system: string;
  system_version: string;
  modules: string[];
  materials: MaterialRef[];
  status: InstanceStatus;
  version: number;
  characters: { id: string; user_id: string; name: string }[];
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  ending: string | null;
}

export interface HistoryItem {
  version: number;
  actor_id: string | null;
  events: GameEvent[];
  narration: { text: string; source: "model" | "template" } | null;
}

export interface PushView {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

export interface Rsvp {
  session_id: string;
  occurrence_start: string;
  user_id: string;
  response: "yes" | "no" | "maybe";
}

export interface Schedules {
  sessions: SessionRecord[];
  exceptions: SessionException[];
  rsvps: Rsvp[];
}

export interface SchedulerSnapshot extends Schedules {
  instances: { id: string; status: InstanceStatus; campaign_id: string }[];
  members: { campaign_id: string; user_id: string; reminders: UserRecord["reminders"] }[];
}

type BundleMeta = { publisher_id?: string | null; draft_id?: string | null; origin: "operator" | "author"; listed?: boolean };

export class Store {
  constructor(readonly rpc: Rpc) {}

  // Bundles --------------------------------------------------------------------------------------

  async putBundle(bundle: SettingBundle | AdventureBundle, meta: BundleMeta): Promise<void> {
    const system = bundle.manifest.system;
    await this.rpc.call("cadmium_put_bundle", {
      p_kind: bundle.kind,
      p_id: bundle.id,
      p_version: bundle.version,
      p_system: system.id,
      p_system_versions: system.versions,
      p_publisher_id: meta.publisher_id ?? null,
      p_draft_id: meta.draft_id ?? null,
      p_data: bundle,
      p_origin: meta.origin,
      p_listed: meta.listed ?? true,
    });
  }

  async getBundle(kind: "setting" | "adventure", id: string, version: string): Promise<SettingBundle | AdventureBundle | undefined> {
    return (await this.rpc.call<SettingBundle | AdventureBundle | null>("cadmium_get_bundle", { p_kind: kind, p_id: id, p_version: version })) ?? undefined;
  }

  async setListed(kind: string, id: string, version: string, listed: boolean): Promise<void> {
    await this.rpc.call("cadmium_set_listed", { p_kind: kind, p_id: id, p_version: version, p_listed: listed });
  }

  // Instances ------------------------------------------------------------------------------------

  async createInstance(i: NewInstance): Promise<void> {
    await this.rpc.call("cadmium_create_instance", {
      p_id: i.id,
      p_campaign_id: i.campaign_id,
      p_name: i.name,
      p_system: i.system,
      p_system_version: i.system_version,
      p_modules: i.modules,
      p_materials: i.materials,
      p_seed: i.seed,
    });
  }

  async getInstance(id: string): Promise<InstanceRecord | undefined> {
    return (await this.rpc.call<InstanceRecord | null>("cadmium_get_instance", { p_id: id })) ?? undefined;
  }

  async setStatus(id: string, status: InstanceStatus): Promise<void> {
    await this.rpc.call("cadmium_set_status", { p_id: id, p_status: status });
  }

  async addCharacter(instanceId: string, characterId: string, userId: string): Promise<void> {
    await this.rpc.call("cadmium_add_character", { p_instance: instanceId, p_character: characterId, p_user: userId });
  }

  // Commits --------------------------------------------------------------------------------------

  /** Commits atomically; returns the new version, or throws VersionConflict. */
  async commit(c: CommitRequest): Promise<number> {
    try {
      return await this.rpc.call<number>("cadmium_commit", {
        p_instance: c.instanceId,
        p_expected: c.expectedVersion,
        p_state: c.state,
        p_events: c.events,
        p_input: c.input,
        p_input_log: c.inputLog?.id ?? null,
        p_outcome: c.inputLog?.outcome ?? null,
        p_status: c.status ?? null,
        p_ending: c.ending ?? null,
      });
    } catch (e) {
      if ((e as { code?: string }).code === "CD409") throw new VersionConflict(c.instanceId, c.expectedVersion);
      throw e;
    }
  }

  /** Events after `afterVersion`, in seq order, at most `limit`. */
  async events(instanceId: string, afterVersion = 0, limit = 1000): Promise<StoredEvent[]> {
    return this.rpc.call<StoredEvent[]>("cadmium_events", { p_instance: instanceId, p_after: afterVersion, p_limit: limit });
  }

  /** Every commit with its input and events, in version order: what replay needs. */
  async commits(instanceId: string): Promise<Commit[]> {
    return this.rpc.call<Commit[]>("cadmium_commits", { p_instance: instanceId });
  }

  // Input log and narration ----------------------------------------------------------------------

  /** Records an input; returns false when the idempotency key was already used by the user in the instance. */
  async logInput(i: NewInputLog): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_log_input", {
      p_id: i.id,
      p_instance: i.instance_id,
      p_user: i.user_id,
      p_key: i.idempotency_key,
      p_text: i.text,
      p_parser_context: i.parser_context ?? null,
      p_tool_calls: i.tool_calls ?? [],
    });
  }

  async rejectInput(id: string): Promise<void> {
    await this.rpc.call("cadmium_reject_input", { p_id: id });
  }

  async inputByKey(instanceId: string, userId: string, key: string): Promise<{ id: string; outcome: string | null; version: number | null } | undefined> {
    return (await this.rpc.call<{ id: string; outcome: string | null; version: number | null } | null>("cadmium_input_by_key", { p_instance: instanceId, p_user: userId, p_key: key })) ?? undefined;
  }

  async putNarration(instanceId: string, version: number, text: string, source: "model" | "template"): Promise<void> {
    await this.rpc.call("cadmium_put_narration", { p_instance: instanceId, p_version: version, p_text: text, p_source: source });
  }

  // Users ----------------------------------------------------------------------------------------

  /** Creates or updates a user from the identity provider; undefined for a deleted user. */
  async upsertUser(u: { id: string; email: string; display_name: string; terms_accepted_at: string | null }): Promise<UserRecord | undefined> {
    return (
      (await this.rpc.call<UserRecord | null>("cadmium_upsert_user", { p_id: u.id, p_email: u.email, p_display_name: u.display_name, p_terms_accepted_at: u.terms_accepted_at })) ??
      undefined
    );
  }

  async getUser(id: string): Promise<UserRecord | undefined> {
    return (await this.rpc.call<UserRecord | null>("cadmium_get_user", { p_id: id })) ?? undefined;
  }

  async acceptTerms(id: string, version: string): Promise<UserRecord | undefined> {
    return (await this.rpc.call<UserRecord | null>("cadmium_accept_terms", { p_id: id, p_version: version })) ?? undefined;
  }

  async markUserDeleted(id: string): Promise<void> {
    await this.rpc.call("cadmium_mark_user_deleted", { p_id: id });
  }

  // Characters -----------------------------------------------------------------------------------

  async createCharacter(c: { id: string; owner_id: string; system: string; system_version: string; name: string; sheet: CharacterRecord["sheet"] }): Promise<CharacterRecord> {
    return this.rpc.call<CharacterRecord>("cadmium_create_character", {
      p_id: c.id,
      p_owner: c.owner_id,
      p_system: c.system,
      p_system_version: c.system_version,
      p_name: c.name,
      p_sheet: c.sheet,
    });
  }

  async getCharacter(id: string): Promise<CharacterRecord | undefined> {
    return (await this.rpc.call<CharacterRecord | null>("cadmium_get_character", { p_id: id })) ?? undefined;
  }

  async listCharacters(owner: string, filter: { system?: string; status?: string; limit: number; after?: string }): Promise<CharacterRecord[]> {
    return this.rpc.call<CharacterRecord[]>("cadmium_list_characters", {
      p_owner: owner,
      p_system: filter.system ?? null,
      p_status: filter.status ?? null,
      p_limit: filter.limit,
      p_after: filter.after ?? null,
    });
  }

  async updateCharacter(id: string, name: string, sheet: CharacterRecord["sheet"]): Promise<CharacterRecord | undefined> {
    return (await this.rpc.call<CharacterRecord | null>("cadmium_update_character", { p_id: id, p_name: name, p_sheet: sheet })) ?? undefined;
  }

  async setCharacterStatus(id: string, status: CharacterRecord["status"]): Promise<CharacterRecord | undefined> {
    return (await this.rpc.call<CharacterRecord | null>("cadmium_set_character_status", { p_id: id, p_status: status })) ?? undefined;
  }

  /** The latest listed operator bundle of each id, of a kind, for the given systems. */
  async listedBundles<B extends SettingBundle | AdventureBundle>(kind: B["kind"], systems: readonly string[]): Promise<B[]> {
    return this.rpc.call<B[]>("cadmium_listed_bundles", { p_kind: kind, p_systems: systems });
  }

  async material(kind: string, id: string, version: string): Promise<MaterialRecord | undefined> {
    return (await this.rpc.call<MaterialRecord | null>("cadmium_material", { p_kind: kind, p_id: id, p_version: version })) ?? undefined;
  }

  /** The latest version of each material the user may choose: listed operator bundles and their own, or only their own. */
  async listMaterials(userId: string, systems: readonly string[], kind: string | null, own: boolean): Promise<MaterialRecord[]> {
    return this.rpc.call<MaterialRecord[]>("cadmium_list_materials", { p_user: userId, p_systems: systems, p_kind: kind, p_own: own });
  }

  // Campaigns ------------------------------------------------------------------------------------

  async createCampaign(c: { id: string; title: string; description: string; author_id: string; system: string; system_versions: string; modules: string[]; materials: MaterialRef[] }): Promise<CampaignRecord> {
    return this.rpc.call<CampaignRecord>("cadmium_create_campaign", {
      p_id: c.id,
      p_title: c.title,
      p_description: c.description,
      p_author: c.author_id,
      p_system: c.system,
      p_system_versions: c.system_versions,
      p_modules: c.modules,
      p_materials: c.materials,
    });
  }

  async getCampaign(id: string): Promise<CampaignRecord | undefined> {
    return (await this.rpc.call<CampaignRecord | null>("cadmium_campaign", { p_id: id })) ?? undefined;
  }

  async listCampaigns(user: string, filter: { role?: string; archived?: boolean; limit: number; after?: string }): Promise<CampaignRecord[]> {
    return this.rpc.call<CampaignRecord[]>("cadmium_list_campaigns", { p_user: user, p_role: filter.role ?? null, p_archived: filter.archived ?? null, p_limit: filter.limit, p_after: filter.after ?? null });
  }

  /** Updates the given fields; null leaves a field unchanged. */
  async updateCampaign(id: string, u: { title?: string; description?: string; modules?: string[] }): Promise<CampaignRecord> {
    return this.rpc.call<CampaignRecord>("cadmium_update_campaign", { p_id: id, p_title: u.title ?? null, p_description: u.description ?? null, p_modules: u.modules ?? null });
  }

  /** Replaces the materials; their order is the settings' resolution order. */
  async setMaterials(id: string, materials: MaterialRef[]): Promise<CampaignRecord> {
    return this.rpc.call<CampaignRecord>("cadmium_replace_campaign_materials", { p_id: id, p_materials: materials });
  }

  async archiveCampaign(id: string): Promise<CampaignRecord> {
    return this.rpc.call<CampaignRecord>("cadmium_archive_campaign", { p_id: id });
  }

  async setInviteLink(id: string, code: string | null): Promise<void> {
    await this.rpc.call("cadmium_set_invite_link", { p_id: id, p_code: code });
  }

  async campaignByLink(code: string): Promise<string | undefined> {
    return (await this.rpc.call<string | null>("cadmium_campaign_by_link", { p_code: code })) ?? undefined;
  }

  /** Adds a player; false when the user is already a member. */
  async addMember(campaignId: string, userId: string): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_add_member", { p_campaign: campaignId, p_user: userId });
  }

  /** Removes a player, taking their characters out of the campaign's instances. */
  async removeMember(campaignId: string, userId: string): Promise<void> {
    await this.rpc.call("cadmium_remove_member", { p_campaign: campaignId, p_user: userId });
  }

  // Invitations ----------------------------------------------------------------------------------

  async createInvitation(i: { id: string; campaign_id: string; inviter_id: string; instance_id: string | null; message: string; note: string; token_hash: string }): Promise<InvitationRecord> {
    return this.rpc.call<InvitationRecord>("cadmium_create_invitation", {
      p_id: i.id,
      p_campaign: i.campaign_id,
      p_inviter: i.inviter_id,
      p_instance: i.instance_id,
      p_message: i.message,
      p_note: i.note,
      p_token_hash: i.token_hash,
    });
  }

  async getInvitation(id: string): Promise<InvitationRecord | undefined> {
    return (await this.rpc.call<InvitationRecord | null>("cadmium_get_invitation", { p_id: id })) ?? undefined;
  }

  async invitationByHash(hash: string): Promise<InvitationRecord | undefined> {
    return (await this.rpc.call<InvitationRecord | null>("cadmium_invitation_by_hash", { p_token_hash: hash })) ?? undefined;
  }

  async listInvitations(campaignId: string, status?: string): Promise<InvitationRecord[]> {
    return this.rpc.call<InvitationRecord[]>("cadmium_list_invitations", { p_campaign: campaignId, p_status: status ?? null });
  }

  /** Accepts or declines by code hash; returns `done`, or why not: `not_found`, `archived`, or the invitation's status. */
  async respondInvitation(hash: string, userId: string, accept: boolean): Promise<string> {
    return this.rpc.call<string>("cadmium_respond_invitation", { p_token_hash: hash, p_user: userId, p_accept: accept });
  }

  /** Revokes a pending invitation; false when it is no longer pending. */
  async revokeInvitation(id: string): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_revoke_invitation", { p_id: id });
  }

  // Instance views and party ---------------------------------------------------------------------

  async instanceView(id: string): Promise<InstanceView | undefined> {
    return (await this.rpc.call<InstanceView | null>("cadmium_instance", { p_id: id })) ?? undefined;
  }

  async listInstances(campaignId: string): Promise<InstanceView[]> {
    return this.rpc.call<InstanceView[]>("cadmium_list_instances", { p_campaign: campaignId });
  }

  /** Puts an available character of the user into an instance; false when it is no longer available. */
  async joinInstance(instanceId: string, characterId: string, userId: string): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_join_instance", { p_instance: instanceId, p_character: characterId, p_user: userId });
  }

  /** Takes a character out of an instance, writing back `sheet` when given. */
  async leaveInstance(instanceId: string, characterId: string, sheet: CharacterRecord["sheet"] | null = null): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_leave_instance", { p_instance: instanceId, p_character: characterId, p_sheet: sheet });
  }

  // Coordinator ----------------------------------------------------------------------------------

  /** Changes status outside a commit; throws VersionConflict unless the stored version is `expectedVersion`. */
  async setInstanceStatus(id: string, expectedVersion: number, status: InstanceStatus, deadline: Date | null): Promise<void> {
    try {
      await this.rpc.call("cadmium_set_instance_status", { p_id: id, p_expected: expectedVersion, p_status: status, p_deadline: deadline?.toISOString() ?? null });
    } catch (e) {
      if ((e as { code?: string }).code === "CD409") throw new VersionConflict(id, expectedVersion);
      throw e;
    }
  }

  /** Sets the deadline of the wait that began at `version`; no effect once a later commit exists. */
  async setDeadline(id: string, version: number, deadline: Date | null): Promise<void> {
    await this.rpc.call("cadmium_set_deadline", { p_id: id, p_version: version, p_deadline: deadline?.toISOString() ?? null });
  }

  async deadline(id: string): Promise<Date | null> {
    const d = await this.rpc.call<string | null>("cadmium_deadline", { p_id: id });
    return d === null ? null : new Date(d);
  }

  /** Takes characters out of an instance, writing back their sheets and statuses. Repeatable. */
  async releaseCharacters(instanceId: string, sheets: { id: string; sheet: CharacterRecord["sheet"]; status: CharacterRecord["status"] }[]): Promise<void> {
    await this.rpc.call("cadmium_release_characters", { p_instance: instanceId, p_sheets: sheets });
  }

  /** Marks the events of a commit every member may see, by 1-based position. */
  async shareEvents(instanceId: string, version: number, positions: number[]): Promise<void> {
    await this.rpc.call("cadmium_share_events", { p_instance: instanceId, p_version: version, p_positions: positions });
  }

  /** Commits after a version with their shared events and narration. */
  async history(instanceId: string, afterVersion: number, limit: number): Promise<HistoryItem[]> {
    return this.rpc.call<HistoryItem[]>("cadmium_history", { p_instance: instanceId, p_after: afterVersion, p_limit: limit });
  }

  /** Counts a request; 0 when allowed, else the milliseconds until the window ends. */
  async rateHit(userId: string, scope: string, windowSeconds: number, limit: number): Promise<number> {
    return this.rpc.call<number>("cadmium_rate_hit", { p_user: userId, p_scope: scope, p_window_seconds: windowSeconds, p_limit: limit });
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.rpc.call("cadmium_delete_campaign", { p_id: id });
  }

  async restoreCampaign(id: string): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_restore_campaign", { p_id: id });
  }

  async deletedCampaign(id: string): Promise<{ id: string; author_id: string; deleted_at: string } | undefined> {
    return (await this.rpc.call<{ id: string; author_id: string; deleted_at: string } | null>("cadmium_deleted_campaign", { p_id: id })) ?? undefined;
  }

  // Parsed inputs --------------------------------------------------------------------------------

  async inputProcessing(instanceId: string, characterId: string, seconds: number): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_input_processing", { p_instance: instanceId, p_character: characterId, p_seconds: seconds });
  }

  async setInputCharacter(id: string, characterId: string): Promise<void> {
    await this.rpc.call("cadmium_set_input_character", { p_id: id, p_character: characterId });
  }

  async recordParse(id: string, parserContext: unknown, toolCalls: unknown[]): Promise<void> {
    await this.rpc.call("cadmium_record_parse", { p_id: id, p_parser_context: parserContext, p_tool_calls: toolCalls });
  }

  // Schedules ------------------------------------------------------------------------------------

  async putSession(session: SessionRecord): Promise<SessionRecord> {
    return this.rpc.call<SessionRecord>("cadmium_put_session", { p_session: session });
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    return (await this.rpc.call<SessionRecord | null>("cadmium_get_session", { p_id: id })) ?? undefined;
  }

  async setException(sessionId: string, occurrenceStart: string, status: "cancelled" | "moved", movedTo: string | null): Promise<void> {
    await this.rpc.call("cadmium_set_exception", { p_session: sessionId, p_occurrence_start: occurrenceStart, p_status: status, p_moved_to: movedTo });
  }

  async rsvp(sessionId: string, occurrenceStart: string, userId: string, response: Rsvp["response"]): Promise<void> {
    await this.rpc.call("cadmium_rsvp", { p_session: sessionId, p_occurrence_start: occurrenceStart, p_user: userId, p_response: response });
  }

  /** Sessions of the instances, with exceptions and RSVPs. */
  async schedules(instanceIds: readonly string[]): Promise<Schedules> {
    return this.rpc.call<Schedules>("cadmium_schedules", { p_instances: instanceIds });
  }

  async userInstances(userId: string): Promise<{ id: string; name: string; status: InstanceStatus; campaign_id: string; campaign_title: string }[]> {
    return this.rpc.call("cadmium_user_instances", { p_user: userId });
  }

  /** Records a unit of scheduler work; false when it was already done. */
  async scheduleMark(key: string): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_schedule_mark", { p_key: key });
  }

  async schedulerSnapshot(): Promise<SchedulerSnapshot> {
    return this.rpc.call<SchedulerSnapshot>("cadmium_scheduler_snapshot", {});
  }

  async expiredDeadlines(now: Date): Promise<string[]> {
    return this.rpc.call<string[]>("cadmium_expired_deadlines", { p_now: now.toISOString() });
  }

  async expireInvitations(): Promise<number> {
    return this.rpc.call<number>("cadmium_expire_invitations", {});
  }

  async setPauseRequested(id: string, requested: boolean): Promise<void> {
    await this.rpc.call("cadmium_set_pause_requested", { p_id: id, p_requested: requested });
  }

  async pauseRequested(id: string): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_pause_requested", { p_id: id });
  }

  /** Enables the user's calendar feed with the secret's hash, or disables it; returns the generation. */
  async setCalendarFeed(userId: string, hash: string | null): Promise<number> {
    return this.rpc.call<number>("cadmium_set_calendar_feed", { p_user: userId, p_hash: hash });
  }

  async userByFeed(hash: string): Promise<(UserRecord & { calendar_feed_generation: number; calendar_token_hash: string | null }) | undefined> {
    return (await this.rpc.call<(UserRecord & { calendar_feed_generation: number; calendar_token_hash: string | null }) | null>("cadmium_user_by_feed", { p_hash: hash })) ?? undefined;
  }

  // Accounts -------------------------------------------------------------------------------------

  async updateMe(id: string, u: { display_name?: string; timezone?: string; reminders?: UserRecord["reminders"] }): Promise<UserRecord | undefined> {
    return (await this.rpc.call<UserRecord | null>("cadmium_update_me", { p_id: id, p_display_name: u.display_name ?? null, p_timezone: u.timezone ?? null, p_reminders: u.reminders ?? null })) ?? undefined;
  }

  async requestDeletion(id: string): Promise<UserRecord | undefined> {
    return (await this.rpc.call<UserRecord | null>("cadmium_request_deletion", { p_id: id })) ?? undefined;
  }

  async restoreAccount(id: string): Promise<UserRecord | undefined> {
    return (await this.rpc.call<UserRecord | null>("cadmium_restore_account", { p_id: id })) ?? undefined;
  }

  async addPush(s: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; label: string }): Promise<PushView> {
    return this.rpc.call<PushView>("cadmium_add_push", { p_id: s.id, p_user: s.user_id, p_endpoint: s.endpoint, p_public_key: s.p256dh, p_auth_secret: s.auth, p_label: s.label });
  }

  async listPush(userId: string): Promise<(PushView & { endpoint: string; p256dh: string; auth: string })[]> {
    return this.rpc.call("cadmium_list_push", { p_user: userId });
  }

  async removePush(id: string, userId: string): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_remove_push", { p_id: id, p_user: userId });
  }

  /** Records a delivery, or deletes a subscription the push service reported gone. */
  async pushResult(endpoint: string, gone: boolean): Promise<void> {
    await this.rpc.call("cadmium_push_result", { p_endpoint: endpoint, p_gone: gone });
  }

  async exportUser(id: string): Promise<Record<string, unknown>> {
    return this.rpc.call<Record<string, unknown>>("cadmium_export_user", { p_user: id });
  }

  async purgeDue(now: Date): Promise<{ users: string[]; campaigns: string[] }> {
    return this.rpc.call("cadmium_purge_due", { p_now: now.toISOString() });
  }

  async purgeUser(id: string): Promise<void> {
    await this.rpc.call("cadmium_purge_user", { p_user: id });
  }

  async purgeCampaign(id: string): Promise<void> {
    await this.rpc.call("cadmium_purge_campaign", { p_id: id });
  }

  // Operations -----------------------------------------------------------------------------------

  async isOperator(id: string): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_is_operator", { p_id: id });
  }

  async logOperation(operatorId: string, action: string, target: string, detail = ""): Promise<void> {
    await this.rpc.call("cadmium_log_operation", { p_operator: operatorId, p_action: action, p_target: target, p_detail: detail });
  }

  async operatorLog(limit = 100): Promise<{ id: number; operator_id: string; action: string; target: string; detail: string; at: string }[]> {
    return this.rpc.call("cadmium_operator_log", { p_limit: limit });
  }

  /** Sets (with a reason) or clears (null) a hold; holding a record also holds its owner. */
  async setHold(kind: "user" | "character" | "campaign", id: string, reason: string | null): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_set_hold", { p_kind: kind, p_id: id, p_reason: reason });
  }

  async setSuspended(id: string, suspended: boolean): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_set_suspended", { p_id: id, p_suspended: suspended });
  }

  async removeCharacter(id: string): Promise<boolean> {
    return this.rpc.call<boolean>("cadmium_remove_character", { p_id: id });
  }

  async allBundles(): Promise<(Omit<MaterialRecord, "manifest"> & { created_at: string })[]> {
    return this.rpc.call("cadmium_all_bundles", {});
  }

  async shutdownPurge(): Promise<{ users: number; campaigns: number }> {
    return this.rpc.call("cadmium_shutdown_purge", {});
  }
}
