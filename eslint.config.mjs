import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "node_modules/**", "docs/spec/**", "lib/bundle/types/**", "lib/bundle/schemas.generated.ts", "next-env.d.ts"] },
  ...next,
];

export default config;
