import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "node_modules/**", "cadmium-spec/**", "lib/bundle/types/**", "lib/bundle/schemas.generated.ts", "next-env.d.ts"] },
  ...next,
];

export default config;
