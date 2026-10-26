// Paged lists (api.md, Pagination): `limit` 1 to 100, 20 by default, and `cursor`, the id of the last
// item of the previous page.

import { ApiError } from "./errors";

/** The page a list request asks for. Fetch `limit + 1` rows after `cursor`, and pass them to `paged`. */
export function pageOf(req: Record<string, unknown>): { limit: number; cursor: string | undefined } {
  const limit = req.limit === undefined ? 20 : req.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError("invalid_request", "limit must be 1 to 100");
  if (req.cursor !== undefined && typeof req.cursor !== "string") throw new ApiError("invalid_request", "cursor must be a string");
  return { limit, cursor: req.cursor };
}

/** The first `limit` of `rows` as items, and the next page's cursor when there are more. */
export function paged<T extends { id: string }, V>(rows: T[], limit: number, view: (row: T) => V): { items: V[]; next_cursor: string | null } {
  const items = rows.slice(0, limit);
  return { items: items.map(view), next_cursor: rows.length > limit ? items.at(-1)!.id : null };
}
