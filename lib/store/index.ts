// The store (engine-implementation.md, Module boundaries: records, events, snapshots, bundles;
// data-model.md, Records and Atomicity). Each operation is one SQL function from supabase/migrations,
// called through an `Rpc`: supabase-js `.rpc()` in production, plain SQL in tests. Commits go through
// `cadmium_commit`, which writes every item of a commit in one transaction.

import type { AdventureBundle } from "../bundle/adventure";
import type { SettingBundle } from "../bundle/setting";
import type { Commit, CommitInput, GameEvent, State } from "../engine";

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
}
