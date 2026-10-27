"use server";
// Server actions for the play page: direct actions, the author's Advance, and the data a client
// refreshes after each commit.
import type { HistoryItem } from "../broadcast/sequencer";
import { actWithOutcome, advanceRound, getHistory, getInstance, inputWithOutcome, lobbyKey, pauseInstance } from "../api/instances";
import { serverDeps } from "./coordinator";
import { attempt } from "./forms";

/** A failed call's error, or a rejection: the call was accepted but nothing was committed. */
export type PlayResult = { error: string | null; rejected?: string };

export async function actAction(input: { instance_id: string; character_id: string; tool: string; args: Record<string, unknown>; idempotency_key: string }): Promise<PlayResult> {
  const r = await attempt((uid) => actWithOutcome(serverDeps(), uid, input));
  return "error" in r ? { error: r.error } : { error: null, rejected: r.ok.rejected };
}

export async function inputAction(input: { instance_id: string; character_id: string; text: string; idempotency_key: string }): Promise<PlayResult> {
  const r = await attempt((uid) => inputWithOutcome(serverDeps(), uid, input));
  return "error" in r ? { error: r.error } : { error: null, rejected: r.ok.rejected };
}

export async function advanceAction(instanceId: string): Promise<{ error: string | null }> {
  const r = await attempt((uid) => advanceRound(serverDeps(), uid, instanceId));
  return { error: "error" in r ? r.error : null };
}

/** The author's Pause: every player's page shows the game paused and returns to the lobby. */
export async function pauseAction(instanceId: string): Promise<{ error: string | null }> {
  const r = await attempt((uid) => pauseInstance(serverDeps(), uid, instanceId));
  return { error: "error" in r ? r.error : null };
}

/** What the lobby shows that others change: the status, the version, and the party. Null when the game cannot be read. */
export async function lobbyStateAction(instanceId: string): Promise<{ status: string; key: string } | null> {
  const r = await attempt((uid) => getInstance(serverDeps(), uid, { instance_id: instanceId }), { read: true });
  return "error" in r ? null : { status: r.ok.instance.status, key: lobbyKey(r.ok.instance) };
}

/** The instance and the character's view, with the current wait's deadline. */
export async function refreshAction(instanceId: string, characterId: string) {
  const deps = serverDeps();
  const r = await attempt(async (uid) => {
    const got = await getInstance(deps, uid, { instance_id: instanceId, character_id: characterId });
    return { ...got, deadline: (await deps.store.deadline(got.instance.id))?.toISOString() ?? null };
  }, { read: true });
  return "error" in r ? null : r.ok;
}

export async function historyAction(instanceId: string, afterVersion: number): Promise<HistoryItem[]> {
  const r = await attempt((uid) => getHistory(serverDeps().store, uid, { instance_id: instanceId, after_version: afterVersion, limit: 50 }), { read: true });
  return "error" in r ? [] : r.ok.items;
}
