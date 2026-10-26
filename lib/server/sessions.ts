// A game's next session, for the pages that show it: the lobby, play's Paused banner, and the campaign
// overview.
import { DAY } from "../api/deletion";
import { listOccurrences } from "../api/schedules";
import type { Store } from "../store";


/** The game's first occurrence from `now` that is not cancelled, within list_occurrences' 92-day window. */
export async function nextOccurrence(store: Store, userId: string, instanceId: string, now: number) {
  const list = await listOccurrences(store, userId, { instance_id: instanceId, from: new Date(now).toISOString(), to: new Date(now + 92 * DAY).toISOString() });
  return list.find((o) => o.status !== "cancelled");
}
