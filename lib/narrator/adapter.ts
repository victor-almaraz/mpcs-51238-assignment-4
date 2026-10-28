// The Narrator Adapter (architecture.md, Model adapters; tools.md, Narrator rules): committed events to
// prose. Narration is display text only. On a timeout or failure the caller uses template text.

import { ModelError, type Chat } from "../models/groq";
import type { NarratorContext } from "./context";

export type NarrateResult = { ok: true; text: string; raw: unknown; ms: number } | { ok: false; reason: string; ms: number };

export interface Narrator {
  narrate(context: NarratorContext): Promise<NarrateResult>;
}

/**
 * Every player reads the same narration, so it names each character; in the second person, "you" is the
 * whole party (tools.md, Narrator rules).
 */
const PERSON = {
  second: 'Write in the second person plural: "you" means the whole party and never one character.',
  third: "Write in the third person.",
} as const;

const CATEGORY: Record<string, string> = {
  flavor: "Acknowledge it in one sentence. No redirect.",
  impossible: "State in the fiction why it fails, then point to a suggestion.",
  unsupported: "Describe the attempt not taking hold, then point to the nearest mechanic.",
  meta: "Answer in one out-of-character sentence, then return to the scene.",
  unclear: "Ask one question naming two or three options.",
  overreach: "Restate what the character can attempt. Grant nothing.",
};

export function narratorPrompt(context: NarratorContext): string {
  const lines = [
    "You narrate a text adventure from the events the game committed.",
    "Describe only what the events, facts, room, and scene state. The scene is what the actor sees and carries and the party's condition; mention nothing outside them: no other entities, doors, passages, items, people, outcomes, or numbers.",
    "Do not contradict any event.",
    "Do not mention mechanics, ids, or dice unless the narration style asks for it.",
    `Write at most ${context.style.max_sentences} sentences, in this style: ${context.style.style}.`,
    PERSON[context.style.person],
    "Every player in the party reads this narration. Name each character who acts or is acted on, using their label.",
    "Use the labels for names, and positions for where things are. Never output coordinates.",
  ];
  if (context.actor) lines.push(`${context.actor.name} took this action: say "${context.actor.name}", not "you", for what they do.`);
  if (context.opening) {
    lines.push(
      "This is the game's first narration. Open the scene: the place and its atmosphere as the party arrives, from the opening text and the premise, which count as facts, and the room. Name the party. Do not describe anything happening yet.",
    );
  }
  if (context.improvise) {
    lines.push(`The player's input changed nothing in the world (category ${context.improvise.category}). ${CATEGORY[context.improvise.category] ?? ""}`);
    lines.push(
      context.improvise.category === "flavor"
        ? "The character may make the harmless gesture, but nothing is gained, found, moved, opened, or harmed."
        : "The attempt does not happen or does not work: never narrate its success or its result, and describe nothing new.",
    );
    if (context.improvise.streak >= 3) lines.push("Name the valid options explicitly.");
    lines.push("End with a pointer to a suggestion or a visible feature of the room.");
  }
  return lines.join("\n");
}

/** At most `max` sentences of `text`. */
export function clip(text: string, max: number): string {
  const sentences = text.trim().match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text.trim()];
  return sentences.slice(0, max).join(" ").replace(/\s+/g, " ").trim();
}

export function modelNarrator(chat: Chat, model: string, timeoutMs: number): Narrator {
  return {
    async narrate(context) {
      const started = Date.now();
      try {
        const r = await chat(
          {
            model,
            messages: [
              { role: "system", content: narratorPrompt(context) },
              { role: "user", content: JSON.stringify(context) },
            ],
            temperature: 0.7,
            max_tokens: 300,
          },
          timeoutMs,
        );
        const text = r.content ? clip(r.content, context.style.max_sentences) : "";
        if (text === "") return { ok: false, reason: "empty", ms: Date.now() - started };
        return { ok: true, text, raw: r.raw, ms: Date.now() - started };
      } catch (e) {
        return { ok: false, reason: e instanceof ModelError ? e.kind : "unavailable", ms: Date.now() - started };
      }
    },
  };
}
