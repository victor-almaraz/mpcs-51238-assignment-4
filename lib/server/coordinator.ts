// The Instance Coordinator's dependencies on the server: the store, Supabase Realtime, the clock, and
// round timeouts from the environment (architecture.md, Round timeouts: deployment configuration).
import { after } from "next/server";
import { MemoryBroadcaster, supabaseBroadcaster } from "../broadcast";
import { DEFAULT_MODEL, groqChat, tunedForReasoning } from "../models/groq";
import { modelNarrator } from "../narrator/adapter";
import { modelParser } from "../parser/adapter";
import { DEFAULT_TIMEOUTS, type Deps } from "../coordinator/instance";
import { demoMode } from "./demo";
import { setting } from "./env";
import { serverStore } from "./supabase";

function seconds(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? fallback : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

let deps: Deps | undefined;

/** Model adapters when GROQ_API_KEY is set (architecture.md, Model adapters); disabled otherwise. */
function models(): Pick<Deps, "parser" | "narrator"> {
  const key = process.env.GROQ_API_KEY;
  if (!key || demoMode()) return {};
  const chat = tunedForReasoning(groqChat(key), process.env.GROQ_REASONING_EFFORT || "low");
  return {
    ...(process.env.PARSER_ENABLED === "0" ? {} : { parser: modelParser(chat, process.env.GROQ_PARSER_MODEL || DEFAULT_MODEL, seconds("PARSER_TIMEOUT", 8) * 1000) }),
    ...(process.env.NARRATOR_ENABLED === "0" ? {} : { narrator: modelNarrator(chat, process.env.GROQ_NARRATOR_MODEL || DEFAULT_MODEL, seconds("NARRATOR_TIMEOUT", 10) * 1000) }),
  };
}

export function serverDeps(): Deps {
  deps ??= {
    ...models(),
    // Narration runs after the response is sent (app-flow.md, Input pipeline on Vercel, step 6).
    defer: (task) => after(task),
    actionMenuMode: process.env.ACTION_MENU_MODE === "1",
    store: serverStore(),
    broadcast: demoMode() ? new MemoryBroadcaster() : supabaseBroadcaster(setting("supabaseUrl"), setting("supabaseServiceRoleKey")),
    now: () => new Date(),
    timeouts: {
      exploration: seconds("EXPLORATION_ROUND_TIMEOUT", DEFAULT_TIMEOUTS.exploration),
      combat: seconds("COMBAT_TURN_TIMEOUT", DEFAULT_TIMEOUTS.combat),
    },
    warn: (m) => console.warn(`broadcast: ${m}`),
  };
  return deps;
}
