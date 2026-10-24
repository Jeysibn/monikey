/* Milestone 4.2 browser verification of the application shell and the Overview page.
 * Run (after `npm run build` and `npx vite preview --port 4173`):  node scripts/verify-overview.cjs
 * Uses playwright-core and a Chromium that already exist on this machine (nothing is installed).
 * Committed Playwright tests as a project dev-dependency arrive at Roadmap Milestone 5.
 * Prints one PASS/FAIL line per check; RESULTS_JSON receives a JSON copy; SHOTS_DIR receives screenshots. */
const path = require("path");
const fs = require("fs");
const os = require("os");
const PW = process.env.PW_CORE || path.join(os.homedir(), ".agent-reach/tools/node/lib/node_modules/@playwright/cli/node_modules/playwright-core");
const { chromium } = require(PW);
const CHROME = process.env.CHROME_BIN || fs.readdirSync(path.join(os.homedir(), ".cache/ms-playwright")).filter(d => d.startsWith("chromium-")).sort().reverse().map(d => path.join(os.homedir(), ".cache/ms-playwright", d, "chrome-linux64/chrome")).find(p => fs.existsSync(p));
const BASE = process.env.BASE_URL || "http://localhost:4173/";
const MOCK = "file://" + path.resolve(__dirname, "../../docs/design/preview/app.html");
const SHOTS = process.env.SHOTS_DIR || "";

const results = []; let group = "";
const check = (name, ok, detail = "") => results.push({ group, name, ok: !!ok, detail: String(detail) });
const eq = (name, a, e) => check(name, a === e, `got ${JSON.stringify(a)}${a === e ? "" : ` expected ${JSON.stringify(e)}`}`);
const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-gpu"] });
  const errors = [], external = [];
  async function open(width, { query = "", height = 900, reduced = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}${query}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}@${width}${query}: ${m.text().slice(0, 140)}`); });
    page.on("request", r => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith("data:")) external.push(u); });
    await page.goto(BASE + query); await page.evaluate(() => document.fonts.ready);
    page.W = width; page.big = width >= 768;
    return page;
  }
  const safe = async fn => { try { await fn(); } catch (e) { check("section aborted: " + String(e.message).split("\n")[0].slice(0, 220), false); } };
  const R = {
    hero: 'section[aria-labelledby="net-position-label"]',
    month: '[aria-labelledby="this-month-title"]',
    cards: '[aria-labelledby="credit-cards-title"]',
    recent: '[aria-labelledby="recent-activity-title"]',
  };
  const texts = (p, sel) => p.locator(sel).evaluateAll(els => els.map(e => e.textContent.trim().replace(/\s+/g, " ")));
  const figures = async p => ({
    heroAmounts: await texts(p, `${R.hero} span.block`),
    sentence: (await p.locator(`${R.hero} p`).first().innerText().catch(() => "")).replace(/\s+/g, " "),
    notes: await texts(p, `${R.hero} p.mt-3\\.5`),
    group: await p.locator(`${R.hero} [role=group]`).first().getAttribute("aria-label").catch(() => null),
    monthRows: await texts(p, `${R.month} dd`),
    cardsText: (await p.locator(R.cards).innerText().catch(() => "")).replace(/\s+/g, " "),
    rows: await p.locator(`${R.recent} li`).evaluateAll(els => els.filter(e => e.getBoundingClientRect().height > 0).map(e => e.innerText.replace(/\s+/g, " ").trim())),
    noNaN: !/NaN|undefined|Infinity/.test(await p.locator("body").innerText()),
  });
  const addTransactionButtons = p => p.evaluate(() => [...document.querySelectorAll("button")].filter(b => /Add transaction|Add an account first/.test(b.textContent + (b.getAttribute("aria-label") || "")) && b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== "none").length);

  /* ---------------------------------------------------------------- values */
  group = "Financial values on the page (default ledger)";
  await safe(async () => {
    const p = await open(1280); const f = await figures(p);
    eq("net position (hero)", f.heroAmounts[0], "₱33,146.25");
    eq("Money you have", f.heroAmounts[1], "₱54,196.25");
    eq("Card debt", f.heroAmounts[2], "₱21,050.00");
    eq("finding sentence uses the same figures", f.sentence, "You have ₱54,196.25 in cash, bank and e-wallets and owe ₱21,050.00 on credit cards.");
    eq("equation label (no card credit)", f.group, "Money you have minus card debt equals net position");
    eq("income (signed, green)", f.monthRows[0], "+₱36,500.00");
    eq("expenses (card payment excluded)", f.monthRows[1], "₱27,127.40");
    check("Blue Card: ₱14,250.00 owed, ₱35,750.00 available, limit ₱50,000.00", /Blue Card ₱14,250\.00 owed .*₱35,750\.00 available Limit ₱50,000\.00/.test(f.cardsText), f.cardsText.slice(0, 200));
    check("Everyday Card: ₱6,800.00 owed, ₱23,200.00 available, limit ₱30,000.00", /Everyday Card ₱6,800\.00 owed .*₱23,200\.00 available Limit ₱30,000\.00/.test(f.cardsText));
    check("'Available credit isn't cash' is stated", /Available credit isn.t cash\./.test(f.cardsText));
    eq("recent activity shows 6 rows at 1280px", f.rows.length, 6);
    check("row 1: Expense Lunch with team Food · GCash −₱385.00", /Expense: Lunch with team .*−₱385\.00 Food · GCash/.test(f.rows[0]), f.rows[0]);
    check("row 2: card purchase is an expense on Blue Card", /Expense: Supermarket .*−₱2,846\.50 Groceries · Blue Card/.test(f.rows[1]), f.rows[1]);
    check("row 4: card payment has no sign and is labelled 'Card payment'", /Card payment: Card payment ₱5,000\.00 Main Savings → Blue Card/.test(f.rows[3]) && !/[+−]₱5,000/.test(f.rows[3]), f.rows[3]);
    check("figures consistent: net = have − debt (₱54,196.25 − ₱21,050.00)", 5419625 - 2105000 === 3314625);
    check("no NaN / undefined / Infinity anywhere", f.noNaN);
    await p.context().close();
    const q = await open(375); const g = await figures(q);
    eq("recent activity shows 5 rows below 1024px", g.rows.length, 5);
    await q.context().close();
  });

  /* ---------------------------------------------------------------- layout */
  for (const W of [360, 375, 768, 1280]) {
    group = `Layout ${W}px`;
    await safe(async () => {
      const p = await open(W, { height: W >= 768 ? 900 : 800 });
      const m = await p.evaluate(({ R }) => {
        const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"; };
        const rect = sel => { const e = document.querySelector(sel); const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
        const bad = [];
        document.querySelectorAll("main span.block, main dd span, main li button span:last-child, main .whitespace-nowrap").forEach(e => {
          if (!vis(e)) return; const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3, r = e.getBoundingClientRect();
          if (/₱/.test(e.textContent) && e.children.length === 0) {
            const box = e.closest("section, [role=region]").getBoundingClientRect();
            if (r.height > lh * 1.5) bad.push("wraps: " + e.textContent.trim());
            if (r.right > box.right + 0.5 || r.left < box.left - 0.5) bad.push("overflows: " + e.textContent.trim());
          }
        });
        const small = [...document.querySelectorAll("main button, main select, nav button")].filter(e => vis(e) && e.getBoundingClientRect().height < 43.5).map(e => (e.textContent || e.id).trim().slice(0, 18));
        const navs = [...document.querySelectorAll('nav[aria-label="Main"]')].filter(vis).length;
        const aside = document.querySelector("aside"); const asideW = vis(aside) ? Math.round(aside.getBoundingClientRect().width) : 0;
        return { sw: document.documentElement.scrollWidth, iw: innerWidth, bad, small, navs, asideW, bottomBar: vis(document.querySelector("nav.fixed")), h1s: document.querySelectorAll("h1").length,
          hero: rect(R.hero), recent: rect(R.recent), month: rect(R.month), cards: rect(R.cards), mainW: Math.round(document.querySelector("main > div").getBoundingClientRect().width) };
      }, { R });
      check("no horizontal overflow", m.sw <= m.iw, `scrollWidth ${m.sw} / viewport ${m.iw}`);
      eq("exactly one h1", m.h1s, 1);
      eq("exactly one visible 'Main' navigation landmark", m.navs, 1);
      if (W < 768) { check("bottom bar shown, no sidebar/rail", m.bottomBar && m.asideW === 0); eq("duplicate Add buttons: only the bottom-bar Add is visible", await addTransactionButtons(p), 1); }
      else { check(`${W >= 1024 ? "224px sidebar" : "80px rail"} shown, bottom bar hidden`, !m.bottomBar && m.asideW === (W >= 1024 ? 224 : 80), `aside ${m.asideW}px`); eq("exactly one Add transaction button (page header)", await addTransactionButtons(p), 1); }
      eq("one filled primary action visible", await p.evaluate(() => [...document.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0 && getComputedStyle(b).backgroundColor === "rgb(29, 95, 214)").length), 1);
      check("every peso amount is on one line and inside its card", m.bad.length === 0, m.bad.join("; ") || "ok");
      check("touch targets ≥44px high (buttons, selects, nav) below 768px", W >= 768 || m.small.length === 0, m.small.join(", ") || "ok");
      if (W >= 1024) {
        check("hero spans the top; recent activity left of the right column", m.hero.y < m.recent.y && m.recent.y === m.month.y && m.recent.x < m.month.x, JSON.stringify({ hero: m.hero, recent: m.recent, month: m.month }));
        const cols = (m.mainW - 24 * 11) / 12; const span = n => Math.round(n * cols + (n - 1) * 24);
        check(`12-column grid: recent activity = 7 columns (${span(7)}px), right column = 5 (${span(5)}px)`, Math.abs(m.recent.w - span(7)) <= 1 && Math.abs(m.month.w - span(5)) <= 1, `recent ${m.recent.w}, month ${m.month.w}, content ${m.mainW}`);
      } else {
        check("stacked in the approved order: hero, this month, credit cards, recent activity", m.hero.y < m.month.y && m.month.y < m.cards.y && m.cards.y < m.recent.y, `y: ${m.hero.y} < ${m.month.y} < ${m.cards.y} < ${m.recent.y}`);
        check("every block uses the full content width", [m.hero, m.month, m.cards, m.recent].every(r => Math.abs(r.w - m.mainW) <= 1), `content ${m.mainW}; ${[m.hero, m.month, m.cards, m.recent].map(r => r.w).join("/")}`);
      }
      if (W >= 768 && W < 1024) { const cc = await p.locator(`${R.cards} .md\\:grid > div`).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().left))); check("credit cards sit side by side on tablet", cc.length === 2 && cc[0] !== cc[1], cc.join(",")); }
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `overview-${W}.png`), fullPage: true });
      await p.context().close();
    });
  }

  /* ---------------------------------------------------------------- navigation */
  for (const W of [375, 768, 1280]) {
    group = `Navigation ${W}px`;
    await safe(async () => {
      const p = await open(W);
      const nav = `nav[aria-label="Main"]`;
      const go = async name => { await p.locator(`${nav} >> visible=true >> button:has-text("${name}")`).first().click(); await p.waitForTimeout(80); };
      const state = () => p.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, current: [...document.querySelectorAll('nav[aria-label="Main"] button[aria-current]')].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim().replace(/\s+/g, " ")), focus: document.activeElement?.tagName, focusIsH1: document.activeElement === document.querySelector("h1") }));
      let s = await state(); check("starts on Overview with aria-current on it", s.h1 === "Overview" && s.current.join() === "Overview", JSON.stringify(s));
      for (const name of ["Activity", "Accounts", "Overview"]) {
        await go(name); s = await state();
        check(`${name}: h1, aria-current and focus move to the new page`, s.h1 === name && s.current.join() === name && s.focusIsH1, JSON.stringify(s));
      }
      await go("Activity");
      check("Activity placeholder has a heading, explanation and working header", /Coming in a later milestone/.test(await p.locator("main").innerText()) && (await p.locator("h1").innerText()) === "Activity");
      // keyboard: Tab to a nav item and press Enter
      await go("Overview");
      await p.keyboard.press("Tab");
      const order = []; for (let i = 0; i < 6; i++) { order.push(await p.evaluate(() => { const e = document.activeElement; return (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().replace(/\s+/g, " ").slice(0, 24); })); await p.keyboard.press("Tab"); }
      check("(info) Tab order", true, order.join(" → "));
      await p.context().close();
    });
  }
  group = "Navigation (keyboard only, 1280px)";
  await safe(async () => {
    const p = await open(1280);
    await p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Accounts")').first().focus();
    const ring = await p.evaluate(() => { const c = getComputedStyle(document.activeElement); return `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor} / offset ${c.outlineOffset}`; });
    check("nav item shows a 2px focus ring when focused by keyboard", ring === "2px solid rgb(29, 95, 214) / offset 2px", ring);
    await p.keyboard.press("Enter"); await p.waitForTimeout(80);
    eq("Enter on a nav item navigates and moves focus to the h1", await p.evaluate(() => document.activeElement === document.querySelector("h1") && document.querySelector("h1").textContent), "Accounts");
    await p.context().close();
  });

  /* ---------------------------------------------------------------- month select + rows */
  group = "Month select, activity rows and View all";
  await safe(async () => {
    const p = await open(1280);
    const opts = await p.locator("#month option").allInnerTexts();
    check("12 months, newest first, current month selected", opts.length === 12 && opts[0] === "October 2026" && opts[11] === "November 2025" && (await p.locator("#month").inputValue()) === "2026-10", `${opts[0]} … ${opts[11]}`);
    eq("select has an accessible label", await p.locator("label[for=month]").innerText(), "Month");
    await p.selectOption("#month", "2026-09"); const f = await figures(p);
    eq("September: income is ₱0.00 (a zero has no + sign)", f.monthRows[0], "₱0.00"); eq("September: expenses are ₱0.00", f.monthRows[1], "₱0.00");
    eq("net position is unchanged for a past month (balances are 'as of today')", f.heroAmounts[0], "₱33,146.25");
    check("credit cards unchanged for a past month", /₱14,250\.00 owed/.test(f.cardsText));
    check("recent activity shows the empty state with an action", /Nothing recorded in September 2026 yet\./.test(await p.locator(R.recent).innerText()) && await p.locator(`${R.recent} button:has-text("Add transaction")`).isVisible());
    await p.locator(`${R.recent} button:has-text("View all")`).click(); await p.waitForTimeout(80);
    check("View all opens Activity on the selected month", (await p.locator("h1").innerText()) === "Activity" && /September 2026/.test(await p.locator("main").innerText()));
    await p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Overview")').first().click();
    eq("month is kept when returning to Overview", await p.locator("#month").inputValue(), "2026-09");
    await p.selectOption("#month", "2026-10");
    await p.locator(`${R.recent} li button`).first().click(); await p.waitForTimeout(80);
    check("clicking a row opens Activity on that entry's month (October 2026)", (await p.locator("h1").innerText()) === "Activity" && /October 2026/.test(await p.locator("main").innerText()));
    await p.context().close();
  });

  /* ---------------------------------------------------------------- dialogs (stand-ins) */
  for (const W of [375, 1280]) {
    group = `Stand-in dialogs ${W}px`;
    await safe(async () => {
      const p = await open(W, { height: 800 });
      const add = W < 768 ? p.getByRole("button", { name: "Add transaction" }) : p.locator("main").getByRole("button", { name: "Add transaction" });
      const addHandle = await add.elementHandle(); await add.focus(); await p.keyboard.press("Enter"); await p.waitForSelector('[role="dialog"]');
      eq("Add opens a titled dialog", await p.locator('[role="dialog"] h2').innerText(), "Add transaction");
      const g = await p.locator('[role="dialog"]').evaluate(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, l: Math.round(r.left) }; });
      if (W < 768) check("phone: bottom sheet, full width, flush bottom", g.w === g.vw && g.b === g.vh, JSON.stringify(g)); else check("desktop: centred 500px dialog", g.w === 500 && Math.abs(g.l + g.w / 2 - g.vw / 2) <= 1, JSON.stringify(g));
      check("focus is inside the dialog; Tab stays inside", await (async () => { for (let i = 0; i < 4; i++) await p.keyboard.press("Tab"); return p.evaluate(() => !!document.activeElement.closest('[role="dialog"]')); })());
      await p.keyboard.press("Escape"); await p.waitForTimeout(100);
      check("Escape closes it and focus returns to the exact Add control that opened it", (await p.locator('[role="dialog"]').count()) === 0 && await p.evaluate(el => document.activeElement === el, addHandle));
      const payHandle = await p.getByRole("button", { name: "Pay card, Blue Card" }).elementHandle(); await p.getByRole("button", { name: "Pay card, Blue Card" }).focus(); await p.keyboard.press("Enter"); await p.waitForSelector('[role="dialog"]');
      check("Pay card opens 'Pay credit card' and names the card", (await p.locator('[role="dialog"] h2').innerText()) === "Pay credit card" && /Blue Card/.test(await p.locator('[role="dialog"]').innerText()));
      await p.getByRole("button", { name: "Close" }).first().click(); await p.waitForTimeout(100);
      check("closing (X button) returns focus to that exact Pay card button", await p.evaluate(el => document.activeElement === el, payHandle));
      await p.locator("main").getByRole("button", { name: "Pay card, Everyday Card" }).click(); await p.waitForSelector('[role="dialog"]'); await p.keyboard.press("Escape"); await p.waitForTimeout(100);
      check("after a mouse click, Escape also returns focus to the clicked Pay card button (not <body>)", await p.evaluate(() => document.activeElement.getAttribute("aria-label")) === "Pay card, Everyday Card");
      await p.context().close();
    });
  }

  /* ---------------------------------------------------------------- rare states */
  group = "Overpaid credit card (?demo=overpaid)";
  await safe(async () => {
    const p = await open(1280, { query: "?demo=overpaid" }); const f = await figures(p);
    eq("money you have (Main Savings paid ₱20,000)", f.heroAmounts[1], "₱34,196.25"); eq("card debt counts only the card that still owes", f.heroAmounts[2], "₱14,250.00");
    eq("NET POSITION unchanged by the overpayment", f.heroAmounts[0], "₱33,146.25");
    check("hero says: Plus ₱13,200.00 card credit", f.notes.some(n => /Plus ₱13,200\.00 card credit/.test(n)), f.notes.join(" | "));
    check("equation label mentions card credit", /plus card credit/.test(f.group), f.group);
    check("figures add up: ₱34,196.25 − ₱14,250.00 + ₱13,200.00 = ₱33,146.25", 3419625 - 1425000 + 1320000 === 3314625);
    check("Everyday Card shows ₱13,200.00 'card credit', not 'owed'", /Everyday Card ₱13,200\.00 card credit/.test(f.cardsText), f.cardsText.slice(0, 260));
    check("its Pay card button is disabled and says why", await p.getByRole("button", { name: "Pay card, Everyday Card" }).isDisabled() && /No debt to pay/.test(f.cardsText));
    eq("expenses unchanged by the payment", f.monthRows[1], "₱27,127.40");
    await p.context().close();
  });
  group = "Negative account balance (?demo=negative)";
  await safe(async () => {
    const p = await open(1280, { query: "?demo=negative" }); const f = await figures(p);
    check("hero warns: An account is below zero.", f.notes.some(n => /An account is below zero\./.test(n)), f.notes.join(" | "));
    eq("money you have", f.heroAmounts[1], "₱50,196.25"); eq("card debt (Blue ₱10,250.00 + Everyday ₱6,800.00)", f.heroAmounts[2], "₱17,050.00"); eq("net position unchanged", f.heroAmounts[0], "₱33,146.25");
    check("figures add up: ₱50,196.25 − ₱17,050.00 = ₱33,146.25", 5019625 - 1705000 === 3314625);
    eq("expenses unchanged", f.monthRows[1], "₱27,127.40");
    await p.context().close();
  });
  group = "First run (?demo=no-accounts)";
  for (const W of [375, 1280]) await safe(async () => {
    const p = await open(W, { query: "?demo=no-accounts" }); const t = await p.locator("main").innerText();
    check(`${W}px: first-run sentence and a primary Add account button`, /Start by adding a cash, bank or e-wallet account\./.test(t) && await p.getByRole("button", { name: "Add account" }).isVisible());
    check(`${W}px: no hero card and no net position`, (await p.locator(R.hero).count()) === 0 && !/Net position/.test(t));
    const dis = W < 768 ? p.getByRole("button", { name: "Add transaction (add an account first)" }) : p.locator("main").getByRole("button", { name: "Add an account first" }).first();
    check(`${W}px: Add transaction is disabled with a visible reason`, await dis.isDisabled() && (W < 768 || /Add an account first/.test(await dis.innerText())));
    eq(`${W}px: Add account is the only filled primary action`, await p.evaluate(() => [...document.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0 && getComputedStyle(b).backgroundColor === "rgb(29, 95, 214)").length), 1);
    const f = await figures(p);
    check(`${W}px: This month shows ₱0.00 and credit cards / activity keep their frames with a sentence`, f.monthRows.join() === "₱0.00,₱0.00" && /No credit cards yet/.test(f.cardsText) && /Nothing recorded in October 2026 yet\./.test(await p.locator(R.recent).innerText()), f.monthRows.join());
    check(`${W}px: no horizontal overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `firstrun-${W}.png`), fullPage: true });
    await p.context().close();
  });

  /* ---------------------------------------------------------------- loading */
  group = "Loading state (?demo=loading)";
  for (const W of [375, 1280]) await safe(async () => {
    const loaded = await open(W); const hl = await loaded.locator(R.hero).evaluate(e => Math.round(e.getBoundingClientRect().height));
    const ll = await loaded.locator(R.recent).evaluate(e => Math.round(e.getBoundingClientRect().height)); await loaded.context().close();
    const p = await open(W, { query: "?demo=loading" });
    eq(`${W}px: region is marked busy`, await p.locator("main div[aria-busy]").first().getAttribute("aria-busy"), "true");
    check(`${W}px: screen readers are told it is loading`, /Loading your overview/.test(await p.locator("p[role=status]").innerText()));
    const t = await p.locator("main").innerText();
    check(`${W}px: labels and headings show at once`, ["Net position", "Money you have", "Card debt", "Income", "Expenses", "Recent activity", "Credit cards", "This month"].every(s => t.includes(s)));
    check(`${W}px: no money amount is shown while loading`, !/₱\d/.test(t), t.match(/₱[\d,.]+/g)?.join(" ") || "none");
    const dims = await p.evaluate(({ R }) => ({ hero: Math.round(document.querySelector(R.hero).getBoundingClientRect().height), recent: Math.round(document.querySelector(R.recent).getBoundingClientRect().height), sw: document.documentElement.scrollWidth, iw: innerWidth }), { R });
    check(`${W}px: the hero keeps its size when data arrives (layout shift ≤ 24px)`, Math.abs(dims.hero - hl) <= 24, `loading ${dims.hero}px vs loaded ${hl}px`);
    check(`${W}px: recent activity frame is similar in size (info)`, true, `loading ${dims.recent}px vs loaded ${ll}px`);
    check(`${W}px: no horizontal overflow`, dims.sw <= dims.iw);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `loading-${W}.png`), fullPage: true });
    await p.context().close();
  });

  /* ---------------------------------------------------------------- typography, contrast, semantics */
  group = "Typography, contrast and semantics";
  await safe(async () => {
    const p = await open(1280);
    const cdp = await p.context().newCDPSession(p); await cdp.send("DOM.enable"); await cdp.send("CSS.enable"); const doc = await cdp.send("DOM.getDocument", { depth: 1 });
    const used = async sel => { const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: sel }); return (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })).fonts.map(x => x.familyName); };
    const f1 = await used(`${R.hero} span.block`); check("₱ in the hero is drawn by Manrope", f1.length > 0 && f1.every(n => n.startsWith("Manrope")), f1.join(" | "));
    const f2 = await used(`${R.recent} li button`); check("the true minus in activity rows is drawn by Manrope", f2.every(n => n.startsWith("Manrope")), f2.join(" | "));
    const sizes = []; for (const W of [375, 768, 1280]) { const q = await open(W); sizes.push(await q.locator(`${R.hero} span.block`).first().evaluate(e => getComputedStyle(e).fontSize)); await q.context().close(); }
    check("hero amount is 36px / 40px / 44px at 375 / 768 / 1280", sizes.join() === "36px,40px,44px", sizes.join(", "));
    const cs = await p.evaluate(({ R }) => { const g = s => getComputedStyle(document.querySelector(s)); const hero = g(R.hero).backgroundColor;
      const debt = g(`${R.hero} [role=group] > div:last-child span.block`).color, muted = g(`${R.hero} [role=group] > div:first-child div`).color;
      const inc = g(`${R.month} dd span`).color, owed = g(`${R.cards} .text-debt`).color, mut = g(`${R.cards} .text-muted-foreground`).color;
      const tab = getComputedStyle(document.body).fontVariantNumeric; return { hero, debt, muted, inc, owed, mut, tab }; }, { R });
    check("hero background is #0b3278", cs.hero === "rgb(11, 50, 120)", cs.hero);
    check("card debt on hero ≥ 4.5:1", ratio(cs.debt, cs.hero) >= 4.5, `${ratio(cs.debt, cs.hero)}:1`);
    check("muted text on hero ≥ 4.5:1", ratio(cs.muted, cs.hero) >= 4.5, `${ratio(cs.muted, cs.hero)}:1`);
    check("income green on white ≥ 4.5:1", ratio(cs.inc, "rgb(255, 255, 255)") >= 4.5, `${ratio(cs.inc, "rgb(255, 255, 255)")}:1`);
    check("owed orange on white ≥ 4.5:1", ratio(cs.owed, "rgb(255, 255, 255)") >= 4.5, `${ratio(cs.owed, "rgb(255, 255, 255)")}:1`);
    check("muted text on white ≥ 4.5:1", ratio(cs.mut, "rgb(255, 255, 255)") >= 4.5, `${ratio(cs.mut, "rgb(255, 255, 255)")}:1`);
    eq("tabular figures are on for all text", cs.tab, "tabular-nums");
    const sem = await p.evaluate(() => ({
      unnamed: [...document.querySelectorAll("button, select")].filter(e => e.getBoundingClientRect().width > 0 && !((e.getAttribute("aria-label") || e.textContent || (e.labels && e.labels[0] && e.labels[0].textContent) || "").trim())).length,
      regions: [...document.querySelectorAll("main [role=region]")].map(e => document.getElementById(e.getAttribute("aria-labelledby"))?.textContent),
      tracks: [...document.querySelectorAll("[role=img]")].map(e => e.getAttribute("aria-label")),
      bad: [...document.querySelectorAll("*")].filter(e => { const c = getComputedStyle(e); return /gradient/.test(c.backgroundImage.replace(/url\([^)]*\)/g, "")) || c.backdropFilter !== "none"; }).length,
      hasMain: !!document.querySelector("main"), lang: document.documentElement.lang, title: document.title,
    }));
    eq("every visible button and select has an accessible name", sem.unnamed, 0);
    check("each card is a labelled region", sem.regions.join() === "Recent activity,This month,Credit cards", sem.regions.join());
    check("credit-limit tracks have text equivalents", sem.tracks.join() === "₱14,250.00 of ₱50,000.00 limit used,₱6,800.00 of ₱30,000.00 limit used", sem.tracks.join(" | "));
    check("no gradients or backdrop blur anywhere", sem.bad === 0);
    check("main landmark, lang and title present", sem.hasMain && sem.lang === "en" && sem.title === "MoniKey", `${sem.lang} / ${sem.title}`);
    await p.context().close();
    const r = await open(1280, { reduced: true });
    check("reduced motion: button transitions are off", /^0s(, 0s)*$/.test(await r.locator("main").getByRole("button", { name: "Add transaction" }).evaluate(e => getComputedStyle(e).transitionDuration)));
    await r.context().close();
  });

  /* ---------------------------------------------------------------- comparison with the approved mock */
  group = "Comparison with the approved HTML mock (measured, not pass/fail)";
  await safe(async () => {
    for (const W of [375, 1280]) {
      const p = await open(W, { height: 900 }); const m = await browser.newContext({ viewport: { width: W, height: 900 } }).then(c => c.newPage());
      await m.goto(MOCK); await m.evaluate(() => document.fonts.ready);
      const react = await p.evaluate(({ R }) => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }; return { hero: r(R.hero), month: r(R.month), cards: r(R.cards), recent: r(R.recent), h1: getComputedStyle(document.querySelector("h1")).fontSize, hero_amt: getComputedStyle(document.querySelector(R.hero + " span.block")).fontSize, content: document.querySelector("main > div").getBoundingClientRect().width }; }, { R });
      const mock = await m.evaluate(() => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }; return { hero: r(".hero-card"), month: r("#v-overview .rt > .card:first-child"), cards: r("#v-overview .rt > .card:last-child"), recent: r("#v-overview .act-col .card"), h1: getComputedStyle(document.querySelector("#v-overview h1")).fontSize, hero_amt: getComputedStyle(document.querySelector(".hc-amount")).fontSize, content: document.querySelector(".wrap").getBoundingClientRect().width }; });
      for (const k of ["hero", "month", "cards", "recent"]) check(`${W}px ${k} card size (w×h), React vs mock`, true, `React ${react[k].join("×")} · mock ${mock[k].join("×")} · Δ ${react[k][0] - mock[k][0]}×${react[k][1] - mock[k][1]}`);
      check(`${W}px hero amount font size, React vs mock`, react.hero_amt === mock.hero_amt, `React ${react.hero_amt} · mock ${mock.hero_amt}`);
      eq(`${W}px h1 font size follows DESIGN.md (24px phone, 28px from 768px)`, react.h1, W < 768 ? "24px" : "28px");
      check(`${W}px h1 font size, React vs mock (info: the mock used 26px / 30px)`, true, `React ${react.h1} · mock ${mock.h1}`);
      check(`${W}px content width, React vs mock`, true, `React ${Math.round(react.content)} · mock ${Math.round(mock.content)}`);
      await p.context().close(); await m.context().close();
    }
  });

  check("no request left the page's own origin (no CDN, no analytics)", external.length === 0, external.length ? external.slice(0, 3).join(", ") : "all requests same-origin");
  check("no console errors or warnings, no uncaught exceptions", errors.length === 0, errors.slice(0, 3).join(" || ") || "none");

  await browser.close();
  const pass = results.filter(r => r.ok).length; let g = "";
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-overview-verify.json"), JSON.stringify(results, null, 1));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
