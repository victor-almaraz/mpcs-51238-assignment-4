"use client";
// Quest's creation form and sheet view (app-flow.md, Character creation and editor; docs/design/README.md,
// Character creation): titled steps that can be revisited (System, Role, Abilities counted against six,
// Name and description) beside a summary card with a Change link per choice and the Create button.
import { Check } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import type { AbilityOption } from "@/lib/api/characters";
import type { CampaignChoice } from "@/lib/systems/creation";
import { createCharacterAction } from "@/lib/server/actions";
import type { FormState } from "@/lib/server/forms";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Choice, Field, TextInput, described } from "@/components/ui/field";
import { ICON_DENSE } from "@/components/ui/icon-button";
import { DescriptionList } from "@/components/ui/list";
import { Notice } from "@/components/ui/notice";
import { WithAside } from "@/components/ui/page";

export interface CreationProps {
  system: string;
  roles: string[];
  abilities: AbilityOption[];
  count: number;
  /** The caller's campaigns of this system, for a system with modules; Quest has none and ignores them. */
  campaigns?: CampaignChoice[];
  /** The campaign chosen on arrival, such as from a campaign's page. */
  campaign?: string;
  /** The chosen system's title and credit line, for the System step and the summary. */
  systemTitle?: string;
  systemCredit?: string;
  /** Where Change leads for the system: the system choice. */
  systemHref?: string;
}

/** A choice in the summary card, with the step that changes it. */
export interface SummaryRow {
  label: string;
  value: ReactNode;
  href: string;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A titled, numbered step of the creation page; Change links in the summary lead to its id. */
export function CreationStep({ n, id, title, done, status, children }: { n: number; id: string; title: string; done: boolean; status?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rounded-card border border-rule bg-page p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={`${id}-title`} className="flex items-center gap-3 text-section font-semibold text-ink">
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
 * Quest's form. `children` are a derived system's extra steps, shown after Name and description, and
 * `summary` their rows in the summary card; they carry no `name`, so `create_character` receives only
 * Quest's choices.
 */
export function QuestCreationForm({ system, roles, abilities, count, systemTitle, systemCredit, systemHref = "/characters/new", children, summary = [] }: CreationProps & { children?: ReactNode; summary?: SummaryRow[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCharacterAction, { error: null });
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
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
  // The role's quick start: the abilities tagged for exactly this role, when there are enough.
  const quickStart = role ? abilities.filter((a) => a.roles.length === 1 && a.roles[0] === role).map((a) => a.ref) : [];
  const label = new Map(abilities.map((a) => [a.ref, a.label]));
  const muted = (s: string) => <span className="text-muted">{s}</span>;

  const abilityChoices = (list: AbilityOption[]) => (
    <ul className="grid grid-cols-2 gap-x-4 xl:grid-cols-3">
      {list.map((a) => (
        <li key={a.ref}>
          <Choice name="abilities" value={a.ref} checked={chosen.includes(a.ref)} onChange={() => toggle(a.ref)} disabled={!chosen.includes(a.ref) && chosen.length >= count} label={a.label} hint={a.setting} className="has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60" />
        </li>
      ))}
    </ul>
  );

  const rows: SummaryRow[] = [
    { label: "System", value: systemTitle ?? system, href: systemHref },
    { label: "Role", value: role ? sentence(role) : muted("Not chosen"), href: "#step-role" },
    { label: "Abilities", value: chosen.length === 0 ? muted(`None of ${count}`) : `${chosen.map((r) => label.get(r) ?? r).join(", ")} (${chosen.length} of ${count})`, href: "#step-abilities" },
    { label: "Name", value: name.trim() || muted("Not given"), href: "#step-name" },
    ...summary,
  ];

  return (
    <form action={action}>
      <input type="hidden" name="system" value={system} />
      <WithAside
        aside={
          <div className="flex flex-col gap-4 rounded-card border border-rule bg-page p-4 lg:sticky lg:top-[calc(var(--size-topbar)+24px)]">
            <h2 className="text-section font-semibold text-ink">Summary</h2>
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
              {pending ? "Creating…" : "Create character"}
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
          <CreationStep n={1} id="step-system" title="System" done>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-heading font-semibold text-ink">{systemTitle ?? system}</p>
                {systemCredit && <p className="text-caption text-muted">{systemCredit}</p>}
              </div>
              <ButtonLink href={systemHref} size="sm">
                Change system
              </ButtonLink>
            </div>
          </CreationStep>

          <CreationStep n={2} id="step-role" title="Role" done={role !== ""}>
            <p id="step-role-hint" className="mb-3 text-caption text-muted">
              The role puts its abilities first in the next step; any ability can still be chosen.
            </p>
            <div role="radiogroup" aria-labelledby="step-role-title" aria-describedby="step-role-hint" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {roles.map((r) => (
                <Choice key={r} type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} label={sentence(r)} className="border border-rule px-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft" />
              ))}
            </div>
          </CreationStep>

          <CreationStep
            n={3}
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
                  The installed settings offer {abilities.length} abilit{abilities.length === 1 ? "y" : "ies"}; this system needs {count}.
                </Notice>
              )}
              {suited.length > 0 && (
                <div>
                  <h3 className="mb-1 text-label font-semibold text-ink">Suggested for the {role}</h3>
                  {abilityChoices(suited)}
                </div>
              )}
              <div>
                {suited.length > 0 && <h3 className="mb-1 text-label font-semibold text-ink">Other abilities</h3>}
                {abilityChoices(others)}
              </div>
            </div>
          </CreationStep>

          <CreationStep n={4} id="step-name" title="Name and description" done={name.trim() !== ""}>
            <div className="flex max-w-form flex-col gap-4">
              <Field id="creation-name" label="Name">
                <TextInput {...described("creation-name")} name="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </Field>
              <Field id="creation-manner" label="How you work" hint={'Finishes "I …", such as "work unseen".'} optional>
                <TextInput {...described("creation-manner", { hint: true })} name="profile.manner" maxLength={200} placeholder="work unseen" />
              </Field>
              <Field id="creation-look" label="How you look" hint={'Finishes "I look …", such as "tall and scarred".'} optional>
                <TextInput {...described("creation-look", { hint: true })} name="profile.look" maxLength={200} placeholder="tall and scarred" />
              </Field>
            </div>
          </CreationStep>

          {children}
        </div>
      </WithAside>
    </form>
  );
}

export function QuestSheetView({ sheet, labels }: { sheet: Record<string, unknown>; labels: Record<string, string> }) {
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
    ["Abilities", s.abilities.map((a) => labels[a] ?? a).join(", ")],
    ["Inventory", s.inventory.length === 0 ? "Empty" : s.inventory.map((i) => labels[i.ref] ?? i.ref).join(", ")],
  ];
  return <DescriptionList items={items} />;
}
