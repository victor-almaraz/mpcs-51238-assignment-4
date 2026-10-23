// Phase 0 exit criterion (AGENTS.md): every schema passes the 2020-12 meta-schema, every example
// file validates against its schema (spec/README.md), and every documentation YAML block that is a
// complete pack file validates against its schema.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { createRegistry, validator } from "@/lib/bundle/registry";
import { SCHEMAS } from "@/lib/bundle/schemas.generated";
import { anyLayoutEntry } from "@/lib/materials/layout";
import { docPackFiles } from "./doc-blocks";

const SPEC = fileURLToPath(new URL("../cadmium-spec", import.meta.url));

// YAML 1.2 core schema: only true and false are booleans (AGENTS.md, Conventions).
const readYaml = (source: string): unknown => parse(source, { schema: "core", version: "1.2" });

function filesUnder(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? filesUnder(path) : [path];
    });
}

function errorsOf(schema: string, data: unknown): string[] {
  const validate = validator(schema);
  if (validate(data)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""} ${JSON.stringify(e.params)}`);
}

describe("schemas", () => {
  const ajv = createRegistry();
  it.each(Object.keys(SCHEMAS))("%s passes the 2020-12 meta-schema", (id) => {
    expect(ajv.validateSchema(SCHEMAS[id]!)).toBe(true);
    expect(ajv.getSchema(id)).toBeDefined();
  });
});

describe("spec/examples", () => {
  const root = join(SPEC, "spec/examples");
  const files = readdirSync(root)
    .sort()
    .flatMap((pack) => filesUnder(join(root, pack)).map((path) => ({ pack, rel: relative(join(root, pack), path) })));

  it("has example packs", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("$pack/$rel validates against its schema", ({ pack, rel }) => {
    const entry = anyLayoutEntry(rel);
    expect(entry, `${rel} is not part of the pack layout`).toBeDefined();
    const data = readYaml(readFileSync(join(root, pack, rel), "utf8"));
    expect(errorsOf(entry!.schema, data)).toEqual([]);
  });
});

describe("documentation YAML blocks", () => {
  const blocks = docPackFiles(SPEC);

  it("finds complete pack files in the documentation", () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  it.each(blocks)("$doc:$line ($file) validates against its schema", ({ file, source }) => {
    const entry = anyLayoutEntry(file!.replace("*", "doc"));
    expect(entry, `${file} is not part of the pack layout`).toBeDefined();
    expect(errorsOf(entry!.schema, readYaml(source))).toEqual([]);
  });
});
