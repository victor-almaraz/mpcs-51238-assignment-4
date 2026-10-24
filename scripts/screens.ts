// Screenshots of every screen in demo mode (lib/server/demo.ts), for design review. Start `pnpm demo`
// first; this drives the installed Google Chrome through Playwright, so no browser download is needed.
//   pnpm screens [--base http://localhost:3100] [--out screenshots]
// Writes <out>/NN-<screen>-wide.png (1280 px) and -narrow.png (390 px), full page, and <out>/README.md
// listing each screen with the browser console errors it logged.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const base = arg("base", "http://localhost:3100");
const out = join(process.cwd(), arg("out", "screenshots"));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(base, { waitUntil: "networkidle" });
const screens = await page.$$eval('main a[href^="/"]', (as) => [...new Map(as.map((a) => [a.getAttribute("href") ?? "", { label: (a.textContent ?? "").trim().replace(/\s+/g, " "), href: a.getAttribute("href") ?? "" }])).values()].filter((s) => s.href !== "/"));
screens.unshift({ label: "Demo index", href: "/" });

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const lines = ["# Screenshots", "", `Demo mode at ${base}, ${new Date().toISOString().slice(0, 16)} UTC. Wide is 1280 px, narrow 390 px.`, "", "| # | Screen | Path | Wide | Narrow | Console errors |", "|---|---|---|---|---|---|"];
for (const [i, s] of screens.entries()) {
  const name = `${String(i).padStart(2, "0")}-${slug(s.label)}`;
  const errors: string[] = [];
  const onConsole = (m: { type: () => string; text: () => string }) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  };
  page.on("console", onConsole);
  for (const [size, viewport] of [
    ["wide", { width: 1280, height: 900 }],
    ["narrow", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(base + s.href, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, `${name}-${size}.png`), fullPage: true });
  }
  page.off("console", onConsole);
  lines.push(`| ${i} | ${s.label} | \`${s.href}\` | [wide](${name}-wide.png) | [narrow](${name}-narrow.png) | ${[...new Set(errors)].join("; ").replaceAll("|", "\\|") || "none"} |`);
  console.log(`${name}${errors.length ? `  (${errors.length} console errors)` : ""}`);
}
writeFileSync(join(out, "README.md"), lines.join("\n") + "\n");
await browser.close();
