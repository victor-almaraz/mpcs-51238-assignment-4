"use client";
// Theme: System, Light, or Dark (design/foundations.md: the theme follows the system setting unless the
// user picks one), kept in browser storage as the Privacy Policy states.
import { useSyncExternalStore } from "react";
import { Choice } from "@/components/ui/field";
import { THEME_KEY } from "./theme-script";

const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
const stored = () => localStorage.getItem(THEME_KEY) ?? "system";

function applyTheme(t: string): void {
  const root = document.documentElement;
  if (t === "system") {
    localStorage.removeItem(THEME_KEY);
    root.removeAttribute("data-theme");
  } else {
    localStorage.setItem(THEME_KEY, t);
    root.setAttribute("data-theme", t);
  }
  for (const f of listeners) f();
}

const THEMES: { id: string; label: string; hint: string }[] = [
  { id: "system", label: "System", hint: "Follows your device's light or dark setting." },
  { id: "light", label: "Light", hint: "Always light." },
  { id: "dark", label: "Dark", hint: "Always dark." },
];

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, stored, () => "system");
  const choose = applyTheme;
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-label font-medium text-ink">Theme</legend>
      {THEMES.map((t) => (
        <Choice key={t.id} type="radio" name="theme" value={t.id} checked={theme === t.id} onChange={() => choose(t.id)} label={t.label} hint={t.hint} />
      ))}
    </fieldset>
  );
}
