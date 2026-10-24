import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Demo mode's in-memory Postgres (lib/server/demo-store.ts) loads from node_modules, not the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Screenshots in demo mode show no development badge.
  ...(process.env.CADMIUM_DEMO === "1" ? { devIndicators: false as const } : {}),
  // No analytics or tracking (app-flow.md, "Stack constraints"): Clerk's SDK telemetry is off.
  env: { NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED: "1" },
  // Hidden from search engines until launch, for every response, including API routes and files.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  // The HTTP binding's base path (api.md, Transport: /v1) is served by app/api/v1.
  async rewrites() {
    return [{ source: "/v1/:path*", destination: "/api/v1/:path*" }];
  },
  // Pages that read specification documents at request time ship those files with their functions.
  outputFileTracingIncludes: {
    "/terms": ["./legal/terms.md"],
    "/privacy": ["./legal/privacy.md"],
    "/attribution": ["./cadmium-spec/LICENSES.md", "./cadmium-spec/systems/*/NOTICE", "./materials/*/NOTICE"],
  },
};

export default config;
