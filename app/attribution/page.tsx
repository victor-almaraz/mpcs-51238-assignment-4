// Licences and attributions (app-flow.md, "Route map", /attribution): LICENSES.md, each rules
// system's NOTICE, including Quest as the source of Cadmium, and the notices of material packs
// shipped with this application.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Markdown } from "@/components/markdown";
import { specDocument } from "@/lib/spec";
import { configured } from "@/lib/server/env";
import { serverStore } from "@/lib/server/supabase";

/** The credit of every shipped pack asset (app-flow.md, Route map: /attribution). */
async function assetCredits(): Promise<string> {
  const s = configured();
  if (!s.supabaseUrl || !s.supabaseServiceRoleKey) return "";
  const credits = await serverStore()
    .packCredits()
    .catch(() => []);
  if (credits.length === 0) return "";
  const rows = credits.map((c) => `| ${c.alt.replace(/\|/g, "/")} | ${c.bundle_refs.map((r) => r.bundle_id).join(", ")} | ${c.license} | ${(c.credit ?? "").replace(/\|/g, "/")} |`);
  return ["## Pack art", "", "| Asset | Packs | Licence | Credit |", "|---|---|---|---|", ...rows].join("\n");
}

// A literal path, so the build traces only this file.
const packNotice = () => readFileSync(join(process.cwd(), "materials", "quest_starter", "NOTICE"), "utf8");

export default async function Attribution() {
  const credits = await assetCredits();
  const notices = ["quest", "cadmium"].map((id) => `## Rules data: ${id}\n\n${specDocument(`systems/${id}/NOTICE`)}`);
  return <Markdown source={[specDocument("LICENSES.md"), ...notices, `## Setting: Quest Quick Start\n\n${packNotice()}`, credits].join("\n\n")} />;
}
