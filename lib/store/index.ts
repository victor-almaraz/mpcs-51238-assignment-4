// The store (engine-implementation.md, Module boundaries: records, events, snapshots, bundles;
// data-model.md, Records and Atomicity). Talks to Postgres through a narrow `Db`: PGlite in tests,
// Supabase Postgres in production. Every commit goes through the SQL function `cadmium_commit`.

import type { AdventureBundle } from "../bundle/adventure";
import type { SettingBundle } from "../bundle/setting";
import type { Commit, CommitInput, GameEvent, State } from "../engine";

/** The one operation the store needs from a Postgres client. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
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

type BundleMeta = { publisher_id?: string | null; draft_id?: string | null; origin: "operator" | "author"; listed?: boolean };

const INSTANCE_COLUMNS = "id, campaign_id, name, system, system_version, modules, materials, status, seed::text as seed, rng_algorithm, version, state, ending";

export class Store {
  constructor(readonly db: Db) {}

  // Bundles --------------------------------------------------------------------------------------

  async putBundle(bundle: SettingBundle | AdventureBundle, meta: BundleMeta): Promise<void> {
    const system = bundle.manifest.system;
    await this.db.query(
      `insert into bundles (kind, id, version, system, system_versions, publisher_id, draft_id, data, origin, listed)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [bundle.kind, bundle.id, bundle.version, system.id, system.versions, meta.publisher_id ?? null, meta.draft_id ?? null, JSON.stringify(bundle), meta.origin, meta.listed ?? true],
    );
  }

  async getBundle(kind: "setting" | "adventure", id: string, version: string): Promise<SettingBundle | AdventureBundle | undefined> {
    const { rows } = await this.db.query<{ data: SettingBundle | AdventureBundle }>("select data from bundles where kind = $1 and id = $2 and version = $3", [kind, id, version]);
    return rows[0]?.data;
  }

  async setListed(kind: string, id: string, version: string, listed: boolean): Promise<void> {
    await this.db.query("update bundles set listed = $4 where kind = $1 and id = $2 and version = $3", [kind, id, version, listed]);
  }

  // Instances ------------------------------------------------------------------------------------

  async createInstance(i: NewInstance): Promise<void> {
    await this.db.query(
      `insert into instances (id, campaign_id, name, system, system_version, modules, materials, seed)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [i.id, i.campaign_id, i.name, i.system, i.system_version, JSON.stringify(i.modules), JSON.stringify(i.materials), i.seed],
    );
  }

  async getInstance(id: string): Promise<InstanceRecord | undefined> {
    const { rows } = await this.db.query<InstanceRecord>(`select ${INSTANCE_COLUMNS} from instances where id = $1 and deleted_at is null`, [id]);
    return rows[0];
  }

  async setStatus(id: string, status: InstanceStatus): Promise<void> {
    await this.db.query("update instances set status = $2 where id = $1", [id, status]);
  }

  async addCharacter(instanceId: string, characterId: string, userId: string): Promise<void> {
    await this.db.query("insert into instance_characters (instance_id, character_id, user_id) values ($1, $2, $3)", [instanceId, characterId, userId]);
  }

  // Commits --------------------------------------------------------------------------------------

  /** Commits atomically; returns the new version, or throws VersionConflict. */
  async commit(c: CommitRequest): Promise<number> {
    try {
      const { rows } = await this.db.query<{ v: number }>("select cadmium_commit($1, $2, $3, $4, $5, $6, $7, $8, $9) as v", [
        c.instanceId,
        c.expectedVersion,
        JSON.stringify(c.state),
        JSON.stringify(c.events),
        JSON.stringify(c.input),
        c.inputLog?.id ?? null,
        c.inputLog?.outcome ?? null,
        c.status ?? null,
        c.ending ?? null,
      ]);
      return rows[0]!.v;
    } catch (e) {
      if ((e as { code?: string }).code === "CD409") throw new VersionConflict(c.instanceId, c.expectedVersion);
      throw e;
    }
  }

  /** Events after `afterVersion`, in seq order, at most `limit`. */
  async events(instanceId: string, afterVersion = 0, limit = 1000): Promise<StoredEvent[]> {
    const { rows } = await this.db.query<{ seq: number; version: number; actor_id: string | null; type: string; payload: Record<string, unknown> }>(
      "select seq, version, actor_id, type, payload from events where instance_id = $1 and version > $2 order by seq limit $3",
      [instanceId, afterVersion, limit],
    );
    return rows.map((r) => ({ seq: r.seq, version: r.version, actor_id: r.actor_id, event: { type: r.type, ...r.payload } }));
  }

  /** Every commit with its input and events, in version order: what replay needs. */
  async commits(instanceId: string): Promise<Commit[]> {
    const { rows } = await this.db.query<{ version: number; input: CommitInput }>("select version, input from commits where instance_id = $1 order by version", [instanceId]);
    const events = await this.events(instanceId, 0, 1_000_000);
    const byVersion = new Map<number, GameEvent[]>();
    for (const e of events) byVersion.set(e.version, [...(byVersion.get(e.version) ?? []), e.event]);
    return rows.map((r) => ({ version: r.version, input: r.input, events: byVersion.get(r.version) ?? [] }));
  }

  // Input log and narration ----------------------------------------------------------------------

  /** Records an input; returns false when the idempotency key was already used by the user in the instance. */
  async logInput(i: NewInputLog): Promise<boolean> {
    const { rows } = await this.db.query<{ id: string }>(
      `insert into input_logs (id, instance_id, user_id, idempotency_key, text, parser_context, tool_calls)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (instance_id, user_id, idempotency_key) do nothing
       returning id`,
      [i.id, i.instance_id, i.user_id, i.idempotency_key, i.text, JSON.stringify(i.parser_context ?? null), JSON.stringify(i.tool_calls ?? [])],
    );
    return rows.length === 1;
  }

  async rejectInput(id: string): Promise<void> {
    await this.db.query("update input_logs set outcome = 'rejected' where id = $1", [id]);
  }

  async inputByKey(instanceId: string, userId: string, key: string): Promise<{ id: string; outcome: string | null; version: number | null } | undefined> {
    const { rows } = await this.db.query<{ id: string; outcome: string | null; version: number | null }>(
      "select id, outcome, version from input_logs where instance_id = $1 and user_id = $2 and idempotency_key = $3",
      [instanceId, userId, key],
    );
    return rows[0];
  }

  async putNarration(instanceId: string, version: number, text: string, source: "model" | "template"): Promise<void> {
    await this.db.query("insert into narrations (instance_id, version, text, source) values ($1, $2, $3, $4) on conflict (instance_id, version) do nothing", [instanceId, version, text, source]);
  }
}
