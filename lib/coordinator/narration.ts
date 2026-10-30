// Narration after a commit (architecture.md, Action pipeline steps 7 and 8): the model narrator when one
// is configured, template text otherwise or when it fails. Narration never changes state.

import { labelsFor, view, type Bundles, type GameEvent, type State } from "../engine";
import { instanceTopic } from "../broadcast";
import { narratorContext, type Opening } from "../narrator/context";
import { describeCall, templateNarration } from "../narrator/template";
import { send, type Deps } from "./instance";

export interface NarrationJob {
  instanceId: string;
  version: number;
  bundles: Bundles;
  before: State | null;
  after: State;
  /** The commit's shared events. */
  events: GameEvent[];
  facts: string[];
  actor: string | null;
}

const DEFAULT_STYLE = { style: "plain", person: "third" as const, max_sentences: 4 };

/** Extra sentences the opening narration, and a conversation, may use beyond the style's limit. */
const OPENING_SENTENCES = 2;
const TALK_SENTENCES = 2;

/** What opens the game, on the start commit: the adventure's premise and opening text, and the party. */
function openingOf(job: NarrationJob, label: (id: string) => string): Opening | null {
  if (job.before !== null) return null;
  const m = job.bundles.adventure.manifest;
  return { title: m.title, premise: m.description ?? null, text: m.start.narrate ?? null, party: Object.keys(job.after.characters).sort().map(label) };
}

/** The opening as template text: the author's opening, else the premise's first sentence, then who is where. */
function openingTemplate(o: Opening, room: string | null): string {
  const scene = o.text ?? o.premise?.match(/^[^.!?]+[.!?]/)?.[0] ?? `${o.title}.`;
  const names = o.party.length > 1 ? `${o.party.slice(0, -1).join(", ")} and ${o.party.at(-1)}` : (o.party[0] ?? "");
  // "the hangar", but "Orvelle plaza": a label that starts with a name takes no article.
  const place = /^\p{Lu}/u.test(room ?? "") ? room : `the ${room}`;
  return room && names ? `${scene} ${names} ${o.party.length > 1 ? "are" : "is"} in ${place}.` : scene;
}

export async function narrate(deps: Deps, job: NarrationJob): Promise<void> {
  const labels = labelsFor(job.before ? [job.after, job.before] : [job.after], job.bundles);
  const opening = openingOf(job, labels.entity);
  const first = opening ? Object.keys(job.after.characters).sort()[0] : undefined;
  const openingView = first ? view(job.after, job.bundles, first) : null;
  // Facts (trigger text, topic briefs, revealed secrets) are part of the template text, so they reach the
  // players when the model narrator is down too.
  const template = [opening && openingTemplate(opening, openingView?.room?.label ?? null), templateNarration(job.events, labels), ...job.facts].filter(Boolean).join(" ") || null;
  // A commit with nothing resolved, such as a declaration, is not narrated; the start commit always is.
  if (!template) return;
  let text = template;
  let source: "model" | "template" = "template";
  if (deps.narrator) {
    const actorId = job.actor ?? (job.events.map((e) => (e as { actor?: string }).actor).find((a) => a && job.after.characters[a]) as string | undefined) ?? null;
    const v = actorId && job.after.characters[actorId] ? view(job.after, job.bundles, actorId) : openingView;
    const improvised = job.events.find((e) => e.type === "improvised") as { category?: string; intent?: string; suggestions?: { tool: string; args: Record<string, unknown> }[] } | undefined;
    const style = job.bundles.settings[0]?.manifest.narration ?? DEFAULT_STYLE;
    const talking = job.events.some((e) => e.type === "talked");
    const extra = (opening ? OPENING_SENTENCES : 0) + (talking ? TALK_SENTENCES : 0);
    const context = narratorContext({
      style: extra > 0 ? { ...style, max_sentences: style.max_sentences + extra } : style,
      opening,
      actor: actorId ? { id: actorId, name: labels.entity(actorId) } : null,
      events: job.events,
      facts: job.facts,
      label: labels.entity,
      disposition: (id) => job.bundles.adventure.npcs?.[id]?.disposition,
      topicLabel: (npc, topic) => job.bundles.adventure.npcs?.[npc]?.topics?.[topic]?.label,
      view: v,
      improvise: improvised
        ? {
            category: improvised.category ?? "unclear",
            intent: improvised.intent ?? "",
            suggestions: (improvised.suggestions ?? []).map((c) => ({ ...c, label: describeCall(c, labels) })),
            streak: actorId ? (job.after.improvise_streak[actorId] ?? 0) : 0,
          }
        : null,
    });
    const r = await deps.narrator.narrate(context);
    if (r.ok) {
      text = r.text;
      source = "model";
    }
  }
  try {
    await deps.store.putNarration(job.instanceId, job.version, text, source);
  } catch (e) {
    deps.warn?.(`narration ${job.instanceId}@${job.version}: ${(e as Error).message}`);
    return;
  }
  await send(deps, instanceTopic(job.instanceId), [{ type: "narration", instance_id: job.instanceId, version: job.version, text, source }]);
}
