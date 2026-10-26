"use client";
// Validation in the browser on every change, debounced (app-flow.md, Adventure editor: Validation).
// The check runs on the main thread, as app-flow.md allows where the bundler cannot build a worker:
// Turbopack copies a `new Worker(new URL(...))` target as a raw asset instead of bundling it.
// lib/materials loads on the first edit, in its own chunk, and checks the draft against the required
// settings' bundles. The server's diagnostics from save_draft stay the authority, so a browser result
// never replaces a server result for the same or a later edit. If lib/materials cannot load, the
// editor shows the server's results.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingBundle } from "@/lib/bundle/setting";
import type { Problem } from "./doc";

const DEBOUNCE_MS = 400;

export type Source = "server" | "browser";

type Live = typeof import("@/lib/materials/live");

/**
 * Problems for the editor: `check(document, seq)` validates after DEBOUNCE_MS, and
 * `fromServer(diagnostics, seq)` records a save's result. `seq` increases with every edit.
 */
export function useLiveValidation(initial: Problem[], settings: SettingBundle[] | null) {
  const [problems, setProblems] = useState<{ list: Problem[]; source: Source; seq: number }>({ list: initial, source: "server", seq: 0 });
  const [state, setState] = useState<"idle" | "checking" | "failed" | "off">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = useRef({ seq: 0, source: "server" as Source });
  const pending = useRef<{ document: Record<string, unknown>; seq: number } | null>(null);
  const live = useRef<Promise<Live> | null>(null);
  const current = useRef<SettingBundle[] | null>(settings);
  /** lib/materials could not load: problems come from saves only. */
  const unavailable = useRef(false);

  const accept = useCallback((seq: number, source: Source, list: Problem[]) => {
    const s = shown.current;
    if (seq < s.seq || (seq === s.seq && s.source === "server" && source === "browser")) return;
    shown.current = { seq, source };
    setProblems({ list, source, seq });
  }, []);

  const run = useCallback(async () => {
    const p = pending.current;
    const bundles = current.current;
    // Checks pause while the settings load; the latest edit runs once they arrive.
    if (!p || bundles === null) return;
    pending.current = null;
    setState("checking");
    let checker: Live;
    try {
      live.current ??= import("@/lib/materials/live");
      checker = await live.current;
    } catch {
      unavailable.current = true;
      return setState("off");
    }
    try {
      accept(p.seq, "browser", checker.draftDiagnostics(p.document, bundles));
      setState("idle");
    } catch {
      setState("failed");
    }
  }, [accept]);

  // New settings (on load, or after requires_settings changed) apply to the next check.
  useEffect(() => {
    current.current = settings;
    if (settings === null) return;
    const t = setTimeout(() => void run(), 0);
    return () => clearTimeout(t);
  }, [settings, run]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const check = useCallback(
    (document: Record<string, unknown>, seq: number) => {
      if (unavailable.current) return setState("off");
      pending.current = { document, seq };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), DEBOUNCE_MS);
    },
    [run],
  );

  const fromServer = useCallback((list: Problem[], seq: number) => accept(seq, "server", list), [accept]);

  return { problems: problems.list, source: problems.source, state, check, fromServer };
}
