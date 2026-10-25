"use client";
// Monaco with monaco-yaml for the editor's Edit as YAML view (app-flow.md, Adventure editor: Sections):
// schema completion, hover, and marked syntax and schema errors, from the specification's schemas.
// Loaded on demand by YamlPanel; nothing here runs on the server. monaco-editor stays on 0.55, whose
// package exports still expose the editor worker file monaco-yaml's worker imports, and
// patches/monaco-worker-manager@2.0.1.patch passes Monaco the worker as createWebWorker expects.
import * as monaco from "monaco-editor";
import { configureMonacoYaml } from "monaco-yaml";
import { useEffect, useRef } from "react";
import { SCHEMAS } from "@/lib/bundle/schemas.generated";

const BASE = "https://schema.dungeon-crawler.invalid/v1/";

/** The draft's sections, each a key of draft.schema.json, and a single location. */
export type YamlFile = "adventure" | "flags" | "arcs" | "locations" | "npcs" | "entities" | "location";

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  window.MonacoEnvironment = {
    getWorker: (_id, label) =>
      label === "yaml"
        ? new Worker(new URL("monaco-yaml/yaml.worker", import.meta.url), { type: "module" })
        : new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), { type: "module" }),
  };
  const section = (file: Exclude<YamlFile, "location">) => ({ uri: `${BASE}editor/${file}.json`, fileMatch: [`**/${file}.yaml`], schema: { $ref: `${BASE}draft.schema.json#/properties/${file}` } });
  configureMonacoYaml(monaco, {
    enableSchemaRequest: false,
    validate: true,
    completion: true,
    hover: true,
    schemas: [
      // Referenced schemas match no file of their own.
      ...Object.entries(SCHEMAS).map(([uri, schema]) => ({ uri, fileMatch: [], schema: schema as never })),
      ...(["adventure", "flags", "arcs", "locations", "npcs", "entities"] as const).map(section),
      { uri: `${BASE}editor/location.json`, fileMatch: ["**/location.yaml"], schema: { $ref: `${BASE}location.schema.json` } },
    ],
  });
}

const dark = () => {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

let models = 0;

/** A YAML editor bound to `value`; `onChange` receives every edit. */
export default function YamlEditor({ value, onChange, file, label, invalid }: { value: string; onChange: (text: string) => void; file: YamlFile; label: string; invalid?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  useEffect(() => {
    configure();
    // A distinct model path per mount; the file name selects the schema.
    const model = monaco.editor.createModel(value, "yaml", monaco.Uri.parse(`inmemory://draft/${++models}/${file}.yaml`));
    const e = monaco.editor.create(host.current!, {
      model,
      ariaLabel: label,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      insertSpaces: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 14,
      lineHeight: 20,
      theme: dark() ? "vs-dark" : "vs",
      quickSuggestions: { other: true, comments: false, strings: true },
    });
    editor.current = e;
    const sub = model.onDidChangeContent(() => changed.current(model.getValue()));
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const retheme = () => monaco.editor.setTheme(dark() ? "vs-dark" : "vs");
    const observer = new MutationObserver(retheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    scheme.addEventListener("change", retheme);
    return () => {
      scheme.removeEventListener("change", retheme);
      observer.disconnect();
      sub.dispose();
      e.dispose();
      model.dispose();
      editor.current = null;
    };
    // The editor owns its text after mount; YamlPanel remounts it with a key to load another value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, label]);

  return <div ref={host} data-invalid={invalid || undefined} className="h-[32rem] min-h-0 w-full overflow-hidden rounded-card border border-border data-[invalid]:border-danger" />;
}
