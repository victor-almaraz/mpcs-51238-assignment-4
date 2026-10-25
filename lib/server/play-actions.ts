"use server";
// Server actions for the play page: direct actions, the author's Advance, and the data a client
// refreshes after each commit.
import type { HistoryItem } from "../broadcast/sequencer";
import { advanceRound, getHistory, getInstance, submitAction, submitInput } from "../api/instances";
import { serverDeps } from "./coordinator";
import { attempt } from "./forms";

export async function actAction(input: { instance_id: string; character_id: string; tool: string; args: Record<string, unknown>; idempotency_key: string }): Promise<{ error: string | null }> {
  const r = await attempt((uid) => submitAction(serverDeps(), uid, input));
  return { error: "error" in r ? r.error : null };
}

export async function inputAction(input: { instance_id: string; character_id: string; text: string; idempotency_key: string }): Promise<{ error: string | null }> {
  const r = await attempt((uid) => submitInput(serverDeps(), uid, input));
  return { error: "error" in r ? r.error : null };
}

export async function advanceAction(instanceId: string): Promise<{ error: string | null }> {
  const r = await attempt((uid) => advanceRound(serverDeps(), uid, instanceId));
  return { error: "error" in r ? r.error : null };
}

export async function refreshAction(instanceId: string, characterId: string) {
  const r = await attempt((uid) => getInstance(serverDeps(), uid, { instance_id: instanceId, character_id: characterId }), { read: true });
  return "error" in r ? null : r.ok;
}

export async function historyAction(instanceId: string, afterVersion: number): Promise<HistoryItem[]> {
  const r = await attempt((uid) => getHistory(serverDeps().store, uid, { instance_id: instanceId, after_version: afterVersion, limit: 50 }), { read: true });
  return "error" in r ? [] : r.ok.items;
}
