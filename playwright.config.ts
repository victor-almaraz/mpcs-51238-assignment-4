// End-to-end tests (assignment brief, step 7): real Clerk sign-in against `next dev`, which reads the
// keys in .env.local. They write to the Supabase project those keys name.
//   pnpm e2e
import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// The test process needs the Clerk keys too, for the testing token and the test users.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", trace: "retain-on-failure" },
  webServer: { command: `pnpm exec next dev --port ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 240_000 },
});
