// Design and accessibility audit of every demo screen (docs/design/README.md, Accessibility checklist).
// Start `pnpm demo` first; this drives the installed Google Chrome through Playwright.
//   pnpm audit:ui [--base http://localhost:3100] [--out screenshots/audit.md] [--scheme light|dark] [--screens REGEX]
// Checks, at 1280 px and 390 px: one h1 and no skipped heading levels; main, header, and nav
// landmarks; an accessible name on every control, button, link, and image; no duplicate ids; targets of
// at least 24 x 24 px (WCAG 2.5.8; inline text links excepted); text contrast against its background
// (4.5:1, or 3:1 for large text); a visible focus indicator on the first focusable elements; no
// horizontal scrolling; console errors, page errors, and hydration failures; and the Hierarchy rules
// (headings only at the type scale's sizes, no serif heading inside a card, a 16 px card inset, and page
// title, section headings, and tab labels on one content edge); and spacing (a box at least 8 px from the
// blocks beside it, and text at least 8 px inside its box). Views that need a click to open, such as
// the adventure editor's arc graph and YAML view, are audited after their screen.
// Exits 0 with no findings, 1 with findings or a page that did not load, 2 on a usage error.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { arg, demoScreens } from "./lib";

/** Views reached by acting on a screen: the screen whose path matches `on`, then `open`. */
const VIEWS: { label: string; on: RegExp; open: (page: Page) => Promise<void> }[] = [
  {
    label: "Editor: arc graph",
    on: /^\/adventures\/[^/]+\/edit$/,
    open: async (page) => {
      // On compact screens the outline is in the Sections sheet.
      if (!(await page.getByRole("button", { name: "The Archive", exact: true }).first().isVisible())) await page.getByRole("button", { name: "Sections" }).first().click();
      await page.getByRole("button", { name: "The Archive", exact: true }).filter({ visible: true }).first().click();
      await page.locator(".react-flow__node-stage").first().waitFor();
    },
  },
  {
    label: "Editor: YAML view",
    on: /^\/adventures\/[^/]+\/edit$/,
    open: async (page) => {
      await page.locator('button[aria-label="Edit as YAML"]:visible').first().click();
      await page.locator(".monaco-editor .view-lines").first().waitFor();
    },
  },
];

const base = arg("base", "http://localhost:3100");
const out = resolve(arg("out", "screenshots/audit.md"));
const schemeArg = arg("scheme", "light");
if (schemeArg !== "light" && schemeArg !== "dark") {
  console.error(`usage: --scheme must be light or dark, not '${schemeArg}'`);
  process.exit(2);
}
const scheme: "light" | "dark" = schemeArg;
/** Audits only the screens whose path matches. */
const only = new RegExp(arg("screens", ""));

interface Finding {
  rule: string;
  detail: string;
}

/** The in-page checks; returns findings. Runs in the browser. */
function pageChecks(): Finding[] {
  const found: Finding[] = [];
  const add = (rule: string, detail: string) => found.push({ rule, detail: detail.slice(0, 260) });
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const describe = (el: Element) => {
    const t = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.getAttribute("name") ? ` name=${el.getAttribute("name")}` : ""}>${t ? ` "${t}"` : ""}`;
  };
  const name = (el: Element): string => {
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria;
    const by = el.getAttribute("aria-labelledby");
    if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      const labels = [...(el.labels ?? [])].map((l) => l.textContent ?? "").join(" ").trim();
      if (labels) return labels;
      if (el instanceof HTMLInputElement && ["submit", "button", "reset"].includes(el.type)) return el.value;
    }
    const title = el.getAttribute("title");
    const text = (el.textContent ?? "").trim();
    if (text) return text;
    const img = el.querySelector("img[alt], svg[aria-label]");
    if (img) return img.getAttribute("alt") ?? img.getAttribute("aria-label") ?? "";
    return title ?? "";
  };

  // Headings and landmarks.
  const h1 = [...document.querySelectorAll("h1")].filter(visible);
  if (h1.length !== 1) add("one-h1", `${h1.length} visible h1 elements`);
  let last = 0;
  for (const h of [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible)) {
    const level = Number(h.tagName[1]);
    if (last && level > last + 1) add("heading-order", `h${last} then h${level}: ${describe(h)}`);
    last = level;
  }
  for (const [sel, label] of [["main", "main"], ["header, [role=banner]", "header"], ["nav", "nav"]] as const) if (!document.querySelector(sel)) add("landmark", `no ${label} landmark`);

  // Names, for elements assistive technology is shown (not inside aria-hidden).
  const exposed = (el: Element) => visible(el) && !el.closest('[aria-hidden="true"]');
  for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
    if (exposed(el) && !name(el)) add("control-name", describe(el));
  }
  for (const el of document.querySelectorAll("button, a[href], [role=button], [role=tab]")) {
    if (exposed(el) && !name(el)) add("button-name", describe(el));
  }
  for (const el of document.querySelectorAll("img")) if (!el.hasAttribute("alt")) add("img-alt", describe(el));
  for (const el of document.querySelectorAll("svg[role=img]")) if (!name(el)) add("img-alt", "svg role=img without a name");

  // Ids.
  const ids = new Map<string, number>();
  for (const el of document.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) add("duplicate-id", `${id} x${n}`);

  // Target size (2.5.8): interactive elements under 24 px fail unless a 24 px circle around them meets no
  // other target (the spacing exception). Inline text links are exempt; a checkbox or radio counts its
  // label; a link whose ::after covers a card counts the card; visually hidden skip links are skipped.
  const targets = [...document.querySelectorAll("button, a[href], input[type=checkbox], input[type=radio], select, [role=tab]")].filter(visible);
  const area = (el: Element): DOMRect => {
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      const label = el.closest("label");
      if (label) return label.getBoundingClientRect();
    }
    if (getComputedStyle(el, "::after").position === "absolute") {
      for (let a = el.parentElement; a; a = a.parentElement) if (getComputedStyle(a).position !== "static") return a.getBoundingClientRect();
    }
    return el.getBoundingClientRect();
  };
  const rects = targets.map(area);
  targets.forEach((el, i) => {
    const r = rects[i]!;
    if (r.width <= 1 || r.height <= 1) return;
    const inline = el.tagName === "A" && getComputedStyle(el).display === "inline" && (el.parentElement?.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 10;
    if (inline || (r.width >= 24 && r.height >= 24)) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const near = rects.some((o, j) => {
      if (j === i || o.width <= 1) return false;
      const dx = Math.max(o.left - cx, 0, cx - o.right);
      const dy = Math.max(o.top - cy, 0, cy - o.bottom);
      return dx * dx + dy * dy < 144;
    });
    if (near) add("target-size", `${Math.round(r.width)}x${Math.round(r.height)} ${describe(el)}`);
  });

  // Contrast of text against its effective background.
  const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
  };
  const background = (el: Element | null): number[] => {
    for (let e = el; e; e = e.parentElement) {
      const c = rgb(getComputedStyle(e).backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const seen = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").trim();
    const el = n.parentElement;
    if (!text || !el || !visible(el) || el.closest("svg, canvas, [aria-hidden=true]")) continue;
    const s = getComputedStyle(el);
    if (Number(s.opacity) < 1 && el.closest("button:disabled, [aria-disabled=true]")) continue;
    const fg = rgb(s.color);
    const bg = background(el);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a! + 0.05) / (b! + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const min = large ? 3 : 4.5;
    const key = `${s.color}|${bg.join(",")}`;
    if (ratio < min && !seen.has(key)) {
      seen.add(key);
      add("contrast", `${ratio.toFixed(2)}:1 (needs ${min}) "${text.slice(0, 30)}" ${s.color} on rgb(${bg.join(",")})`);
    }
  }

  // Hierarchy (docs/design/README.md, Foundations: Hierarchy).
  const px = (v: string) => Math.round(parseFloat(v));
  const shown = (el: Element) => visible(el) && el.getBoundingClientRect().width > 1 && !el.closest(".sr-only");
  const scale = new Set([34, 28, 21, 16, 14]);
  for (const h of [...document.querySelectorAll("h1, h2, h3, h4, legend")].filter(shown)) {
    const size = px(getComputedStyle(h).fontSize);
    if (!scale.has(size)) add("heading-scale", `${size}px ${describe(h)}`);
    if (h.tagName !== "H1" && /Libertinus/.test(getComputedStyle(h).fontFamily) && h.parentElement?.closest(".rounded-card")) add("serif-in-card", describe(h));
  }
  for (const c of [...document.querySelectorAll("main .rounded-card.border, main fieldset.rounded-card")].filter(shown)) {
    // Standalone panels have their own inset; empty states (dashed), notices, and error summaries are not cards.
    if (c.closest("[data-standalone], [data-workspace]") || c.matches("img, [aria-hidden=true], .border-dashed, [data-notice], [role=alert]")) continue;
    const s = getComputedStyle(c);
    const pad = px(s.paddingLeft);
    if (pad !== 16 && pad !== 0) add("card-inset", `${pad}px ${describe(c)}`);
  }
  const title = document.querySelector("main h1");
  if (title && !document.querySelector("main [data-workspace]")) {
    const edge = Math.round(title.getBoundingClientRect().left);
    // Off the edge means outside it or indented past it; a heading a column away starts a second column.
    const off = (el: Element, left: number) => (left < edge - 1 || (left > edge + 1 && left < edge + 48)) && add("content-edge", `${Math.round(left)}px, page title at ${edge}px: ${describe(el)}`);
    for (const h of [...document.querySelectorAll("main section > div > div > h2")].filter(shown)) if (/Libertinus/.test(getComputedStyle(h).fontFamily) && !h.closest("aside, [data-aside]")) off(h, h.getBoundingClientRect().left);
    const tab = [...document.querySelectorAll("main [role=tablist]")].filter(shown)[0]?.querySelector("[role=tab]");
    if (tab) off(tab, tab.getBoundingClientRect().left + parseFloat(getComputedStyle(tab).paddingLeft));
  }

  // Spacing (docs/design/README.md, Foundations: Spacing): a bordered or filled box at least 8 px from
  // the block above and below it, and text at least 8 px inside the box around it. Rows of a divided
  // list share their borders; controls, pills, and the editor's own widgets are their own boxes.
  const alpha = (c: string) => {
    const m = c.match(/[\d.]+/g) ?? [];
    return m.length >= 4 ? Number(m[3]) : m.length === 3 ? 1 : 0;
  };
  /** The sides with a visible border. */
  const sides = (el: Element) => {
    const s = getComputedStyle(el);
    return (["Top", "Right", "Bottom", "Left"] as const).filter((k) => parseFloat(s[`border${k}Width`]) > 0 && alpha(s[`border${k}Color`]) > 0);
  };
  const bordered = (el: Element) => sides(el).length > 0;
  const filled = (el: Element) => {
    const s = getComputedStyle(el);
    return alpha(s.backgroundColor) > 0.05 && s.backgroundColor !== getComputedStyle(el.parentElement ?? el).backgroundColor;
  };
  const where = (el: Element) => `${describe(el)} .${String(el.className).split(" ").slice(0, 6).join(".")}`;
  // A box is outlined on every side or filled; a one-sided border is a divider, not a box.
  const isBox = (el: Element) => (sides(el).length === 4 || filled(el)) && !el.matches("input, select, textarea, button, a, hr, img, svg, [role=separator]");
  // Controls, pills, inline code, table parts, and the editor's widgets are their own boxes.
  const own = "button, a, input, select, textarea, label, code, kbd, thead, tbody, tr, th, td, [role=tab], [role=tooltip], .rounded-full, .monaco-editor, .react-flow, [data-workspace]";
  const main = document.querySelector("main");
  for (const p of main ? [...main.querySelectorAll("*")] : []) {
    // A table's header and body sections meet by design.
    if (!shown(p) || p.closest(own) || p.matches("table") || /\bdivide-/.test(String(p.className))) continue;
    const kids = [...p.children].filter((c) => shown(c) && !["absolute", "fixed"].includes(getComputedStyle(c).position) && getComputedStyle(c).display !== "inline");
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1]!;
      const b = kids[i]!;
      if (!(isBox(a) || isBox(b)) || (a.tagName === "LI" && b.tagName === "LI")) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.min(ra.right, rb.right) <= Math.max(ra.left, rb.left) || rb.top < ra.bottom - 1) continue;
      const gap = Math.round(rb.top - ra.bottom);
      if (gap < 8) add("stacked-gap", `${gap}px between ${where(a)} and ${where(b)}`);
    }
  }
  const inset = new Set<Element>();
  const texts = main ? document.createTreeWalker(main, NodeFilter.SHOW_TEXT) : undefined;
  for (let n = texts?.nextNode(); n; n = texts!.nextNode()) {
    const el = n.parentElement;
    if (!(n.textContent ?? "").trim() || !el || !shown(el) || el.closest(own) || el.closest("[aria-hidden=true], svg")) continue;
    let box: Element | null = null;
    for (let e: Element | null = el; e && e !== main; e = e.parentElement) {
      if (bordered(e) || filled(e)) {
        box = e;
        break;
      }
    }
    if (!box || box.closest(own) || inset.has(box)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const t = range.getBoundingClientRect();
    const r = box.getBoundingClientRect();
    // Text scrolled out of view in an overflow box is not measured.
    if (t.width < 1 || t.left < r.left || t.right > r.right) continue;
    // Against each bordered side, or every side of a filled box.
    const gaps = { Top: t.top - r.top, Right: r.right - t.right, Bottom: r.bottom - t.bottom, Left: t.left - r.left };
    const d = Math.round(Math.min(...(filled(box) ? Object.values(gaps) : sides(box).map((k) => gaps[k]))));
    if (d < 8) {
      inset.add(box);
      add("text-inset", `${d}px: "${(n.textContent ?? "").trim().slice(0, 30)}" in ${where(box)}`);
    }
  }

  // Horizontal overflow.
  if (document.documentElement.scrollWidth > window.innerWidth + 1) add("overflow-x", `page is ${document.documentElement.scrollWidth}px wide in a ${window.innerWidth}px window`);
  return found;
}

/** Tabs through the first focusable elements and checks each shows an outline or ring. */
async function focusChecks(page: Page): Promise<Finding[]> {
  const found: Finding[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
      const box = el.getBoundingClientRect();
      const hidden = box.bottom < 0 || box.top > window.innerHeight;
      return { ring, hidden, what: `<${el.tagName.toLowerCase()}> "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30)}"` };
    });
    if (!r) break;
    if (!r.ring) found.push({ rule: "focus-visible", detail: `no focus indicator on ${r.what}` });
  }
  return found;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const index = await browser.newPage();
const screens = (await demoScreens(index, base)).filter((s) => only.test(s.href));
await index.close();

const lines = ["# Design and accessibility audit", "", `Demo mode at ${base}, ${new Date().toISOString().slice(0, 16)} UTC, by \`pnpm audit:ui\`, ${scheme} theme. Each screen is checked at 1280 px and 390 px.`, ""];
let total = 0;
/** Pages that did not finish loading; each is audited as far as it loaded. */
let unloaded = 0;
const tally = new Map<string, number>();

async function audit(label: string, href: string, open?: (page: Page) => Promise<void>) {
  const rows: string[] = [];
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
    // tsx keeps function names with a `__name` helper, which the serialized checks call in the page.
    await page.addInitScript({ content: "window.__name = (f) => f;" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]!.slice(0, 160)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().split("\n")[0]!.slice(0, 160));
    });
    await page.goto(base + href, { waitUntil: "networkidle", timeout: 90_000 }).catch((e: Error) => {
      unloaded++;
      console.error(`${href}: ${e.message.split("\n")[0]}; auditing what loaded`);
    });
    if (open) await open(page).catch((e: Error) => errors.push(`could not open ${label}: ${e.message.split("\n")[0]}`));
    await page.waitForTimeout(600);
    const findings = [...(await page.evaluate(pageChecks)), ...(await focusChecks(page)), ...[...new Set(errors)].map((detail) => ({ rule: "console", detail }))];
    for (const f of findings) {
      rows.push(`| ${width} | ${f.rule} | ${f.detail.replaceAll("|", "\\|")} |`);
      tally.set(f.rule, (tally.get(f.rule) ?? 0) + 1);
    }
    total += findings.length;
    await page.close();
  }
  lines.push(`## ${label} (\`${href}\`)`, "");
  lines.push(...(rows.length ? ["| Width | Rule | Detail |", "|---|---|---|", ...rows] : ["No findings."]), "");
  console.log(`${label}: ${rows.length} findings`);
}

for (const s of screens) {
  await audit(s.label, s.href);
  for (const v of VIEWS.filter((v) => v.on.test(s.href))) await audit(v.label, s.href, v.open);
}
lines.splice(4, 0, `${total} findings. By rule: ${[...tally].map(([r, n]) => `${r} ${n}`).join(", ") || "none"}.`, "");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n") + "\n");
await browser.close();
console.log(`${total} findings${unloaded ? `, ${unloaded} pages not loaded` : ""}; wrote ${out}`);
process.exit(total > 0 || unloaded > 0 ? 1 : 0);
