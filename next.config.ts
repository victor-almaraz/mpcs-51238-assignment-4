import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Pages that read specification documents at request time ship those files with their functions.
  outputFileTracingIncludes: {
    "/terms": ["./cadmium-spec/docs/legal/terms.md"],
    "/privacy": ["./cadmium-spec/docs/legal/privacy.md"],
    "/attribution": ["./cadmium-spec/LICENSES.md", "./cadmium-spec/systems/*/NOTICE"],
  },
};

export default config;
