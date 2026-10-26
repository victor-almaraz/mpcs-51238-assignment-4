// The stages of a deleted campaign, character, or draft (data-model.md, Deletion): restorable for 30
// days, erased by the daily purge after 90.

const DAY = 86_400_000;

/** The record with the last moment it can be restored and the moment by which it is erased. */
export function withStages<T extends { deleted_at: string }>(r: T): T & { restorable_until: string; erased_by: string } {
  const at = Date.parse(r.deleted_at);
  return { ...r, restorable_until: new Date(at + 30 * DAY).toISOString(), erased_by: new Date(at + 90 * DAY).toISOString() };
}
