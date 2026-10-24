// The demo store (lib/server/demo.ts): an in-memory Postgres with every migration applied and the
// demo world seeded, opened on first use and kept across hot reloads. Loaded only in demo mode.

import type { DemoWorld } from "../demo/seed";
import type { Rpc } from "../store";

type Demo = { rpc: Rpc; world: DemoWorld };
type Global = typeof globalThis & { __cadmiumDemo?: Promise<Demo> };

async function open(): Promise<Demo> {
  const [{ testDb }, { sqlRpc }, { Store }, { seedDemo }] = await Promise.all([import("../store/testing/pglite"), import("../store/sql-rpc"), import("../store"), import("../demo/seed")]);
  const db = await testDb();
  const rpc = sqlRpc(db);
  const world = await seedDemo(new Store(rpc));
  await db.query("update users set operator = true where id = 'user_demo'");
  return { rpc, world };
}

const demo = () => ((globalThis as Global).__cadmiumDemo ??= open());

/** The seeded world's ids, for the demo index. */
export async function demoWorld(): Promise<DemoWorld> {
  return (await demo()).world;
}

export function demoRpc(): Rpc {
  return {
    async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      return (await demo()).rpc.call<T>(fn, args);
    },
  };
}
