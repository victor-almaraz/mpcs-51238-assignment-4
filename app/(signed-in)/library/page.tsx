// Library (app-flow.md, Route map: /library): the settings and adventures installed with Cadmium and the
// user's own published adventures, filtered by system, with what a campaign needs to know to choose
// them. A hub (docs/design/README.md, Page layouts): a system filter, then settings and adventures as
// rows. Campaigns choose from these in their editor's Materials tab.
import Link from "next/link";
import { BookOpen, Map as MapIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON, ICON_DENSE } from "@/components/ui/icon-button";
import { List, ListRow } from "@/components/ui/list";
import { Page, PageHeader, Section } from "@/components/ui/page";
import { listMaterials } from "@/lib/api/materials";
import { listSystems } from "@/lib/api/systems";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";
import { plural } from "@/lib/text";

const players = ([min, max]: [number, number]) => (min === max ? plural(min, "player") : `${min} to ${max} players`);

export default async function Library({ searchParams }: { searchParams: Promise<{ system?: string }> }) {
  const user = await pageUser();
  const store = serverStore();
  const systems = listSystems();
  const asked = (await searchParams).system;
  const system = systems.find((s) => s.id === asked);
  const [materials, own] = await Promise.all([listMaterials(store, user.id, system ? { system: system.id } : {}), listMaterials(store, user.id, { owner: "me", kind: "adventure" })]);
  const mine = new Set(own.map((m) => `${m.id}@${m.version}`));
  const settings = materials.filter((m) => m.kind === "setting");
  const adventures = materials.filter((m) => m.kind === "adventure");
  const settingTitle = new Map(settings.map((s) => [s.id, s.title]));
  const titleOf = (id: string) => systems.find((s) => s.id === id)?.title ?? id;
  const moduleTitle = (systemId: string, id: string) => systems.find((s) => s.id === systemId)?.modules.find((m) => m.id === id)?.title ?? id;
  const rules = (m: (typeof materials)[number]) => [`${titleOf(m.system)} ${m.system_versions}`, ...(m.modules.length > 0 ? [`needs ${m.modules.map((id) => moduleTitle(m.system, id)).join(", ")}`] : [])].join(" · ");

  return (
    <Page>
      <PageHeader
        title="Library"
        description="Settings and adventures installed with Cadmium, and the adventures you have published. A campaign plays one adventure with the settings it requires; choose them in the campaign's editor."
        actions={
          <ButtonLink href="/adventures" icon={<BookOpen {...ICON_DENSE} />}>
            My adventures
          </ButtonLink>
        }
      />
      <nav aria-label="Filter by system" className="-mt-2 mb-8 flex flex-wrap gap-2">
        {[{ id: undefined, title: "All systems" }, ...systems].map((s) => {
          const current = s.id === system?.id;
          return (
            <Link key={s.id ?? "all"} href={s.id ? `/library?system=${s.id}` : "/library"} aria-current={current ? "page" : undefined} className={buttonClass(current ? "primary" : "secondary", "sm")}>
              {s.title}
            </Link>
          );
        })}
      </nav>

      <Section id="adventures" title={`Adventures (${adventures.length})`} description={system ? `Adventures a ${system.title} campaign can play.` : undefined}>
        {adventures.length === 0 ? (
          <EmptyState
            icon={<BookOpen {...ICON} />}
            action={
              <ButtonLink href="/adventures/new" size="sm">
                Write an adventure
              </ButtonLink>
            }
          >
            No adventures{system ? ` for ${system.title}` : ""} yet.
          </EmptyState>
        ) : (
          <List>
            {adventures.map((m) => (
              <ListRow
                key={`${m.id}@${m.version}`}
                icon={<BookOpen {...ICON_DENSE} />}
                title={m.title}
                badge={
                  <>
                    <Badge tone="accent">{m.version}</Badge>
                    {mine.has(`${m.id}@${m.version}`) && <Badge>Yours</Badge>}
                  </>
                }
                meta={
                  <>
                    {"players" in m && players(m.players)} · {rules(m)}
                    {"requires_settings" in m && m.requires_settings.length > 0 && (
                      <>
                        <br />
                        Requires {m.requires_settings.map((r) => `${settingTitle.get(r.id) ?? r.id} ${r.versions}`).join(", ")}
                      </>
                    )}
                  </>
                }
              />
            ))}
          </List>
        )}
      </Section>

      <Section id="settings" title={`Settings (${settings.length})`} description="The worlds adventures take place in: places, creatures, items, and abilities.">
        {settings.length === 0 ? (
          <EmptyState icon={<MapIcon {...ICON} />}>No settings{system ? ` for ${system.title}` : ""} are installed.</EmptyState>
        ) : (
          <List>
            {settings.map((m) => (
              <ListRow key={`${m.id}@${m.version}`} icon={<MapIcon {...ICON_DENSE} />} title={m.title} badge={<Badge tone="accent">{m.version}</Badge>} meta={rules(m)} />
            ))}
          </List>
        )}
      </Section>
    </Page>
  );
}
