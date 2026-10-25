// Rate limits (api.md, Rate limits), shared by the HTTP binding and the server actions.

/** Requests per user per minute for every operation; deployment-configurable. */
export const RATE_LIMIT = { window_seconds: 60, limit: 120 };
