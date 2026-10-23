import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // PGlite starts a WebAssembly Postgres per test file, which takes several seconds on the first test.
  test: { include: ["lib/**/*.test.ts", "tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});
