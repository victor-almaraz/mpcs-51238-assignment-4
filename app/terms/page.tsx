// Served at /terms from cadmium-spec/docs/legal/terms.md (app-flow.md, "Route map").
import { Markdown } from "@/components/markdown";
import { specDocument } from "@/lib/spec";

export default function Page() {
  return <Markdown source={specDocument("docs/legal/terms.md")} />;
}
