// Licences and attributions (app-flow.md, "Route map", /attribution): LICENSES.md, each rules
// system's NOTICE, including Quest as the source of Cadmium, and the notices of material packs
// shipped with this application, and the interface's fonts and icons.
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

const link = "font-medium text-accent underline";

/** The interface's typeface and icons. */
function FontsAndIcons() {
  return (
    <section aria-labelledby="fonts-and-icons">
      <h2 id="fonts-and-icons" className="mt-10 border-t border-rule pt-6 text-section font-semibold text-ink">
        Fonts and icons
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-rule bg-page p-4">
          <dt className="text-heading font-semibold text-ink">
            <span className="font-prose">Libertinus Serif</span> 7.051
          </dt>
          <dd className="mt-1 flex flex-col gap-1 text-caption text-muted">
            <span>Regular, Italic, and Semibold, served by this site, for story text.</span>
            <span>
              From{" "}
              <a href="https://github.com/alerque/libertinus" className={link}>
                github.com/alerque/libertinus
              </a>
              , under the SIL Open Font License 1.1.{" "}
              <a href="/fonts/OFL.txt" className={link}>
                Read the licence
              </a>
              .
            </span>
          </dd>
        </div>
        <div className="rounded-card border border-rule bg-page p-4">
          <dt className="text-heading font-semibold text-ink">Lucide icons</dt>
          <dd className="mt-1 flex flex-col gap-1 text-caption text-muted">
            <span>The interface icons.</span>
            <span>
              From{" "}
              <a href="https://lucide.dev" className={link}>
                lucide.dev
              </a>
              , under the ISC licence.
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default async function Attribution() {
  const credits = await assetCredits();
  const notices = ["quest", "cadmium"].map((id) => `## Rules data: ${id}\n\n${specDocument(`systems/${id}/NOTICE`)}`);
  return (
    <Markdown source={[specDocument("LICENSES.md"), ...notices, `## Setting: Quest Quick Start\n\n${packNotice()}`, credits].join("\n\n")}>
      <FontsAndIcons />
    </Markdown>
  );
}
