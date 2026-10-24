// Shown at /terms and /privacy while the documents are being revised (lib/legal.ts).
import { FilePen } from "lucide-react";
import { ICON } from "./ui/icon-button";
import { Standalone } from "./ui/standalone";

export function LegalOffline({ title }: { title: string }) {
  return <Standalone icon={<FilePen {...ICON} />} title={title} description="This document is being revised and will be published again shortly." />;
}
