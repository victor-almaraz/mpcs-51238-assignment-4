// Schema registry: every schema of the specification in one Ajv2020 instance
// (AGENTS.md, Setup step 3; spec/README.md, "All schemas share the base URI").
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { SCHEMAS, SCHEMA_BASE } from "./schemas.generated";

export type { ErrorObject };

export function createRegistry(): Ajv2020 {
  // strictRequired is off: the schemas use `not: { required: [a, b] }` to forbid combining two
  // properties, which is valid 2020-12 that Ajv's lint rejects.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  for (const schema of Object.values(SCHEMAS)) ajv.addSchema(schema);
  return ajv;
}

let shared: Ajv2020 | undefined;

/** The process-wide registry; schemas compile once on first use. */
export function registry(): Ajv2020 {
  return (shared ??= createRegistry());
}

/** Resolves a schema name relative to the base URI, e.g. `manifest.schema.json` or `systems/quest/creature.schema.json`. */
export function schemaId(name: string): string {
  return new URL(name, SCHEMA_BASE).href;
}

export function validator(name: string): ValidateFunction {
  const fn = registry().getSchema(schemaId(name));
  if (!fn) throw new Error(`unknown schema ${name}`);
  return fn;
}
