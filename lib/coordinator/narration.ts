// Narration after a commit (architecture.md, Action pipeline steps 7 and 8): the model narrator when one
// is configured, template text otherwise or when it fails. Narration never changes state.

import { labelsFor, view, type Bundles, type GameEvent, type State } from "../engine";
import { instanceTopic } from "../broadcast";
import { narratorContext } from "../narrator/context";
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

export async function narrate(deps: Deps, job: NarrationJob): Promise<void> {
  const labels = labelsFor(job.before ? [job.after, job.before] : [job.after], job.bundles);
  const template = templateNarration(job.events, labels);
  // A commit with nothing resolved, such as a declaration, is not narrated.
  if (!template) return;
  let text = template;
  let source: "model" | "template" = "template";
  if (deps.narrator) {
    const actorId = job.actor ?? (job.events.map((e) => (e as { actor?: string }).actor).find((a) => a && job.after.characters[a]) as string | undefined) ?? null;
    const v = actorId && job.after.characters[actorId] ? view(job.after, job.bundles, actorId) : null;
    const improvised = job.events.find((e) => e.type === "improvised") as { category?: string; intent?: string; suggestions?: { tool: string; args: Record<string, unknown> }[] } | undefined;
    const context = narratorContext({
      style: job.bundles.settings[0]?.manifest.narration ?? DEFAULT_STYLE,
      actor: actorId ? { id: actorId, name: labels.entity(actorId) } : null,
      events: job.events,
      facts: job.facts,
      label: labels.entity,
      disposition: (id) => job.bundles.adventure.npcs?.[id]?.disposition,
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
