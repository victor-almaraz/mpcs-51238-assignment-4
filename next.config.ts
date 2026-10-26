import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Demo mode's in-memory Postgres (lib/server/demo-store.ts) loads from node_modules, not the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Screenshots in demo mode show no development badge.
  ...(process.env.CADMIUM_DEMO === "1" ? { devIndicators: false as const } : {}),
  // No analytics or tracking (app-flow.md, "Stack constraints"): Clerk's SDK telemetry is off.
  env: { NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED: "1" },
  // A portrait may be 1 MB (lib/api/assets.ts); the multipart form around it needs room beyond that.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // Hidden from search engines until launch, for every response, including API routes and files. No
  // page may be framed, no response is sniffed as another type, and invite and feed codes in paths
  // never leave the site in a Referer.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Assets carry their own sandboxing policy (lib/api/http.ts), which this would replace.
      { source: "/((?!v1/assets/|api/v1/assets/).*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] },
    ];
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
    "/characters/new": ["./materials/*/descriptions.yaml", "./materials/*/pack/manifest.yaml", "./cadmium-spec/spec/examples/*/manifest.yaml"],
    "/characters/[id]": ["./materials/*/descriptions.yaml", "./materials/*/pack/manifest.yaml", "./cadmium-spec/spec/examples/*/manifest.yaml"],
  },
};

export default config;
