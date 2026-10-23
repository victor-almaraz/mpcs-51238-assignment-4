// Shared fixtures for operation tests: a store over PGlite with the example materials installed.

import type { AdventureBundle } from "../../bundle/adventure";
import type { SettingBundle } from "../../bundle/setting";
import { compileSetting } from "../../materials";
import { example } from "../../materials/testing/fixtures";
import { sunkenBundles } from "../../harness/scenarios";
import { MemoryBroadcaster } from "../../broadcast";
import { DEFAULT_TIMEOUTS, type Deps } from "../../coordinator/instance";
import { Store } from "../../store";
import { sqlRpc } from "../../store/sql-rpc";
import { testDb } from "../../store/testing/pglite";
import type { Entropy } from "../entropy";
import { ApiError } from "../errors";
import { TERMS_VERSION } from "../terms";

/** derelict_station with five more abilities, so a Quest character can choose six. */
export function richSetting(): SettingBundle {
  const extra = Array.from({ length: 5 }, (_, i) => `drill_${i}:\n  label: Drill ${i}\n  target: self\n  system_stats: { cost: { ap: 1 } }\n  effects: []\n`).join("");
  const files = new Map(example("derelict_station")).set("abilities/drills.yaml", extra);
  return compileSetting(files).bundle!;
}

export const SIX = ["base:overload", "base:drill_0", "base:drill_1", "base:drill_2", "base:drill_3", "base:drill_4"];

/** Deterministic entropy: ids and codes count up. */
export function entropy(): Entropy {
  let n = 0;
  return { seed: () => 42, id: (prefix) => `${prefix}_${++n}`, code: (length) => String(++n).padStart(length, "0") };
}

/** The error code an operation fails with, or "ok". */
export async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e.code;
    throw e;
  }
  return "ok";
}

/** A copy of a bundle under another id, version, or declared system. */
export function variant<B extends SettingBundle | AdventureBundle>(b: B, change: { id?: string; version?: string; system?: string; modules?: string[] }): B {
  const copy = structuredClone(b);
  if (change.id) copy.id = change.id;
  if (change.version) copy.version = change.version;
  if (change.system) copy.manifest.system.id = change.system as never;
  if (change.modules) copy.manifest.system.modules = change.modules;
  return copy;
}

/** A store with the rich derelict_station and sunken_archive installed, and users who accepted the terms. */
export async function world(users: string[]) {
  const db = await testDb();
  const store = new Store(sqlRpc(db));
  await store.putBundle(richSetting(), { origin: "operator" });
  await store.putBundle(sunkenBundles().adventure, { origin: "operator" });
  for (const id of users) {
    await store.upsertUser({ id, email: `${id}@example.org`, display_name: id.replace(/^user_/, "").toUpperCase(), terms_accepted_at: null });
    await store.acceptTerms(id, TERMS_VERSION);
  }
  const broadcast = new MemoryBroadcaster();
  const clock = { now: new Date("2026-10-22T18:00:00Z") };
  const deps: Deps = { store, broadcast, now: () => clock.now, timeouts: DEFAULT_TIMEOUTS };
  return { db, store, deps, broadcast, clock };
}

export const SUNKEN = [
  { kind: "setting", id: "derelict_station", version: "3.0.0" },
  { kind: "adventure", id: "sunken_archive", version: sunkenBundles().adventure.version },
] as const;
