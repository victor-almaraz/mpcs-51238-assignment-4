// Served at /terms from cadmium-spec/docs/legal/terms.md (app-flow.md, "Route map").
import { LegalOffline } from "@/components/legal-offline";
import { Markdown } from "@/components/markdown";
import { LEGAL_PUBLISHED } from "@/lib/legal";
import { specDocument } from "@/lib/spec";

export default function Page() {
  if (!LEGAL_PUBLISHED) return <LegalOffline title="Terms of Service" />;
  return <Markdown source={specDocument("docs/legal/terms.md")} />;
}
