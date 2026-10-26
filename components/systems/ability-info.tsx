// What roles and abilities mean, for players new to Quest and Cadmium (systems/quest.md, Summary,
// Character creation, and Abilities; systems/cadmium.md, Relation to Quest). Shared by both systems'
// creation forms and the sheet view, behind info icons. Text derives from the ability's data and the system's numbers;
// a description shows only where the pack ships one.
import type { AbilityOption } from "@/lib/api/characters";

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function target(a: AbilityOption): string {
  if (a.target === "self") return "On yourself";
  if (a.target === "door") return "On a door";
  if (a.target === "none") return "No target";
  return a.range ? `On a creature or thing within ${a.range} cells` : "On a creature or thing you can see";
}

/** Cost, roll, target, and learning path, as short facts. */
export function abilityFacts(a: AbilityOption): string[] {
  return [`${a.cost} AP`, ...(a.roll ? ["Rolls the d20"] : []), target(a), ...(a.path ? [`${sentence(a.path)} path`] : [])];
}

/** What the ability does: its effects, or that the narrator decides. */
export function abilityOutcome(a: AbilityOption): string {
  if (a.effects.length === 0) return "No fixed effect: the narrator describes what happens.";
  return `${a.effects.join(" ")}${a.roll ? " Only when the roll succeeds." : ""}`;
}

/** An ability's description, facts, and outcome, as lines of small text. */
export function AbilityDetails({ a }: { a: AbilityOption }) {
  return (
    <>
      {a.description && <span className="block text-ink">{a.description}</span>}
      <span className="block">{abilityFacts(a).join(" · ")}</span>
      <span className="block">{abilityOutcome(a)}</span>
    </>
  );
}

/** A role's learning paths and how many abilities name it, from the abilities on offer. */
export function roleSummary(role: string, abilities: AbilityOption[]): string {
  const own = abilities.filter((a) => a.roles.includes(role));
  if (own.length === 0) return "No installed abilities name this role.";
  const paths = [...new Set(own.map((a) => a.path).filter((p): p is string => !!p))].map(sentence);
  return `${paths.length > 0 ? `Paths: ${paths.join(", ")}. ` : ""}${own.length} suggested abilit${own.length === 1 ? "y" : "ies"}.`;
}

/** The rules a new player needs before choosing, with the system's own numbers. */
export function RulesPrimer({ hp, ap, count, cadmium }: { hp: number; ap: number; count: number; cadmium: boolean }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ink">
      {cadmium && <li>Cadmium plays by Quest&apos;s rules. A campaign can add modules, such as an armor pool or bags that carry more.</li>}
      <li>Characters have no attributes or skills. They differ by role and by the {count} abilities they choose.</li>
      <li>A role is a style of play. It suggests abilities that suit it, and any ability can still be chosen.</li>
      <li>Abilities cost Adventure Points (AP). A character starts with {ap} AP, AP does not come back by resting, and more is earned during play.</li>
      <li>An ability that rolls uses one d20, with no modifiers; its effect applies only when the roll succeeds. Others simply happen.</li>
      <li>Every character has {hp} HP. At 0 HP they are at death&apos;s door, and further harm can kill them.</li>
    </ul>
  );
}
