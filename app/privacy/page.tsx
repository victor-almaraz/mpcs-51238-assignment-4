// Served at /privacy from legal/privacy.md (app-flow.md, "Route map").
import { LegalOffline } from "@/components/legal-offline";
import { Markdown } from "@/components/markdown";
import { LEGAL_PUBLISHED } from "@/lib/legal";
import { legalDocument } from "@/lib/spec";

export default function Page() {
  if (!LEGAL_PUBLISHED) return <LegalOffline title="Privacy Policy" />;
  return <Markdown source={legalDocument("privacy.md")} />;
}
