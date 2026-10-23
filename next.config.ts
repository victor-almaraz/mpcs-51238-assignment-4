import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // No analytics or tracking (app-flow.md, "Stack constraints"): Clerk's SDK telemetry is off.
  env: { NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED: "1" },
  // Hidden from search engines until launch, for every response, including API routes and files.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  // Pages that read specification documents at request time ship those files with their functions.
  outputFileTracingIncludes: {
    "/terms": ["./cadmium-spec/docs/legal/terms.md"],
    "/privacy": ["./cadmium-spec/docs/legal/privacy.md"],
    "/attribution": ["./cadmium-spec/LICENSES.md", "./cadmium-spec/systems/*/NOTICE"],
  },
};

export default config;
