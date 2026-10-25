/* eslint-disable no-unused-expressions -- `cond ? ok(...) : find(...)` is the script's reporting idiom */
/* Milestone 4.7 accessibility and responsive audit (read-only; reports findings, changes nothing).
 * Run (with `npx vite --port 4291` serving the app):  BASE_URL=http://localhost:4291/ node scripts/audit-a11y.cjs
 * Uses playwright-core and a Chromium that already exist on this machine (nothing is installed, no network).
 * It is an automated first pass: contrast, names, structure, targets, focus, reflow, motion, dialogs, worst-case content.
 * It does NOT replace testing on real phones, other browsers or with a screen reader. */
const path = require("path");
const fs = require("fs");
const os = require("os");
const PW = process.env.PW_CORE || path.join(os.homedir(), ".agent-reach/tools/node/lib/node_modules/@playwright/cli/node_modules/playwright-core");
const { chromium } = require(PW);
const CHROME = process.env.CHROME_BIN || fs.readdirSync(path.join(os.homedir(), ".cache/ms-playwright")).filter(d => d.startsWith("chromium-")).sort().reverse().map(d => path.join(os.homedir(), ".cache/ms-playwright", d, "chrome-linux64/chrome")).find(p => fs.existsSync(p));
const BASE = process.env.BASE_URL || "http://localhost:4173/";
const SHOTS = process.env.SHOTS_DIR || "";

const findings = []; let group = "";
const find = (severity, where, what) => findings.push({ group, severity, where, what: String(what) });
const ok = (name) => findings.push({ group, severity: "ok", where: "", what: name });

/* ---- helpers that run inside the page ---- */
const PAGE_HELPERS = `
  window.__rgba = (css) => { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d", { willReadFrequently: true }); x.clearRect(0,0,1,1); x.fillStyle = "#000"; x.fillStyle = css; x.fillRect(0,0,1,1); const d = x.getImageData(0,0,1,1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  window.__lum = (r,g,b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
  window.__ratio = (a, b) => { const la = __lum(a[0],a[1],a[2]), lb = __lum(b[0],b[1],b[2]); return (Math.max(la,lb) + 0.05) / (Math.min(la,lb) + 0.05); };
  window.__blend = (top, bottom) => { const a = top[3]; return [top[0]*a + bottom[0]*(1-a), top[1]*a + bottom[1]*(1-a), top[2]*a + bottom[2]*(1-a), 1]; };
  window.__bg = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); const c = __rgba(cs.backgroundColor); if (c[3] > 0) chain.push(c); if (c[3] === 1) break; } let out = [255,255,255,1]; for (let i = chain.length - 1; i >= 0; i--) out = __blend(chain[i], out); return out; };
  window.__vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
  window.__name = (e) => { const lb = e.getAttribute("aria-labelledby"); if (lb) return lb.split(" ").map(id => document.getElementById(id)?.textContent || "").join(" ").trim(); const al = e.getAttribute("aria-label"); if (al) return al.trim(); if (e.id) { const l = document.querySelector('label[for="' + CSS.escape(e.id) + '"]'); if (l) return l.textContent.trim(); } const wrap = e.closest("label"); if (wrap && e.tagName === "INPUT") return wrap.textContent.trim(); const t = e.getAttribute("title"); return (e.innerText || e.textContent || "").trim() || (t || ""); };
  window.__sel = (e) => { let s = e.tagName.toLowerCase(); if (e.id) s += "#" + e.id; const al = e.getAttribute("aria-label"); if (al) s += '[aria-label="' + al.slice(0,30) + '"]'; else { const t = (e.textContent || "").trim().replace(/\\s+/g," ").slice(0,24); if (t) s += ' "' + t + '"'; } return s; };
`;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-gpu"] });
  const errors = [], external = [];
  const safe = async (label, fn) => { try { await fn(); } catch (e) { find("error", label, "audit step aborted: " + String(e.message).split("\n")[0].slice(0, 200)); } };
  async function open(width, { query = "", height = 900, view = "Overview", ctxOpts = {} } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, ...ctxOpts });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}${query}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}@${width}${query}: ${m.text().slice(0, 140)}`); });
    page.on("request", r => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith("data:")) external.push(u); });
    await page.goto(BASE + query); await page.evaluate(() => document.fonts.ready);
    // Figures arrive a moment after the page, and the Add button fades from disabled to enabled over 150ms: measure the settled page.
    if (!/demo=loading/.test(query)) {
      await page.waitForSelector('main [aria-busy="false"]', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    await page.addScriptTag({ content: PAGE_HELPERS });
    page.W = width; page.big = width >= 768;
    if (view !== "Overview") await nav(page, view);
    return page;
  }
  const nav = async (p, name) => { await p.locator(`nav[aria-label="Main"] >> visible=true >> button:has-text("${name}")`).first().click(); await p.waitForTimeout(100); };
  const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage: false }) : null;
  const VIEWS = ["Overview", "Activity", "Accounts"];

  /* ------------------------------------------------------------ 1. structure and names, per view */
  group = "Structure and names";
  for (const view of VIEWS) await safe(view, async () => {
    const p = await open(1280, { view });
    const r = await p.evaluate(() => {
      const out = {};
      out.lang = document.documentElement.lang; out.title = document.title;
      out.viewport = document.querySelector('meta[name=viewport]')?.content;
      out.mains = document.querySelectorAll("main").length;
      out.h1 = [...document.querySelectorAll("h1")].filter(__vis).length;
      const hs = [...document.querySelectorAll("h1,h2,h3,h4")].filter(__vis).map(h => +h.tagName[1]);
      out.skips = hs.some((l, i) => i > 0 && l - hs[i - 1] > 1);
      const ids = [...document.querySelectorAll("[id]")].map(e => e.id); out.dupIds = ids.filter((x, i) => ids.indexOf(x) !== i);
      out.navs = [...document.querySelectorAll("nav")].map(n => n.getAttribute("aria-label"));
      out.unnamed = [...document.querySelectorAll("button, a[href], input, select, textarea, [role=button], [role=img]")].filter(__vis).filter(e => !__name(e)).map(__sel);
      out.posTab = [...document.querySelectorAll("[tabindex]")].filter(e => +e.getAttribute("tabindex") > 0).map(__sel);
      out.imgNoAlt = [...document.querySelectorAll("img:not([alt])")].map(__sel);
      out.ariaHiddenFocusable = [...document.querySelectorAll('[aria-hidden="true"] button, [aria-hidden="true"] a[href], [aria-hidden="true"] input, [aria-hidden="true"] select')].map(__sel);
      out.currentCount = [...document.querySelectorAll('nav [aria-current="page"]')].filter(__vis).length;
      return out;
    });
    const w = view;
    r.lang === "en" ? ok(`${w}: lang="en"`) : find("serious", w, `html lang is "${r.lang}"`);
    r.title ? ok(`${w}: has a title ("${r.title}")`) : find("serious", w, "no <title>");
    /user-scalable\s*=\s*no|maximum-scale\s*=\s*1\b/.test(r.viewport || "") ? find("serious", w, "viewport blocks zoom: " + r.viewport) : ok(`${w}: pinch zoom is not blocked`);
    r.mains === 1 ? ok(`${w}: exactly one <main>`) : find("serious", w, `${r.mains} <main> elements`);
    r.h1 === 1 ? ok(`${w}: exactly one visible h1`) : find("serious", w, `${r.h1} visible h1`);
    r.skips ? find("moderate", w, "heading levels skip") : ok(`${w}: heading levels do not skip`);
    r.dupIds.length ? find("serious", w, "duplicate ids: " + r.dupIds.join(", ")) : ok(`${w}: no duplicate ids`);
    r.navs.every(Boolean) ? ok(`${w}: every nav landmark is named (${r.navs.join(", ")})`) : find("moderate", w, "unnamed nav landmark");
    r.unnamed.length ? find("critical", w, "controls without an accessible name: " + r.unnamed.join("; ")) : ok(`${w}: every visible control has an accessible name`);
    r.posTab.length ? find("moderate", w, "positive tabindex: " + r.posTab.join(", ")) : ok(`${w}: no positive tabindex`);
    r.ariaHiddenFocusable.length ? find("serious", w, "focusable inside aria-hidden: " + r.ariaHiddenFocusable.join("; ")) : ok(`${w}: nothing focusable is hidden from assistive tech`);
    r.currentCount === 1 ? ok(`${w}: exactly one aria-current nav item`) : find("moderate", w, `${r.currentCount} aria-current items`);
    await p.context().close();
  });

  /* ------------------------------------------------------------ 2. contrast of rendered text and UI borders */
  group = "Contrast (rendered)";
  const contrastRun = async (view, query = "") => {
    const p = await open(375, { view, query });
    const r = await p.evaluate(() => {
      const bad = [], seen = new Set(); let checked = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent.trim(); if (!t) continue;
        const e = n.parentElement; if (!e || !__vis(e) || e.closest(".sr-only") || e.closest("[aria-hidden=true]") && !e.closest("button")) continue;
        const cs = getComputedStyle(e); const fg0 = __rgba(cs.color); const bg = __bg(e); const fg = fg0[3] < 1 ? __blend(fg0, bg) : fg0;
        const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = size >= 24 || (size >= 18.66 && bold);
        const need = large ? 3 : 4.5; const ratio = __ratio(fg, bg); checked++;
        const disabled = e.closest("button:disabled, fieldset:disabled, [disabled]");
        if (ratio < need && !disabled) { const key = __sel(e) + ratio.toFixed(2); if (!seen.has(key)) { seen.add(key); bad.push(`${__sel(e)} ${ratio.toFixed(2)}:1 (needs ${need}) ${cs.color} on rgb(${bg.slice(0,3).map(Math.round)})`); } }
      }
      const borders = [];
      for (const e of document.querySelectorAll("input:not([type=radio]), select")) { if (!__vis(e)) continue; const cs = getComputedStyle(e); const bc = __rgba(cs.borderTopColor); const bg = __bg(e.parentElement); const ratio = __ratio(__blend(bc, bg), bg); if (ratio < 3) borders.push(`${__sel(e)} border ${ratio.toFixed(2)}:1`); }
      return { bad, checked, borders };
    });
    r.bad.length ? r.bad.forEach(b => find("serious", `${view}${query}`, "text contrast: " + b)) : ok(`${view}${query}: ${r.checked} text runs all meet WCAG AA contrast`);
    r.borders.forEach(b => find("serious", `${view}${query}`, "field border below 3:1: " + b));
    await p.context().close();
  };
  for (const v of VIEWS) await safe("contrast " + v, () => contrastRun(v));
  await safe("contrast over-limit", () => contrastRun("Accounts", "?demo=over-limit"));
  await safe("contrast overpaid", () => contrastRun("Overview", "?demo=overpaid"));
  await safe("contrast negative", () => contrastRun("Accounts", "?demo=negative"));
  for (const v of VIEWS) await safe("contrast offline " + v, () => contrastRun(v, "?demo=offline")); // the failure blocks and their Retry buttons

  /* ------------------------------------------------------------ 3. targets, overflow, truncation across widths */
  group = "Responsive: width sweep";
  const WIDTHS = [320, 360, 375, 414, 768, 1024, 1280, 1920];
  for (const view of VIEWS) for (const W of WIDTHS) await safe(`${view}@${W}`, async () => {
    const p = await open(W, { view, query: view === "Activity" ? "?demo=many" : "" });
    const r = await p.evaluate((W) => {
      const vw = document.documentElement.clientWidth;
      const over = document.documentElement.scrollWidth > vw + 1;
      const offenders = [...document.querySelectorAll("main *, nav *")].filter(__vis).filter(e => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; }).filter(e => !e.closest(".sr-only")).slice(0, 4).map(__sel);
      const small = W < 768 ? [...document.querySelectorAll("button, select, input:not([type=radio]), a[href], [role=button]")].filter(__vis).filter(e => !e.closest(".sr-only") && !e.closest("p")).map(e => ({ s: __sel(e), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })).filter(x => Math.min(x.h, x.w) < 44) : [];
      const tiny = [...document.querySelectorAll("button, select, input:not([type=radio]), a[href], [role=button]")].filter(__vis).filter(e => !e.closest(".sr-only") && !e.closest("p")).map(e => ({ s: __sel(e), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })).filter(x => Math.min(x.h, x.w) < 24);
      const clipped = [...document.querySelectorAll("main *")].filter(__vis).filter(e => !e.closest(".sr-only")).filter(e => { const cs = getComputedStyle(e); return (cs.overflow === "hidden" || cs.overflowX === "hidden") && cs.textOverflow !== "ellipsis" && e.scrollWidth > e.clientWidth + 1 && e.children.length === 0 && e.textContent.trim(); }).slice(0, 3).map(__sel);
      const smallText = [...document.querySelectorAll("main *")].filter(__vis).filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12 && !e.closest(".sr-only")).map(__sel).slice(0, 3);
      // The text of a select (what is chosen) must fit inside the select, next to its arrow.
      const cv = document.createElement("canvas").getContext("2d");
      const selectCut = [...document.querySelectorAll("select")].filter(__vis).filter(s => { const cs = getComputedStyle(s); cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; const text = s.options[s.selectedIndex]?.text || ""; return cv.measureText(text).width > s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(s => __sel(s) + " shows \"" + (s.options[s.selectedIndex]?.text || "") + "\"");
      // An ordinary amount must never break across lines at the normal text size (only the very largest may, as a last resort).
      const wrapped = [...document.querySelectorAll("main *")].filter(__vis).filter(e => e.children.length <= 1 && /^[−+]?₱[\d,]{1,9}\.\d{2}(\s*owed)?$/.test(e.textContent.trim())).filter(e => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map(x => Math.round(x.top / 4))).size > 1; }).slice(0, 3).map(e => e.textContent.trim());
      return { over, offenders, small, tiny, clipped, smallText, wrapped, selectCut };
    }, W);
    const w = `${view}@${W}`;
    if (r.over) find("critical", w, "horizontal scroll: " + r.offenders.join("; "));
    if (r.small.length) find("moderate", w, "touch targets under 44px: " + r.small.slice(0, 5).map(x => `${x.s} ${x.w}×${x.h}`).join("; "));
    if (r.tiny.length) find("serious", w, "targets under 24px (WCAG 2.2 minimum): " + r.tiny.map(x => `${x.s} ${x.w}×${x.h}`).join("; "));
    if (r.clipped.length) find("moderate", w, "text clipped without ellipsis: " + r.clipped.join("; "));
    if (r.selectCut.length) find("serious", w, "select text is cut off: " + r.selectCut.join("; "));
    if (r.wrapped.length) find("serious", w, "an ordinary amount breaks across lines: " + r.wrapped.join("; "));
    if (r.smallText.length) find("moderate", w, "text under 12px: " + r.smallText.join("; "));
    if (!r.over && !r.small.length && !r.tiny.length && !r.clipped.length && !r.smallText.length && !r.wrapped.length && !r.selectCut.length) ok(`${w}: no overflow, targets ≥44px (phones), no clipping`);
    await p.context().close();
  });

  /* ------------------------------------------------------------ 4. keyboard: focus visible, not obscured, order */
  group = "Keyboard and focus";
  for (const [view, W] of [["Overview", 375], ["Activity", 375], ["Accounts", 375], ["Overview", 1280], ["Activity", 1280], ["Accounts", 1280]]) await safe(`focus ${view}@${W}`, async () => {
    const p = await open(W, { view });
    await p.evaluate(() => document.body.focus()); await p.mouse.click(2, 2);
    const stops = [];
    for (let i = 0; i < 70; i++) {
      await p.keyboard.press("Tab");
      const s = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); const bars = [...document.querySelectorAll("nav")].filter(__vis).map(n => n.getBoundingClientRect()).filter(b => b.top > innerHeight / 2 && b.width >= innerWidth - 2)[0]; const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0; const shadow = cs.boxShadow !== "none"; const insideBar = !!e.closest("nav"); return { s: __sel(e), top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom), visible: outline || shadow, obscured: !insideBar && bars && r.bottom > bars.top + 1 && r.top < bars.bottom, inView: r.bottom > 0 && r.top < innerHeight }; });
      if (!s) break; if (stops.length && stops[0].s === s.s && stops.length > 2) break; stops.push(s);
    }
    const w = `${view}@${W}`;
    stops.length ? ok(`${w}: ${stops.length} tab stops reached`) : find("critical", w, "no tab stops");
    const invisible = stops.filter(s => !s.visible); invisible.length ? find("serious", w, "no visible focus indicator on: " + invisible.map(s => s.s).join("; ")) : ok(`${w}: every focused control shows a focus indicator`);
    const obscured = stops.filter(s => s.obscured); obscured.length ? find("serious", w, "focused control hidden under the fixed bottom bar: " + obscured.map(s => s.s).join("; ")) : ok(`${w}: no focused control is hidden under the fixed bar`);
    await p.context().close();
  });

  /* ------------------------------------------------------------ 5. dialogs */
  group = "Dialogs";
  const dialogChecks = async (label, W, H, openFn, query = "") => {
    const p = await open(W, { height: H, query, view: label.startsWith("Edit") || label.startsWith("Delete") ? "Activity" : "Overview" });
    await openFn(p); await p.waitForTimeout(200);
    const r = await p.evaluate(async () => {
      const d = document.querySelector("[role=dialog]"); if (!d) return { none: true };
      const lb = d.getAttribute("aria-labelledby"), ds = d.getAttribute("aria-describedby");
      const out = { role: d.getAttribute("role"), modal: d.getAttribute("aria-modal"), labelled: !!(lb && document.getElementById(lb)?.textContent.trim()), described: !ds || !!document.getElementById(ds), titleCount: d.querySelectorAll("[data-slot=dialog-title]").length };
      // Radix hides everything outside the dialog except the live region that announces saves, so check what a reader could reach:
      const behind = [...document.querySelectorAll("button, a[href], input, select, textarea, h1, h2, h3, [role=img]")].filter(e => !d.contains(e) && !e.closest("[role=status]") && __vis(e));
      out.leaks = behind.filter(e => !e.closest('[aria-hidden="true"]')).slice(0, 4).map(__sel); out.outsideHidden = out.leaks.length === 0;
      out.scrollLock = getComputedStyle(document.body).overflow === "hidden" || document.body.hasAttribute("data-scroll-locked");
      const r = d.getBoundingClientRect(); out.fits = r.height <= innerHeight * 0.92 + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
      const foot = [...d.querySelectorAll("[data-slot=dialog-footer]")].find(__vis); out.footVisible = !!foot && foot.getBoundingClientRect().bottom <= innerHeight + 1;
      const body = [...d.querySelectorAll("[data-slot=dialog-body]")].find(__vis); out.bodyScrolls = body ? body.scrollHeight > body.clientHeight : false;
      return out;
    });
    if (r.none) { find("critical", label, "dialog did not open"); await p.context().close(); return; }
    const w = `${label} @${W}×${H}`;
    r.role === "dialog" ? ok(`${w}: role=dialog`) : find("serious", w, "no dialog role");
    r.labelled ? ok(`${w}: named by its title`) : find("serious", w, "dialog has no accessible name");
    r.described ? ok(`${w}: aria-describedby points at something real`) : find("moderate", w, "aria-describedby points at a missing element");
    r.titleCount <= 1 ? ok(`${w}: one title in the DOM`) : find("serious", w, `${r.titleCount} dialog titles (duplicate id risk)`);
    r.outsideHidden ? ok(`${w}: the page behind is hidden from assistive tech`) : find("serious", w, "content behind the dialog is still exposed to assistive tech: " + r.leaks.join("; "));
    r.scrollLock ? ok(`${w}: page scroll is locked`) : find("moderate", w, "page behind can still scroll");
    r.fits ? ok(`${w}: fits the viewport (≤92%)`) : find("serious", w, "dialog taller than 92% of the viewport");
    r.footVisible ? ok(`${w}: footer buttons visible${r.bodyScrolls ? " (body scrolls)" : ""}`) : find("serious", w, "footer buttons are off screen");
    // focus trap: 40 Tabs and Shift+Tabs never leave the dialog
    let escaped = null;
    for (let i = 0; i < 40 && !escaped; i++) { await p.keyboard.press(i % 7 === 6 ? "Shift+Tab" : "Tab"); const inside = await p.evaluate(() => !!document.activeElement?.closest("[role=dialog]")); if (!inside) escaped = i; }
    escaped === null ? ok(`${w}: focus stays inside while tabbing`) : find("critical", w, `focus left the dialog after ${escaped + 1} Tab presses`);
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    (await p.locator("[role=dialog]").count()) === 0 ? ok(`${w}: Escape closes it`) : find("serious", w, "Escape did not close it (it may have unsaved input; check)");
    await p.context().close();
  };
  const addBtn = p => (p.big ? p.locator('main button:has-text("Add transaction"):visible').first() : p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Add")').last()).click();
  const editRow = p => (p.big ? p.locator('button[aria-label^="Edit Lunch"]') : p.locator('li button[data-row="t-17"]:visible')).click();
  const delRow = p => p.locator('button[aria-label^="Delete Lunch"]').click();
  const addAcc = async p => { await nav(p, "Accounts"); await p.locator('main button:has-text("Add account"):visible').first().click(); };
  for (const [W, H] of [[375, 812], [1280, 800], [667, 375], [320, 480]]) {
    await safe(`dialogs@${W}x${H}`, async () => {
      await dialogChecks("Quick Add", W, H, addBtn);
      await dialogChecks("Edit entry", W, H, editRow);
      if (W >= 768) await dialogChecks("Delete confirmation", W, H, delRow);
      await dialogChecks("Add account", W, H, addAcc);
    });
  }

  /* ------------------------------------------------------------ 6. zoom, reflow, text size, motion */
  group = "Zoom, text size, motion";
  for (const view of VIEWS) await safe(`reflow ${view}`, async () => {
    const p = await open(320, { view, height: 640 }); // 320 CSS px = 400% zoom of a 1280 window (WCAG 1.4.10)
    const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
    r.over ? find("critical", `${view}@320 (400% zoom)`, "needs horizontal scrolling") : ok(`${view}: reflows at 320px (400% zoom) without horizontal scrolling`);
    await p.context().close();
  });
  for (const view of VIEWS) await safe(`text200 ${view}`, async () => {
    const p = await open(375, { view });
    await p.evaluate(() => { document.documentElement.style.fontSize = "200%"; }); await p.waitForTimeout(150);
    const r = await p.evaluate(() => { const vw = document.documentElement.clientWidth; return { over: document.documentElement.scrollWidth > vw + 1, offenders: [...document.querySelectorAll("main *, nav *")].filter(__vis).filter(e => e.getBoundingClientRect().right > vw + 1).slice(0, 3).map(__sel), clipped: [...document.querySelectorAll("main *, nav *")].filter(__vis).filter(e => !e.closest(".sr-only")).filter(e => { const cs = getComputedStyle(e); return cs.overflow === "hidden" && cs.textOverflow !== "ellipsis" && e.scrollHeight > e.clientHeight + 2 && e.children.length === 0 && e.textContent.trim(); }).slice(0, 3).map(__sel) }; });
    r.over ? find("serious", `${view}: text at 200%`, "horizontal scroll: " + r.offenders.join("; ")) : ok(`${view}: text at 200% causes no horizontal scroll`);
    if (r.clipped.length) find("serious", `${view}: text at 200%`, "text clipped vertically: " + r.clipped.join("; "));
    if (view === "Overview") await shot(p, "audit-text200-overview-375.png");
    await p.context().close();
  });
  await safe("dialog text200", async () => {
    const p = await open(375, { view: "Overview", height: 812 }); await p.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await addBtn(p); await p.waitForTimeout(200);
    const r = await p.evaluate(() => { const d = document.querySelector("[role=dialog]"); const f = [...d.querySelectorAll("[data-slot=dialog-footer]")].find(__vis).getBoundingClientRect(); const body = d.querySelector("[data-slot=dialog-body]"); return { footVisible: f.bottom <= innerHeight + 1, scrolls: body.scrollHeight > body.clientHeight, over: d.scrollWidth > d.clientWidth + 1 }; });
    r.footVisible && !r.over ? ok(`Quick Add with text at 200%: footer stays visible${r.scrolls ? ", body scrolls" : ""}, no sideways overflow`) : find("serious", "Quick Add with text at 200%", JSON.stringify(r));
    await shot(p, "audit-text200-quickadd-375.png"); await p.context().close();
  });
  await safe("reduced motion", async () => {
    const p = await open(375, { view: "Overview", ctxOpts: { reducedMotion: "reduce" } });
    await addBtn(p); await p.waitForTimeout(100);
    const n = await p.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length);
    n === 0 ? ok("prefers-reduced-motion: no animation is running (dialog open)") : find("moderate", "reduced motion", `${n} animations still running`);
    await p.context().close();
  });

  /* ------------------------------------------------------------ 7. vision deficiency and forced colours (screenshots + checks) */
  group = "Colour vision and forced colours";
  for (const kind of ["deuteranopia", "protanopia", "tritanopia", "achromatopsia"]) await safe(kind, async () => {
    const p = await open(375, { view: "Overview" });
    const cdp = await p.context().newCDPSession(p); await cdp.send("Emulation.setEmulatedVisionDeficiency", { type: kind });
    await p.waitForTimeout(100); await shot(p, `audit-${kind}-overview-375.png`);
    await p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Accounts")').first().click(); await p.waitForTimeout(100); await shot(p, `audit-${kind}-accounts-375.png`);
    ok(`${kind}: screenshots captured (reviewed by eye, see the record)`); await p.context().close();
  });
  await safe("forced colors", async () => {
    const p = await open(375, { view: "Overview", ctxOpts: { forcedColors: "active" }, height: 812 });
    await addBtn(p); await p.waitForTimeout(150);
    await shot(p, "audit-forced-colors-quickadd-375.png");
    const r = await p.evaluate(() => { const seg = [...document.querySelectorAll("fieldset label")].filter(l => l.querySelector("input[name=qa-kind]")); const sel = seg.find(l => l.querySelector("input").checked); const other = seg.find(l => !l.querySelector("input").checked); const a = getComputedStyle(sel.querySelector("span")), b = getComputedStyle(other.querySelector("span")); return { same: a.backgroundColor === b.backgroundColor && a.borderTopColor === b.borderTopColor && a.outlineStyle === b.outlineStyle && a.color === b.color, checkIcon: !!sel.querySelector("svg") }; });
    r.same && !r.checkIcon ? find("serious", "forced colors: type switch", "the selected option looks identical to the others when colours are forced (no check mark, no border)") : ok("forced colors: the selected type option is still distinguishable");
    await p.context().close();
  });

  /* ------------------------------------------------------------ 8. keyboard-only journey */
  group = "Keyboard-only journey";
  await safe("keyboard journey", async () => {
    const p = await open(1280, { view: "Activity" });
    const K = k => p.keyboard.press(k);
    await p.locator('main button:has-text("Add transaction"):visible').first().focus(); await K("Enter"); await p.waitForTimeout(200);
    await p.keyboard.type("45.50");
    await K("Tab"); // hint link "Use Pay card"? find the account select by focusing it through Tab order
    let reached = false;
    for (let i = 0; i < 6 && !reached; i++) { reached = await p.evaluate(() => document.activeElement?.id === "qa-account"); if (!reached) await K("Tab"); }
    reached ? ok("Quick Add: Tab reaches Account from Amount") : find("serious", "keyboard journey", "could not Tab from Amount to Account");
    await p.keyboard.type("Cash"); // a closed native select picks the option that starts with the typed letters
    (await p.inputValue("#qa-account")) === "1" ? ok("Quick Add: typing 'Cash' on the Account select chooses Cash on hand") : find("serious", "keyboard journey", "typing on the Account select did not choose Cash on hand");
    await K("Tab"); const onChip = await p.evaluate(() => document.activeElement?.name === "qa-category");
    onChip ? ok("Quick Add: Tab moves into the category group") : find("serious", "keyboard journey", "Tab from Account did not reach the category chips");
    await K("ArrowRight"); await K("ArrowRight"); await K("Space");
    const picked = await p.evaluate(() => document.querySelector("input[name=qa-category]:checked")?.parentElement.innerText.trim());
    picked ? ok(`Quick Add: arrow keys + Space choose a category ("${picked}")`) : find("serious", "keyboard journey", "arrow keys and Space did not select a category chip");
    for (let i = 0; i < 12; i++) { if (await p.evaluate(() => document.activeElement?.type === "submit")) break; await K("Tab"); }
    await K("Enter"); await p.waitForFunction(() => /saved/.test(document.querySelector('[role=status][aria-live=polite]')?.textContent || ""), null, { timeout: 3000 }).catch(() => {});
    const saved = await p.locator('[role=status][aria-live=polite]').first().innerText();
    /Expense saved: −₱45\.50 from Cash on hand\./.test(saved.replace(/\s+/g, " ")) ? ok("Quick Add: the whole journey works with the keyboard only") : find("serious", "keyboard journey", "journey did not finish: " + saved.replace(/\s+/g, " ").slice(0, 100));
    await p.context().close();
  });

  /* ------------------------------------------------------------ 9. worst-case content, entered through the UI */
  group = "Worst-case content (long names, huge amounts)";
  for (const W of [320, 375, 1280]) await safe(`worst@${W}`, async () => {
    const p = await open(W, { view: "Accounts", height: 900 });
    const longName = "Ñandú Cooperativa de Ahorro y Crédito de los Trabajadores del Mercado 60"; // 60+ chars, accents
    await p.locator('main button:has-text("Add account"):visible').first().click(); await p.waitForTimeout(150);
    await p.fill("#aa-name", longName.slice(0, 60)); await p.locator("label:has(input[value=bank])").click(); await p.fill("#aa-balance", "9,999,999,999.99");
    await p.locator("[role=dialog] button[type=submit]").click(); await p.waitForTimeout(250);
    await p.locator('main button:has-text("Add credit card")').click(); await p.waitForTimeout(150);
    await p.fill("#aa-name", "Tarjeta de crédito con un nombre muy largo que no cabe ahí"); await p.fill("#aa-limit", "9,999,999,999.99"); await p.fill("#aa-owed", "9,999,999,999.99");
    await p.locator("[role=dialog] button[type=submit]").click(); await p.waitForTimeout(250);
    const r = async () => p.evaluate(() => { const vw = document.documentElement.clientWidth; return { over: document.documentElement.scrollWidth > vw + 1, off: [...document.querySelectorAll("main *")].filter(__vis).filter(e => e.getBoundingClientRect().right > vw + 1).slice(0, 4).map(__sel), amountsClipped: [...document.querySelectorAll("main *")].filter(__vis).filter(e => /₱[\d,]{9,}/.test(e.textContent) && e.children.length === 0 && e.scrollWidth > e.clientWidth + 1).map(__sel).slice(0, 3), tinyText: [...document.querySelectorAll("main *")].filter(__vis).filter(e => !e.closest(".sr-only") && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11.99).map(e => __sel(e) + " " + parseFloat(getComputedStyle(e).fontSize).toFixed(1) + "px").slice(0, 4) }; });
    let x = await r(); if (x.over || x.amountsClipped.length || x.tinyText.length) find("serious", `Accounts@${W} worst case`, `${x.over ? "horizontal scroll: " + x.off.join("; ") : ""} ${x.amountsClipped.length ? "amount clipped: " + x.amountsClipped.join("; ") : ""} ${x.tinyText.length ? "text under 12px: " + x.tinyText.join("; ") : ""}`); else ok(`Accounts@${W}: long names and ₱9,999,999,999.99 fit`);
    if (W === 320) await shot(p, "audit-worst-accounts-320.png");
    // a long note and a huge amount in Activity
    await (W >= 768 ? p.locator('main button:has-text("Add transaction"):visible').first() : p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Add")').last()).click(); await p.waitForTimeout(150);
    await p.fill("#qa-amount", "9,999,999,999.99"); await p.selectOption("#qa-account", "1"); await p.locator("label:has(input[name=qa-category]):has-text('Food')").click(); await p.fill("#qa-note", "N".repeat(40) + " " + "ñ".repeat(79));
    await p.locator("[role=dialog] button[type=submit]").click(); await p.waitForTimeout(250);
    await nav(p, "Activity"); x = await r();
    if (x.over || x.amountsClipped.length || x.tinyText.length) find("serious", `Activity@${W} worst case`, `${x.over ? "horizontal scroll: " + x.off.join("; ") : ""} ${x.amountsClipped.length ? "amount clipped: " + x.amountsClipped.join("; ") : ""} ${x.tinyText.length ? "text under 12px: " + x.tinyText.join("; ") : ""}`); else ok(`Activity@${W}: a 120-character note and a ₱9,999,999,999.99 amount fit`);
    if (W === 320) await shot(p, "audit-worst-activity-320.png");
    await nav(p, "Overview"); x = await r();
    if (x.over || x.amountsClipped.length || x.tinyText.length) find("serious", `Overview@${W} worst case`, `${x.over ? "horizontal scroll: " + x.off.join("; ") : ""} ${x.amountsClipped.length ? "amount clipped: " + x.amountsClipped.join("; ") : ""} ${x.tinyText.length ? "text under 12px: " + x.tinyText.join("; ") : ""}`); else ok(`Overview@${W}: huge totals fit`);
    if (W === 320) await shot(p, "audit-worst-overview-320.png");
    await p.context().close();
  });

  find(external.length ? "serious" : "ok", "network", external.length ? "requests left the origin: " + external.slice(0, 3).join(", ") : "no request left the page's own origin");
  find(errors.length ? "serious" : "ok", "console", errors.length ? errors.slice(0, 3).join(" || ") : "no console errors or warnings");

  await browser.close();
  const order = { critical: 0, serious: 1, moderate: 2, error: 0, ok: 3 };
  const issues = findings.filter(f => f.severity !== "ok").sort((a, b) => order[a.severity] - order[b.severity]);
  const oks = findings.filter(f => f.severity === "ok");
  console.log(`\n=== ${issues.length} FINDINGS ===`);
  for (const f of issues) console.log(`${f.severity.toUpperCase().padEnd(8)} [${f.group}] ${f.where}: ${f.what}`);
  console.log(`\n=== ${oks.length} CHECKS PASSED ===`);
  if (process.env.VERBOSE) for (const f of oks) console.log(`ok       [${f.group}] ${f.what}`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-audit.json"), JSON.stringify(findings, null, 1));
  process.exit(issues.length ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
