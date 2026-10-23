// The Narrator Adapter (architecture.md, Model adapters; tools.md, Narrator rules): committed events to
// prose. Narration is display text only. On a timeout or failure the caller uses template text.

import { ModelError, type Chat } from "../models/groq";
import type { NarratorContext } from "./context";

export type NarrateResult = { ok: true; text: string; raw: unknown; ms: number } | { ok: false; reason: string; ms: number };

export interface Narrator {
  narrate(context: NarratorContext): Promise<NarrateResult>;
}

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
    "Describe only what the events and facts state. Do not add entities, doors, passages, items, outcomes, or numbers.",
    "Do not contradict any event.",
    "Do not mention mechanics, ids, or dice unless the narration style asks for it.",
    `Write at most ${context.style.max_sentences} sentences, in the ${context.style.person} person, in this style: ${context.style.style}.`,
    "Use the labels for names, and positions for where things are. Never output coordinates.",
  ];
  if (context.improvise) {
    lines.push(`The player's input changed nothing (category ${context.improvise.category}). ${CATEGORY[context.improvise.category] ?? ""}`);
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
