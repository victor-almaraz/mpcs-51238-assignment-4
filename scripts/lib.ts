// Helpers shared by the command-line scripts: flags, integers, the demo screens, and the Groq parser.
import type { Page } from "@playwright/test";
import { patient } from "../lib/agent/run";
import { DEFAULT_MODEL, groqChat, tunedForReasoning } from "../lib/models/groq";
import { modelParser } from "../lib/parser/adapter";

/** Exits 2 with `message` on stderr. */
function usage(message: string): never {
  console.error(`usage: ${message}`);
  process.exit(2);
}

/** The value after `--name` on the command line, or `fallback` when the flag is absent. */
export function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith("--")) usage(`--${name} needs a value`);
  return value;
}

/** `text` as an integer of at least `min`; exits 2 when it is not one. `name` is the flag or variable it came from. */
export function int(name: string, text: string, min = 0): number {
  if (!/^-?\d+$/.test(text.trim()) || Number(text) < min) usage(`${name} must be an integer of at least ${min}, not '${text}'`);
  return Number(text);
}

/** The demo index at `base` and every screen it links to. */
export async function demoScreens(page: Page, base: string): Promise<{ label: string; href: string }[]> {
  await page.goto(base, { waitUntil: "networkidle" });
  const screens = await page.$$eval('main a[href^="/"]', (as) => [...new Map(as.map((a) => [a.getAttribute("href") ?? "", { label: (a.textContent ?? "").trim().replace(/\s+/g, " "), href: a.getAttribute("href") ?? "" }])).values()].filter((s) => s.href !== "/"));
  return [{ label: "Demo index", href: "/" }, ...screens];
}

/**
 * The Groq chat and parser from the environment: GROQ_API_KEY (exits 2 when unset), GROQ_PARSER_MODEL,
 * GROQ_REASONING_EFFORT, and PARSER_TIMEOUT in seconds. Rate limits wait as long as Groq asks; each wait
 * prints one line.
 */
export function groqFromEnv(script: string) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.error(`${script}: GROQ_API_KEY is not set`);
    process.exit(2);
  }
  const waiting = patient(groqChat(key), undefined, undefined, (e, ms) => console.log(`  (${e.status === 429 ? "rate limited" : e.message.slice(0, 120)}; waiting ${(ms / 1000).toFixed(1)} s)`));
  const chat = tunedForReasoning(waiting, process.env.GROQ_REASONING_EFFORT || "low");
  const parserModel = process.env.GROQ_PARSER_MODEL || DEFAULT_MODEL;
  const parser = modelParser(chat, parserModel, int("PARSER_TIMEOUT", process.env.PARSER_TIMEOUT || "20", 1) * 1000);
  return { key, chat, parserModel, parser };
}
