// Licences and attributions (app-flow.md, "Route map", /attribution): LICENSES.md and each rules
// system's NOTICE, including Quest as the source of Cadmium.
import { Markdown } from "@/components/markdown";
import { specDocument } from "@/lib/spec";

export default function Attribution() {
  const notices = ["quest", "cadmium"].map((id) => `## Rules data: ${id}\n\n${specDocument(`systems/${id}/NOTICE`)}`);
  return <Markdown source={[specDocument("LICENSES.md"), ...notices].join("\n\n")} />;
}
