// Operation errors (api.md, "Error codes").

export type ApiErrorCode = "unauthenticated" | "forbidden" | "not_found" | "conflict" | "system_mismatch" | "invalid_request" | "rules_rejected" | "rate_limited" | "unavailable";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly detail: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(`${code}: ${detail}`);
  }

  toJSON(): { error: Record<string, unknown> } {
    return { error: { code: this.code, detail: this.detail, ...this.extra } };
  }
}

/** Rejects fields a request does not define (api.md, Conventions: unknown fields are invalid_request). */
export function onlyFields(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ApiError("invalid_request", "the request must be an object");
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new ApiError("invalid_request", `unknown field '${key}'`);
  }
  return input as Record<string, unknown>;
}
