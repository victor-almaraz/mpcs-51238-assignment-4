// Server configuration from the environment. Each value is read when first needed and fails early,
// naming the missing variable, never its value. Server-only: secrets never reach the client bundle.

const NAMES = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabasePublishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
} as const;

export type Setting = keyof typeof NAMES;

export class ConfigError extends Error {}

/** The named setting; throws ConfigError when it is unset or empty. */
export function setting(name: Setting): string {
  const variable = NAMES[name];
  const value = process.env[variable];
  if (value === undefined || value.trim() === "") throw new ConfigError(`${variable} is not set`);
  return value;
}

/** Which settings are present, without their values. */
export function configured(): Record<Setting, boolean> {
  return Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [k, (process.env[v] ?? "").trim() !== ""])) as Record<Setting, boolean>;
}
