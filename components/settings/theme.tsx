"use client";
// Theme: System, Light, or Dark (design/foundations.md: the theme follows the system setting unless the
// user picks one), kept in browser storage as the Privacy Policy states.
import { useSyncExternalStore } from "react";
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

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, stored, () => "system");
  const choose = applyTheme;
  return (
    <fieldset className="flex gap-4">
      <legend className="sr-only">Theme</legend>
      {["system", "light", "dark"].map((t) => (
        <label key={t} className="flex items-baseline gap-2">
          <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => choose(t)} />
          {t[0]!.toUpperCase() + t.slice(1)}
        </label>
      ))}
    </fieldset>
  );
}
