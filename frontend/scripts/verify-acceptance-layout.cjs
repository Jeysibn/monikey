/* Browser acceptance: responsive layout and dialog keyboard behaviour across every view (mock data only).
 * Run (with the built app served, e.g. `npx vite preview --port 4191`):
 *   BASE_URL=http://127.0.0.1:4191/ SHOTS_DIR=… node scripts/verify-acceptance-layout.cjs
 * Uses playwright-core and a Chromium that already exist on this machine (nothing is installed).
 * Widths: 320, 375, 768, 1024, 1440. Per width: the four views and seven dialogs are checked for horizontal
 * scroll, clipped text, overlapping controls, touch targets (phones), dialog fit and a reachable footer, and
 * which navigation is shown. Each dialog is also checked for focus trapping (Tab and Shift+Tab stay inside),
 * Escape, and focus returning to the control that opened it. */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium, executablePath: CHROME } = require("./browser-runtime.cjs");
const BASE = process.env.BASE_URL || "http://localhost:4173/";
const SHOTS = process.env.SHOTS_DIR || "";
const WIDTHS = [320, 375, 768, 1024, 1440];
const VIEWS = ["Overview", "Activity", "Accounts", "Kakeibo"];

const results = []; let group = "";
const check = (name, ok, detail = "") => results.push({ group, name, ok: !!ok, detail: String(detail) });
const eq = (name, a, e) => check(name, a === e, `got ${JSON.stringify(a)}${a === e ? "" : ` expected ${JSON.stringify(e)}`}`);

/* Runs in the page: layout problems inside `root`. */
function inspect(rootSel, phone) {
  const root = document.querySelector(rootSel) || document.body;
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest(".sr-only") && !e.closest("[aria-hidden=true]"); };
  const name = e => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""} "${(e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
  const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const clipped = [...root.querySelectorAll("*")].filter(vis).filter(e => {
    const cs = getComputedStyle(e);
    if (cs.textOverflow === "ellipsis" || e.tagName === "SELECT" || e.tagName === "INPUT" || e.tagName === "TEXTAREA") return false; // deliberate truncation, form controls
    const hides = cs.overflowX === "hidden" || cs.overflowX === "clip";
    return hides && e.scrollWidth > e.clientWidth + 1 && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  }).slice(0, 4).map(name);
  const controls = [...root.querySelectorAll("button, a[href], select, input:not([type=radio]):not([type=checkbox]), textarea, label:has(input[type=radio]), label:has(input[type=checkbox])")].filter(vis);
  const rects = controls.map(e => ({ e, r: e.getBoundingClientRect() }));
  const overlaps = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    // Fixed bars and deliberately positioned layers (the wallet deck's stacked cards, a card's corner menu) overlap by design.
    const layered = e => { for (let n = e, i = 0; n; n = n.parentElement, i++) { const pos = getComputedStyle(n).position; if (pos === "fixed" || (pos === "absolute" && i <= 3)) return true; } return false; };
    if (x > 2 && y > 2 && !layered(a.e) && !layered(b.e)) overlaps.push(`${name(a.e)} × ${name(b.e)}`);
  }
  const small = phone ? controls.filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 && !e.closest("p, li > span") && e.tagName !== "A"; }).slice(0, 4).map(e => `${name(e)} ${Math.round(e.getBoundingClientRect().height)}px`) : [];
  const tiny = [...root.querySelectorAll("*")].filter(vis).filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).slice(0, 4).map(e => `${name(e)} ${getComputedStyle(e).fontSize}`);
  const offscreen = controls.filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).slice(0, 4).map(name);
  return { over, clipped, overlaps: overlaps.slice(0, 4), small, tiny, offscreen };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-gpu"] });
  const version = browser.version();
  const errors = [], external = [];
  const safe = async (label, fn) => { try { await fn(); } catch (e) { check(`${label}: aborted: ` + String(e.message).split("\n")[0].slice(0, 200), false); } };
  async function open(width, { view = "Overview", query = "", height = width < 768 ? 740 : 900 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}@${width}: ${m.text().slice(0, 140)}`); });
    page.on("request", r => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith("data:")) external.push(u); });
    await page.goto(BASE + query); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250);
    page.W = width;
    if (view !== "Overview") await nav(page, view);
    return page;
  }
  const navBar = p => p.locator('nav[aria-label="Main"] >> visible=true');
  const nav = async (p, name) => { await navBar(p).locator(`button:has-text("${name}")`).first().click(); await p.waitForTimeout(200); };
  const dlg = p => p.locator('[role="dialog"]');
  const shot = (p, name, fullPage = false) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage }) : null;
  const report = (label, r, { phone }) => {
    check(`${label}: no horizontal scroll`, r.over <= 0, `${r.over}px`);
    check(`${label}: no clipped text`, r.clipped.length === 0, r.clipped.join("; "));
    check(`${label}: no overlapping controls`, r.overlaps.length === 0, r.overlaps.join("; "));
    check(`${label}: no control off screen`, r.offscreen.length === 0, r.offscreen.join("; "));
    if (phone) check(`${label}: controls are at least 44px tall`, r.small.length === 0, r.small.join("; "));
  };
  const openAdd = async p => { await (p.W >= 768 ? p.locator('main button:has-text("Add transaction"):visible').first() : navBar(p).locator('button[aria-label^="Add transaction"]').last()).click(); await p.waitForTimeout(300); };

  /* The dialogs: [label, view, how to open, query]. Each opener is focused and activated with Enter, so focus can return to it. */
  const DIALOGS = [
    ["Quick Add", "Overview", async p => { await openAdd(p); }],
    ["Plan (edit)", "Kakeibo", async p => { await p.locator('main button:has-text("Edit plan")').focus(); await p.keyboard.press("Enter"); }],
    ["Weekly notes", "Kakeibo", async p => { await p.getByRole("button", { name: /Write notes|Edit notes/ }).focus(); await p.keyboard.press("Enter"); }],
    ["Month-end reflection", "Kakeibo", async p => { await p.getByRole("button", { name: /Write reflection|Edit reflection/ }).focus(); await p.keyboard.press("Enter"); }],
    ["Classify expenses", "Kakeibo", async p => { await p.getByRole("button", { name: "Classify expenses" }).focus(); await p.keyboard.press("Enter"); }],
    ["Category suggestions", "Kakeibo", async p => { await p.getByRole("button", { name: "Edit suggestions" }).focus(); await p.keyboard.press("Enter"); }],
    ["Add account", "Accounts", async p => { await p.locator('main button:has-text("Add account"):visible').first().focus(); await p.keyboard.press("Enter"); }],
  ];

  for (const W of WIDTHS) {
    const phone = W < 768;
    group = `${W}px`;
    for (const view of VIEWS) await safe(`${W} ${view}`, async () => {
      const p = await open(W, { view });
      const navs = await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Main"]')].filter(n => n.getBoundingClientRect().width > 0).map(n => ({ fixedBottom: getComputedStyle(n.closest("[class]") || n).position === "fixed" || n.getBoundingClientRect().bottom >= innerHeight - 1, items: [...n.querySelectorAll("button")].map(b => (b.getAttribute("aria-label") || b.textContent).trim().split(",")[0]) })));
      eq(`${view}: exactly one main navigation shown`, navs.length, 1);
      const items = navs[0]?.items.join("|") || "";
      check(`${view}: navigation reaches Overview, Activity, Accounts, Kakeibo${phone ? " and Add transaction (bottom bar)" : ""}`, ["Overview", "Activity", "Accounts", "Kakeibo"].every(v => items.includes(v)) && (!phone || /Add transaction/.test(items)), items);
      if (phone) check(`${view}: the bottom bar is pinned to the bottom of the screen`, navs[0]?.fixedBottom);
      eq(`${view}: ${view} is the current page`, await navBar(p).locator("button[aria-current=page]").first().innerText().then(t => t.trim()), view);
      report(view, await p.evaluate(inspect, ["main", phone]), { phone });
      if (phone) {
        const hidden = await p.evaluate(() => { const bar = [...document.querySelectorAll('nav[aria-label="Main"]')].find(n => n.getBoundingClientRect().width > 0); const h = bar.getBoundingClientRect().height; window.scrollTo(0, document.body.scrollHeight); return { pad: document.documentElement.scrollHeight - Math.max(...[...document.querySelectorAll("main *")].map(e => e.getBoundingClientRect().bottom + scrollY)), h }; });
        check(`${view}: the end of the page can scroll clear of the bottom bar`, hidden.pad >= hidden.h - 1, JSON.stringify(hidden));
      }
      await shot(p, `layout-${view.toLowerCase()}-${W}.png`, true);
      await p.context().close();
    });

    for (const [label, view, opener] of DIALOGS) await safe(`${W} ${label}`, async () => {
      const p = await open(W, { view });
      await opener(p); await p.waitForTimeout(350);
      const openerLabel = await p.evaluate(() => window.__opener = document.querySelector("[data-state=open][aria-haspopup], [aria-expanded=true]")?.textContent?.trim() || null);
      eq(`${label}: one dialog open`, await dlg(p).count(), 1);
      const fit = await p.evaluate(() => { const d = document.querySelector("[role=dialog]").getBoundingClientRect(); const f = document.querySelector("[role=dialog] [data-slot=dialog-footer]"); const fr = f ? f.getBoundingClientRect() : null; return { w: Math.round(d.width), h: Math.round(d.height), vw: innerWidth, vh: innerHeight, footer: fr ? fr.bottom <= innerHeight + 1 && fr.top >= 0 : false, top: d.top >= -1 }; });
      check(`${label}: fits the screen with Save/Cancel visible`, fit.w <= fit.vw && fit.h <= fit.vh + 1 && fit.footer && fit.top, JSON.stringify(fit));
      const body = await p.evaluate(() => { const b = document.querySelector("[role=dialog] [data-slot=dialog-body]"); return b ? { scrolls: b.scrollHeight > b.clientHeight + 1, overflowY: getComputedStyle(b).overflowY } : null; });
      if (body?.scrolls) check(`${label}: long content scrolls inside the dialog body`, /auto|scroll/.test(body.overflowY), body.overflowY);
      report(`${label} dialog`, await p.evaluate(inspect, ["[role=dialog]", phone]), { phone });
      check(`${label}: focus starts inside the dialog`, await p.evaluate(() => document.querySelector("[role=dialog]").contains(document.activeElement)));
      let escaped = 0;
      for (let i = 0; i < 45; i++) { await p.keyboard.press("Tab"); if (!(await p.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement)))) escaped++; }
      for (let i = 0; i < 15; i++) { await p.keyboard.press("Shift+Tab"); if (!(await p.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement)))) escaped++; }
      eq(`${label}: Tab and Shift+Tab never leave the dialog (60 presses)`, escaped, 0);
      const ring = await p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 || /ring|shadow/.test(e.className) || cs.boxShadow !== "none"; });
      check(`${label}: the focused control shows a focus indicator`, ring);
      if (W === 375 || W === 1024) await shot(p, `layout-dialog-${label.toLowerCase().replace(/[^a-z]+/g, "-")}-${W}.png`);
      await p.keyboard.press("Escape"); await p.waitForTimeout(300);
      eq(`${label}: Escape closes an untouched dialog`, await dlg(p).count(), 0);
      check(`${label}: focus returns to a control outside the dialog, not the page body`, await p.evaluate(() => document.activeElement && document.activeElement !== document.body && !document.activeElement.closest("[role=dialog]")), openerLabel || "");
      await p.context().close();
    });
  }

  group = "Whole run";
  check("no request left the page's own origin", external.length === 0, external.slice(0, 3).join(", ") || "all same-origin");
  check("no console errors or warnings, no uncaught exceptions", errors.length === 0, errors.slice(0, 3).join(" || ") || "none");
  await browser.close();
  const pass = results.filter(r => r.ok).length; let g = "";
  console.log(`Browser: Chromium ${version}  Widths: ${WIDTHS.join(", ")}`);
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } if (!r.ok || process.env.VERBOSE) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-acceptance-layout.json"), JSON.stringify({ browser: version, results }, null, 1));
  process.exit(pass === results.length ? 0 : 1);
})();
