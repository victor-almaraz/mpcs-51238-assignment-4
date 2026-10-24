// Served at /terms from legal/terms.md (app-flow.md, "Route map").
import { LegalOffline } from "@/components/legal-offline";
import { Markdown } from "@/components/markdown";
import { LEGAL_PUBLISHED } from "@/lib/legal";
import { legalDocument } from "@/lib/spec";

export default function Page() {
  if (!LEGAL_PUBLISHED) return <LegalOffline title="Terms of Service" />;
  return <Markdown source={legalDocument("terms.md")} />;
}
