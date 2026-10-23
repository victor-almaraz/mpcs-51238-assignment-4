// Served at /privacy from cadmium-spec/docs/legal/privacy.md (app-flow.md, "Route map").
import { Markdown } from "@/components/markdown";
import { specDocument } from "@/lib/spec";

export default function Page() {
  return <Markdown source={specDocument("docs/legal/privacy.md")} />;
}
