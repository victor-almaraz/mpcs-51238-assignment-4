"use client";
// Quest's creation form and sheet view (app-flow.md, Character creation and editor; docs/design/README.md,
// Character creation): titled steps that can be revisited (System, Campaign, Role, Abilities counted
// against six, Name and description) beside a summary card with a Change link per choice and the Create
// button. A chosen campaign limits the abilities to its settings (SPEC_ISSUES.md#creation-chosen-campaign).
// With `rebuild`, the same form changes an unplayed character's choices (SPEC_ISSUES.md#character-rebuild).
import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useFormAction } from "@/components/form-action";
import type { AbilityOption } from "@/lib/api/characters";
import { abilitiesFor, chosenCampaign, quickStartFor, type CampaignChoice } from "@/lib/systems/creation";
import { createCharacterAction, rebuildCharacterAction } from "@/lib/server/actions";
import type { FormState } from "@/lib/server/forms";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Choice, Field, Select, TextInput, described } from "@/components/ui/field";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { DescriptionList } from "@/components/ui/list";
import { Notice } from "@/components/ui/notice";
import { WithAside } from "@/components/ui/page";
import { WithInfo } from "@/components/ui/with-info";
import { AbilityDetails, roleSummary, RulesPrimer } from "./ability-info";

export interface CreationProps {
  system: string;
  roles: string[];
  abilities: AbilityOption[];
  count: number;
  /** The caller's campaigns whose games take this system's characters. */
  campaigns?: CampaignChoice[];
  /** The campaign chosen on arrival, such as from a campaign's page. */
  campaign?: string;
  /** The chosen system's title and credit line, for the System step and the summary. */
  systemTitle?: string;
  systemCredit?: string;
  /** Where Change leads for the system: the system choice. */
  systemHref?: string;
  /** The system's starting hit points and AP, for the new-player notes. */
  hp?: number;
  ap?: number;
  /** An existing, unplayed character whose choices the form changes instead of creating one. */
  rebuild?: { id: string; name: string; role: string; abilities: string[]; manner?: string; look?: string };
}

/** A choice in the summary card, with the step that changes it. */
interface SummaryRow {
  label: string;
  value: ReactNode;
  href: string;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A titled, numbered step of the creation page; Change links in the summary lead to its id. */
export function CreationStep({ n, id, title, done, status, children }: { n: number; id: string; title: string; done: boolean; status?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rounded-card border border-rule bg-page p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={`${id}-title`} className="flex items-center gap-3 text-heading font-semibold text-ink">
          <span aria-hidden="true" className={done ? "inline-flex size-7 items-center justify-center rounded-full bg-accent text-page" : "inline-flex size-7 items-center justify-center rounded-full border border-border text-label text-muted"}>
            {done ? <Check {...ICON_DENSE} /> : n}
          </span>
          <span>
            <span className="sr-only">Step {n}: </span>
            {title}
          </span>
        </h2>
        {status ?? (done ? <Badge tone="success">Done</Badge> : <Badge>To do</Badge>)}
      </div>
      {children}
    </section>
  );
}

/**
 * Quest's form. `campaignDetails` adds a derived system's notes on the chosen campaign, such as the
 * fields its modules add; they carry no `name`, so `create_character` receives only Quest's choices.
 */
export function QuestCreationForm({ system, roles, abilities: all, count, campaigns = [], campaign: initialCampaign, systemTitle, systemCredit, systemHref = "/characters/new", hp = 10, ap = 10, rebuild, campaignDetails }: CreationProps & { campaignDetails?: (c: CampaignChoice) => ReactNode }) {
  const [state, form, pending] = useFormAction<FormState>(rebuild ? rebuildCharacterAction : createCharacterAction, { error: null });
  const [name, setName] = useState(rebuild?.name ?? "");
  const [role, setRole] = useState(rebuild?.role ?? "");
  const [chosen, setChosen] = useState<string[]>(rebuild?.abilities ?? []);
  const [campaignId, setCampaignId] = useState(chosenCampaign(campaigns, initialCampaign)?.id ?? "");
  const campaign = chosenCampaign(campaigns, campaignId);
  // With a campaign chosen, only its settings' abilities, so the character can join its games.
  const abilities = abilitiesFor(all, campaign);
  function chooseCampaign(id: string) {
    setCampaignId(id);
    const offered = new Set(abilitiesFor(all, chosenCampaign(campaigns, id)).map((a) => a.ref));
    setChosen((c) => c.filter((r) => offered.has(r)));
  }
  // Roles are informational (systems/quest.md, Character creation): matching abilities come first.
  const suited = role ? abilities.filter((a) => a.roles.includes(role)) : [];
  const others = role ? abilities.filter((a) => !a.roles.includes(role)) : abilities;
  const left = Math.max(0, count - chosen.length);
  const missing = [
    name.trim() === "" && "a name",
    role === "" && "a role",
    chosen.length < count && `${count - chosen.length} more abilit${count - chosen.length === 1 ? "y" : "ies"}`,
  ].filter(Boolean) as string[];
  const short = abilities.length < count;
  const toggle = (ref: string) => setChosen((c) => (c.includes(ref) ? c.filter((r) => r !== ref) : [...c, ref]));
  // The role's quick start: one setting's abilities for this role alone, when it has exactly `count`.
  const quickStart = role ? quickStartFor(role, abilities, count) : [];
  const label = new Map(all.map((a) => [a.ref, a.label]));
  const muted = (s: string) => <span className="text-muted">{s}</span>;

  const abilityChoices = (list: AbilityOption[]) => (
    <ul className="grid items-start gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((a) => (
        <li key={a.ref}>
          <WithInfo label={`About ${a.label}`} info={<AbilityDetails a={a} />}>
            <Choice name="abilities" value={a.ref} checked={chosen.includes(a.ref)} onChange={() => toggle(a.ref)} disabled={!chosen.includes(a.ref) && chosen.length >= count} label={a.label} className="has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60" />
          </WithInfo>
        </li>
      ))}
    </ul>
  );
  /** Abilities grouped under the setting that supplies them, instead of a source line on each. */
  const bySetting = (list: AbilityOption[], Heading: "h3" | "h4") => {
    const groups = new Map<string, AbilityOption[]>();
    for (const a of list) groups.set(a.setting, [...(groups.get(a.setting) ?? []), a]);
    return [...groups].map(([setting, items]) => (
      <div key={setting}>
        <Heading className="mb-1 text-label font-medium text-muted">{setting}</Heading>
        {abilityChoices(items)}
      </div>
    ));
  };
  // Until a role is chosen, or while one of them is chosen, the other abilities are open.
  const othersOpen = !role || others.some((a) => chosen.includes(a.ref));

  const rows: SummaryRow[] = [
    { label: "System", value: systemTitle ?? system, href: systemHref },
    { label: "Role", value: role ? sentence(role) : muted("Not chosen"), href: "#step-role" },
    { label: "Abilities", value: chosen.length === 0 ? muted(`None of ${count}`) : `${chosen.map((r) => label.get(r) ?? r).join(", ")} (${chosen.length} of ${count})`, href: "#step-abilities" },
    { label: "Name", value: name.trim() || muted("Not given"), href: "#step-name" },
  ];
  if (campaigns.length > 0) rows.splice(1, 0, { label: "Campaign", value: campaign?.title ?? "Any campaign", href: "#step-campaign" });
  // Steps are numbered in order; the Campaign step appears only with campaigns to choose from.
  let step = 0;
  const next = () => ++step;

  return (
    <form {...form}>
      <input type="hidden" name="system" value={system} />
      {rebuild && <input type="hidden" name="character_id" value={rebuild.id} />}
      <WithAside
        aside={
          <div className="flex flex-col gap-4 rounded-card border border-rule bg-page p-4 lg:sticky lg:top-[calc(var(--size-topbar)+24px)]">
            <h2 className="text-heading font-semibold text-ink">Summary</h2>
            <dl className="flex flex-col divide-y divide-rule">
              {rows.map((r) => (
                <div key={r.label} className="flex items-start justify-between gap-3 py-2 first:pt-0">
                  <div className="min-w-0">
                    <dt className="text-label font-medium text-muted">{r.label}</dt>
                    <dd className="break-words text-ink">{r.value}</dd>
                  </div>
                  <a href={r.href} className="shrink-0 text-label font-medium text-accent hover:underline">
                    Change<span className="sr-only"> {r.label.toLowerCase()}</span>
                  </a>
                </div>
              ))}
            </dl>
            {state.error && (
              <Notice tone="danger" live>
                {state.error}
              </Notice>
            )}
            <Button type="submit" variant="primary" disabled={missing.length > 0 || pending} aria-describedby={missing.length > 0 ? "creation-missing" : undefined} className="w-full">
              {rebuild ? (pending ? "Saving…" : "Save role and abilities") : pending ? "Creating…" : "Create character"}
            </Button>
            {missing.length > 0 && (
              <p id="creation-missing" className="text-caption text-muted">
                Choose {missing.join(", ")}.
              </p>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <CreationStep n={next()} id="step-system" title="System" done>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-heading font-semibold text-ink">{systemTitle ?? system}</p>
                {systemCredit && <p className="text-caption text-muted">{systemCredit}</p>}
                {rebuild && <p className="text-caption text-muted">An existing character keeps its system.</p>}
              </div>
              {!rebuild && (
                <ButtonLink href={systemHref} size="sm" className="self-start">
                  Change system
                </ButtonLink>
              )}
            </div>
          </CreationStep>

          {campaigns.length > 0 && (
            <CreationStep n={next()} id="step-campaign" title="Campaign" done>
              <div className="flex max-w-form flex-col gap-4">
                <Field id="creation-campaign" label="Campaign" hint="Offers only the abilities of the campaign's settings, so the character can join its games. The character is not tied to it." optional>
                  <Select {...described("creation-campaign", { hint: true })} name="campaign" value={campaignId} onChange={(e) => chooseCampaign(e.target.value)}>
                    <option value="">Any campaign</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                {campaign && <p className="text-caption text-muted">{campaign.settings.length > 0 ? `Its settings: ${campaign.settings.map((x) => x.title).join(", ")}.` : `${campaign.title} has no settings.`}</p>}
                {campaign && campaignDetails?.(campaign)}
              </div>
            </CreationStep>
          )}

          <CreationStep n={next()} id="step-role" title="Role" done={role !== ""}>
            <WithInfo label={`New to ${systemTitle ?? sentence(system)}? The rules in brief`} info={<RulesPrimer hp={hp} ap={ap} count={count} cadmium={system === "cadmium"} />} className="mb-3">
              <p id="step-role-hint" className="pt-2 text-caption text-muted">
                The role puts its abilities first in the next step; any ability can still be chosen.
              </p>
            </WithInfo>
            <div role="radiogroup" aria-labelledby="step-role-title" aria-describedby="step-role-hint" className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {roles.map((r) => (
                <WithInfo key={r} label={`About the ${r}`} info={roleSummary(r, abilities)} className="rounded-control border border-rule px-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <Choice type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} label={sentence(r)} />
                </WithInfo>
              ))}
            </div>
          </CreationStep>

          <CreationStep
            n={next()}
            id="step-abilities"
            title="Abilities"
            done={chosen.length === count}
            status={
              <span aria-live="polite" className="text-label font-medium text-ink tabular">
                {chosen.length} of {count} chosen
                <span className="text-muted"> · {left === 0 ? "none left" : `${left} left`}</span>
              </span>
            }
          >
            <div role="group" aria-labelledby="step-abilities-title" className="flex flex-col gap-4">
              {(quickStart.length === count || chosen.length >= count) && (
                <div className="flex flex-wrap items-center gap-3">
                  {quickStart.length === count && (
                    <Button size="sm" onClick={() => setChosen(quickStart)}>
                      Use the {role} quick start
                    </Button>
                  )}
                  {chosen.length >= count && <p className="text-caption text-muted">All {count} are chosen. Clear one to pick another.</p>}
                </div>
              )}
              {short && (
                <Notice tone="warning">
                  {campaign
                    ? `${campaign.title}'s settings offer ${abilities.length} abilit${abilities.length === 1 ? "y" : "ies"}; a character needs ${count}. Its author can add a setting with abilities under Materials, or choose Any campaign.`
                    : `The installed settings offer ${abilities.length} abilit${abilities.length === 1 ? "y" : "ies"}; this system needs ${count}.`}
                </Notice>
              )}
              {!role && <p className="text-caption text-muted">Choose a role to see the abilities suggested for it first.</p>}
              {suited.length > 0 && (
                <div>
                  <h3 className="mb-1 text-label font-medium text-muted">Suggested for the {role}</h3>
                  {abilityChoices(suited)}
                </div>
              )}
              {suited.length > 0 ? (
                <details open={othersOpen} className="group rounded-card border border-rule">
                  <summary className="flex min-h-10 cursor-pointer items-center gap-2 px-3 text-label font-semibold text-ink">
                    <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                      ›
                    </span>
                    Other abilities ({others.length})
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-rule px-3 py-3">{bySetting(others, "h4")}</div>
                </details>
              ) : (
                <div className="flex flex-col gap-3">{bySetting(others, "h3")}</div>
              )}
            </div>
          </CreationStep>

          <CreationStep n={next()} id="step-name" title="Name and description" done={name.trim() !== ""}>
            <div className="flex max-w-form flex-col gap-4">
              <Field id="creation-name" label="Name">
                <TextInput {...described("creation-name")} name="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </Field>
              <Field id="creation-manner" label="How you work" hint={'Finishes "I …", such as "work unseen".'} optional>
                <TextInput {...described("creation-manner", { hint: true })} name="profile.manner" maxLength={200} placeholder="work unseen" defaultValue={rebuild?.manner} />
              </Field>
              <Field id="creation-look" label="How you look" hint={'Finishes "I look …", such as "tall and scarred".'} optional>
                <TextInput {...described("creation-look", { hint: true })} name="profile.look" maxLength={200} placeholder="tall and scarred" defaultValue={rebuild?.look} />
              </Field>
            </div>
          </CreationStep>
        </div>
      </WithAside>
    </form>
  );
}

/** The sheet. With `abilities`, each of the character's abilities shows what it does. */
export function QuestSheetView({ sheet, labels, abilities }: { sheet: Record<string, unknown>; labels: Record<string, string>; abilities?: AbilityOption[] }) {
  const known = new Map((abilities ?? []).map((a) => [a.ref, a]));
  const s = sheet as { role: string; hp: { value: number; max: number }; ap: number; abilities: string[]; inventory: { ref: string }[]; status: string; armor?: { value: number; max: number } };
  const items: [ReactNode, ReactNode][] = [
    ["Role", sentence(s.role)],
    [
      "Health",
      <span key="hp" className="tabular">
        {s.hp.value}/{s.hp.max} HP
      </span>,
    ],
    ["AP", <span key="ap" className="tabular">{s.ap}</span>],
    ...(s.armor
      ? ([
          [
            "Armor",
            <span key="armor" className="tabular">
              {s.armor.value}/{s.armor.max}
            </span>,
          ],
        ] as [ReactNode, ReactNode][])
      : []),
    ["Status", <StatusBadge key="status" status={s.status} />],
    [
      "Abilities",
      known.size === 0 ? (
        s.abilities.map((a) => labels[a] ?? a).join(", ")
      ) : (
        // Each row is as tall as its info button; the first label lines up with the term beside it.
        <ul key="abilities" className="-mt-1.5 flex flex-col">
          {s.abilities.map((ref) => {
            const a = known.get(ref);
            return (
              <li key={ref}>
                {a ? (
                  <WithInfo label={`About ${a.label}`} info={<AbilityDetails a={a} />}>
                    <span className="block pt-1.5 text-ink">{a.label}</span>
                  </WithInfo>
                ) : (
                  <span className="text-ink">{labels[ref] ?? ref}</span>
                )}
              </li>
            );
          })}
        </ul>
      ),
    ],
    ["Inventory", s.inventory.length === 0 ? "Empty" : s.inventory.map((i) => labels[i.ref] ?? i.ref).join(", ")],
  ];
  return <DescriptionList items={items} />;
}
