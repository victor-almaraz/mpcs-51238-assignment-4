"use client";
// Whether the page shows the dark theme: the stored choice (`data-theme` on <html>), else the system's.
// For editor widgets that draw their own colours (Monaco, React Flow).
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

export function isDark(): boolean {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === "dark" : window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  const scheme = window.matchMedia(QUERY);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  scheme.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    scheme.removeEventListener("change", onChange);
  };
}

export function useDark(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}
