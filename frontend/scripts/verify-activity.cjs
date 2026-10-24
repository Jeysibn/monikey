/* Milestone 4.4 browser verification of the Activity screen (read-only).
 * Run (with `npx vite --port 4174` or `npx vite preview --port 4173` serving the app):
 *   BASE_URL=http://localhost:4174/ node scripts/verify-activity.cjs
 * Uses playwright-core and a Chromium that already exist on this machine (nothing is installed).
 * Prints one PASS/FAIL line per check; RESULTS_JSON receives a JSON copy; SHOTS_DIR receives screenshots. */
const path = require("path");
const fs = require("fs");
const os = require("os");
const PW = process.env.PW_CORE || path.join(os.homedir(), ".agent-reach/tools/node/lib/node_modules/@playwright/cli/node_modules/playwright-core");
const { chromium } = require(PW);
const CHROME = process.env.CHROME_BIN || fs.readdirSync(path.join(os.homedir(), ".cache/ms-playwright")).filter(d => d.startsWith("chromium-")).sort().reverse().map(d => path.join(os.homedir(), ".cache/ms-playwright", d, "chrome-linux64/chrome")).find(p => fs.existsSync(p));
const BASE = process.env.BASE_URL || "http://localhost:4173/";
const SHOTS = process.env.SHOTS_DIR || "";

const results = []; let group = "";
const check = (name, ok, detail = "") => results.push({ group, name, ok: !!ok, detail: String(detail) });
const eq = (name, a, e) => check(name, a === e, `got ${JSON.stringify(a)}${a === e ? "" : ` expected ${JSON.stringify(e)}`}`);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-gpu"] });
  const errors = [], external = [];
  const safe = async fn => { try { await fn(); } catch (e) { check("section aborted: " + String(e.message).split("\n")[0].slice(0, 220), false); } };
  async function open(width, { query = "", height = 900 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}${query}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}@${width}${query}: ${m.text().slice(0, 140)}`); });
    page.on("request", r => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith("data:")) external.push(u); });
    await page.goto(BASE + query); await page.evaluate(() => document.fonts.ready);
    page.W = width; page.big = width >= 768;
    await nav(page, "Activity");
    return page;
  }
  const nav = async (p, name) => { await p.locator(`nav[aria-label="Main"] >> visible=true >> button:has-text("${name}")`).first().click(); await p.waitForTimeout(100); };
  const read = p => p.evaluate(() => {
    const tx = e => e.innerText.trim().replace(/\s+/g, " ");
    const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== "none"; };
    return {
      title: document.querySelector("h1")?.textContent,
      count: [...document.querySelectorAll('main p[role="status"]')].map(tx).find(x => /·/.test(x)) || "",
      days: [...document.querySelectorAll("main h2")].map(tx),
      rows: [...document.querySelectorAll("main section ul li")].filter(visible).map(tx),
      main: tx(document.querySelector("main")),
      busy: document.querySelector("main [aria-busy]")?.getAttribute("aria-busy"),
      editIcons: [...document.querySelectorAll('button[aria-label^="Edit "]')].filter(visible).length,
      deleteIcons: [...document.querySelectorAll('button[aria-label^="Delete "]')].filter(visible).length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      noNaN: !/NaN|undefined|Infinity/.test(document.body.innerText),
    };
  });
  const filled = p => p.evaluate(() => [...document.querySelectorAll("button")].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).display !== "none" && /bg-primary|primary-hover/.test(b.className) && !b.disabled && !/variant-link/.test(b.className) && getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)" && !/bg-secondary|bg-transparent/.test(b.className.replace(/hover:\S+/g, "")); }).length);
  const filledIn = (p, scope) => p.evaluate(scope => [...document.querySelectorAll(scope + " button")].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).display !== "none" && !b.disabled && /bg-primary/.test(b.className); }).length, scope);
  const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage: true }) : null;

  group = "List (default ledger, 1280px)";
  await safe(async () => {
    const p = await open(1280); const f = await read(p);
    eq("single h1 'Activity'", f.title, "Activity");
    eq("count line", f.count, "18 entries · October 2026");
    eq("first day heading", f.days[0], "Sat, Oct 24");
    check("one heading per day, newest first", f.days.length === new Set(f.days).size && f.days.length >= 10, f.days.join(" | "));
    eq("18 rows", f.rows.length, 18);
    check("first row is Lunch with team −₱385.00, Food · GCash", /^Expense: Lunch with team −₱385\.00 Food · GCash$/.test(f.rows[0]), f.rows[0]);
    const pay = f.rows.find(r => /Card payment/.test(r));
    check("card payment: 'Main Savings → Blue Card', ₱5,000.00, no sign, 'Payment' chip", /Main Savings → Blue Card/.test(pay) && /₱5,000\.00/.test(pay) && !/[−+]₱5,000/.test(pay) && /Payment/.test(pay), pay);
    check("income shows a + sign", f.rows.some(r => /October salary.*\+₱32,000\.00/.test(r)));
    eq("18 visible Edit icon buttons on desktop", f.editIcons, 18);
    eq("18 visible Delete icon buttons on desktop", f.deleteIcons, 18);
    check("icon buttons have specific names", await p.locator('button[aria-label="Delete Lunch with team, ₱385.00"]').count() === 1 && await p.locator('button[aria-label="Edit Lunch with team, ₱385.00"]').count() === 1);
    check("no NaN/undefined text", f.noNaN);
    await shot(p, "activity-1280.png");
  });

  group = "Filters";
  await safe(async () => {
    const p = await open(375);
    await p.selectOption("#activity-account", { label: "Main Savings" }); let f = await read(p);
    check("Main Savings shows its entries and the card payment", /entries · October 2026|entry · October 2026/.test(f.count) && f.rows.some(r => /Main Savings → Blue Card/.test(r)), f.count);
    check("only Main Savings rows (no GCash)", !f.rows.some(r => /GCash/.test(r)));
    await p.selectOption("#activity-account", { label: "Blue Card" }); f = await read(p);
    check("Blue Card shows its purchases and the payment received", f.rows.some(r => /Blue Card/.test(r) && /Supermarket/.test(r)) && f.rows.some(r => /Main Savings → Blue Card/.test(r)), f.count);
    await p.selectOption("#activity-account", { label: "Everyday Card" }); f = await read(p);
    eq("Everyday Card: 2 entries, no payment", f.count + "|" + f.rows.length, "2 entries · October 2026|2");
    await p.selectOption("#month", { label: "September 2026" }); f = await read(p);
    check("account filter + empty month → '0 entries · September 2026', 'Nothing matches these filters.' with Clear filters", f.count === "0 entries · September 2026" && /Nothing matches these filters\./.test(f.main) && await p.locator('button:has-text("Clear filters")').isVisible());
    await p.locator('button:has-text("Clear filters")').click(); f = await read(p);
    check("Clear filters resets the account only (month stays September)", /No activity in September 2026\./.test(f.main) && await p.locator("#activity-account").inputValue() === "");
    check("empty month offers a visible Add transaction", await p.locator('main button:has-text("Add transaction"):visible').count() === 1);
    eq("empty month at 375px: no filled primary on the page (the bottom bar is outside main)", await filledIn(p, "main"), 0);
    await p.selectOption("#month", { label: "October 2026" });
    eq("back to 18 entries", (await read(p)).count, "18 entries · October 2026");
    await shot(p, "activity-filtered-empty-375.png");
  });

  group = "Phones: tap a row to edit, focus returns";
  await safe(async () => {
    const p = await open(375); const f = await read(p);
    eq("no Edit/Delete icon buttons visible on phones", f.editIcons + f.deleteIcons, 0);
    const row = p.locator('li button[data-row="t-17"]:visible');
    await row.focus(); await row.click(); await p.waitForTimeout(150);
    check("row tap opens 'Edit expense'", await p.locator('[role=dialog] h2:has-text("Edit expense")').isVisible());
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    check("focus returns to the same row", await p.evaluate(() => document.activeElement?.getAttribute("data-row")) === "t-17");
    await shot(p, "activity-375.png");
  });

  group = "Desktop: Edit and Delete buttons, focus returns";
  await safe(async () => {
    const p = await open(1280);
    const del = p.locator('button[aria-label="Delete Lunch with team, ₱385.00"]');
    await del.click(); await p.waitForTimeout(150);
    check("Delete opens the confirmation ('Delete this expense?', built in 4.5b)", await p.locator('[role=dialog] h2:has-text("Delete this expense?")').isVisible());
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    check("focus returns to that Delete button", await p.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Delete Lunch with team, ₱385.00");
    const edit = p.locator('button[aria-label="Edit October salary, ₱32,000.00"]');
    await edit.click(); await p.waitForTimeout(150);
    check("Edit on income opens 'Edit income'", await p.locator('[role=dialog] h2:has-text("Edit income")').isVisible());
    await p.keyboard.press("Escape");
    const dp = p.locator('button[aria-label^="Edit Card payment"]');
    await dp.click(); await p.waitForTimeout(150);
    check("Edit on a payment opens 'Edit card payment'", await p.locator('[role=dialog] h2:has-text("Edit card payment")').isVisible());
    await p.keyboard.press("Escape");
  });

  group = "Load more (?demo=many)";
  await safe(async () => {
    const p = await open(375, { query: "?demo=many" }); let f = await read(p);
    eq("first page: 'Latest 50 entries · October 2026'", f.count, "Latest 50 entries · October 2026");
    eq("50 rows", f.rows.length, 50);
    check("'Showing the latest 50.' and Load more are visible", /Showing the latest 50\./.test(f.main) && await p.locator('button:has-text("Load more")').isVisible());
    const before = f.rows.slice();
    await p.locator('button:has-text("Load more")').click(); await p.waitForTimeout(150); f = await read(p);
    eq("second page: 58 entries, count line without 'Latest'", f.count, "58 entries · October 2026");
    check("Load more disappears on the last page", await p.locator('button:has-text("Load more")').count() === 0);
    check("rows already shown did not move", before.every((r, i) => r === f.rows[i]));
    check("focus moved to the first new row (not lost)", await p.evaluate(() => document.activeElement?.getAttribute("data-row")) === await p.evaluate(() => [...document.querySelectorAll("main section ul li")][50].querySelector("[data-row]").getAttribute("data-row")), await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));
    await p.selectOption("#month", { label: "September 2026" }); await p.selectOption("#month", { label: "October 2026" }); f = await read(p);
    eq("away and back: starts again at one page (50 rows, Load more shown)", f.rows.length + "|" + await p.locator('button:has-text("Load more")').count(), "50|1");
    await p.locator('button:has-text("Load more")').click();
    await p.selectOption("#activity-account", { label: "GCash" }); f = await read(p);
    check("changing a filter starts again at one page, filtered before the limit", !/Latest/.test(f.count) && f.rows.every(r => /GCash/.test(r)), f.count);
    await shot(p, "activity-many-375.png");
  });

  group = "States";
  await safe(async () => {
    const p = await open(375, { query: "?demo=loading" }); const f = await read(p);
    check("loading: aria-busy, skeleton rows, filters visible, no list", f.busy === "true" && f.rows.length === 0 && await p.locator("#month").isVisible() && await p.locator("#activity-account").isVisible());
    await shot(p, "activity-loading-375.png");
    const q = await open(375, { query: "?demo=no-accounts" }); const g = await read(q);
    check("first run: 'No activity in October 2026.' and a disabled 'Add an account first'", /No activity in October 2026\./.test(g.main) && await q.locator('main button:disabled:has-text("Add an account first")').count() >= 1);
    eq("first run: no filled primary button on this screen", await filled(q), 0);
    await shot(q, "activity-firstrun-375.png");
  });

  group = "Empty month at 1280px";
  await safe(async () => {
    const p = await open(1280); await p.selectOption("#month", { label: "September 2026" });
    check("header Add transaction is the only filled primary (the empty-state button is secondary)", await filledIn(p, "main") === 1, await filledIn(p, "main"));
    check("'0 entries · September 2026' and 'No activity in September 2026.'", (await read(p)).count === "0 entries · September 2026" && /No activity in September 2026\./.test((await read(p)).main));
    await shot(p, "activity-empty-1280.png");
  });

  group = "Overview → Activity";
  await safe(async () => {
    const p = await open(1280); await nav(p, "Overview");
    await p.locator('button:has-text("View all")').click(); await p.waitForTimeout(100);
    eq("'View all' opens Activity", (await read(p)).title, "Activity");
    check("h1 receives focus", await p.evaluate(() => document.activeElement?.tagName === "H1"));
  });

  group = "Layout";
  await safe(async () => {
    for (const W of [360, 375, 768, 1280]) {
      const p = await open(W); const f = await read(p);
      check(`${W}px: no horizontal overflow`, !f.overflow);
      check(`${W}px: month and account selects fit side by side`, await p.evaluate(() => { const a = document.querySelector("#month").getBoundingClientRect(), b = document.querySelector("#activity-account").getBoundingClientRect(); return Math.abs(a.top - b.top) < 4 && b.right <= innerWidth; }));
      check(`${W}px: rows have 44px+ tall targets`, await p.evaluate(() => [...document.querySelectorAll("main section ul li")].filter(l => l.getBoundingClientRect().height > 0).every(l => l.getBoundingClientRect().height >= 64)));
      if (W === 768) await shot(p, "activity-768.png");
      await p.context().close();
    }
  });

  check("no request left the page's own origin", external.length === 0, external.length ? external.slice(0, 3).join(", ") : "all requests same-origin");
  check("no console errors or warnings, no uncaught exceptions", errors.length === 0, errors.slice(0, 3).join(" || ") || "none");

  await browser.close();
  const pass = results.filter(r => r.ok).length; let g = "";
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-activity-verify.json"), JSON.stringify(results, null, 1));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
