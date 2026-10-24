// Licences and attributions (app-flow.md, "Route map", /attribution): LICENSES.md, each rules
// system's NOTICE, including Quest as the source of Cadmium, and the notices of material packs
// shipped with this application.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Markdown } from "@/components/markdown";
import { specDocument } from "@/lib/spec";

// A literal path, so the build traces only this file.
const packNotice = () => readFileSync(join(process.cwd(), "materials", "quest_starter", "NOTICE"), "utf8");

export default function Attribution() {
  const notices = ["quest", "cadmium"].map((id) => `## Rules data: ${id}\n\n${specDocument(`systems/${id}/NOTICE`)}`);
  return <Markdown source={[specDocument("LICENSES.md"), ...notices, `## Setting: Quest Quick Start\n\n${packNotice()}`].join("\n\n")} />;
}
