/* Milestone 4.6 browser verification of Add account (read-only).
 * Run (with `npx vite --port 4291` serving the app):  BASE_URL=http://localhost:4291/ node scripts/verify-account.cjs
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
  async function open(width, { query = "", height = 900, view = "Overview" } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}${query}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}@${width}${query}: ${m.text().slice(0, 140)}`); });
    page.on("request", r => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith("data:")) external.push(u); });
    await page.goto(BASE + query); await page.evaluate(() => document.fonts.ready);
    page.W = width; page.big = width >= 768;
    if (view !== "Overview") await nav(page, view);
    return page;
  }
  const nav = async (p, name) => { await p.locator(`nav[aria-label="Main"] >> visible=true >> button:has-text("${name}")`).first().click(); await p.waitForTimeout(100); };
  const T = s => s.replace(/\s+/g, " ").trim();
  const mainText = p => p.evaluate(() => document.querySelector("main").innerText.replace(/\s+/g, " ").trim());
  const dlg = p => p.locator('[role="dialog"]');
  const dText = async p => T(await dlg(p).innerText());
  const dialogOpen = async p => (await dlg(p).count()) > 0;
  const status = p => p.locator('[role=status][aria-live=polite]').first().innerText().then(T);
  const money = (text, label) => { const m = new RegExp(label + "[^₱−+]{0,40}([−+]?₱[\\d,]+\\.\\d{2})").exec(text); return m && m[1]; };
  const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage: false }) : null;
  const addAccountBtn = p => p.locator('main button:has-text("Add account"):visible').first();
  const type = (p, value) => dlg(p).locator(`label:has(input[value=${value}])`).click();
  const submit = p => dlg(p).locator("button[type=submit]");

  group = "First run (journey U7)";
  await safe(async () => {
    const p = await open(375, { query: "?demo=no-accounts" });
    check("Add transaction is disabled before any account exists", await p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Add")').last().isDisabled());
    await addAccountBtn(p).click(); await p.waitForTimeout(150);
    check("opens as 'Add account' with the Name field focused", await dlg(p).locator("h2:has-text('Add account')").isVisible() && await p.evaluate(() => document.activeElement?.id) === "aa-name");
    eq("Cash is the default type", await dlg(p).locator("input[name=aa-type]:checked").getAttribute("value"), "cash");
    eq("four types: Cash, Bank, E-wallet, Card", await dlg(p).locator("input[name=aa-type]").count(), 4);
    const text = await dText(p);
    check("cash fields: Name and Current balance (₱) with the plain helper", /Current balance \(₱\)/.test(text) && /What's in it right now\./.test(text) && !/Credit limit/.test(text));
    eq("button reads 'Add account'", await submit(p).innerText(), "Add account");
    await submit(p).click(); await p.waitForTimeout(100);
    const t2 = await dText(p);
    check("empty submit: 'Fix 2 things to save' with both messages", /Fix 2 things to save/.test(t2) && /Give the account a name\./.test(t2) && /Enter an amount\./.test(t2), t2.slice(0, 200));
    check("focus moves to the summary", await p.evaluate(() => document.activeElement?.getAttribute("role") === "alert"));
    await shot(p, "account-errors-375.png");
    await p.fill("#aa-name", "Cash on hand"); await p.fill("#aa-balance", "-5"); await p.locator("#aa-name").focus();
    check("a negative balance: 'Use 0.00 or more.'", /Use 0\.00 or more\./.test(await dText(p)));
    await p.fill("#aa-balance", "4,811.75");
    await shot(p, "account-cash-375.png");
    await submit(p).click(); await p.waitForTimeout(250);
    check("dialog closed", !(await dialogOpen(p)));
    eq("one confirmation message", await status(p), "Account added: Cash on hand.");
    check("focus falls back to the page heading (the first-run button is gone)", await p.evaluate(() => document.activeElement?.tagName) === "H1");
    const t = await mainText(p);
    eq("Overview: Money you have is the new balance", money(t, "Money you have"), "₱4,811.75");
    check("Add transaction is enabled now", await p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Add")').last().isEnabled());
    await p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Add")').last().click(); await p.waitForTimeout(150);
    await p.selectOption("#qa-account", "1"); await p.fill("#qa-amount", "120"); await dlg(p).locator("label:has(input[name=qa-category]):has-text('Food')").click();
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(250);
    await nav(p, "Overview"); eq("a first expense works: Money you have ₱4,691.75", money(await mainText(p), "Money you have"), "₱4,691.75");
  });

  group = "Add a credit card from the Accounts slot";
  await safe(async () => {
    const p = await open(375, { view: "Accounts" });
    const before = await mainText(p);
    await p.locator('main button:has-text("Add credit card")').click(); await p.waitForTimeout(150);
    eq("opens with Card selected", await dlg(p).locator("input[name=aa-type]:checked").getAttribute("value"), "credit_card");
    const text = await dText(p);
    check("card fields: Credit limit (₱) and Amount you owe today (₱), with their helpers", /Credit limit \(₱\)/.test(text) && /The most the bank lets you charge\./.test(text) && /Amount you owe today \(₱\)/.test(text) && /What you still owe on this card today\. Use 0\.00 if nothing\./.test(text) && !/Current balance/.test(text));
    await p.fill("#aa-name", "Green Card"); await p.fill("#aa-limit", "0"); await p.locator("#aa-name").focus();
    check("limit 0: 'Credit limit must be more than ₱0.00.'", /Credit limit must be more than ₱0\.00\./.test(await dText(p)));
    await submit(p).click(); await p.waitForTimeout(100);
    check("blank 'owe today' is refused", /Enter an amount\./.test(await dText(p)) && /Fix 2 things to save/.test(await dText(p)));
    await shot(p, "account-card-375.png");
    await p.fill("#aa-limit", "50,000"); await p.fill("#aa-owed", "11,972.75");
    await submit(p).click(); await p.waitForTimeout(250);
    eq("message", await status(p), "Account added: Green Card.");
    check("focus returns to the 'Add credit card' slot", await p.evaluate(() => /Add credit card/.test(document.activeElement?.textContent || "")));
    const t = await mainText(p);
    check("Accounts: Money you owe +₱11,972.75 (₱21,050.00 → ₱33,022.75)", /₱21,050\.00 owed/.test(before) && /₱33,022\.75 owed/.test(t), t.slice(0, 160));
    check("the new card shows ₱11,972.75 owed, ₱38,027.25 available, limit ₱50,000.00", /Green Card ₱11,972\.75 owed .*₱38,027\.25 available Limit ₱50,000\.00/.test(t), t);
    eq("Money you have did not change", money(t, "Money you have"), "₱54,196.25");
    await nav(p, "Overview"); const o = await mainText(p);
    check("Overview net position fell by the debt (₱33,146.25 → ₱21,173.50)", money(o, "Net position") === "₱21,173.50", money(o, "Net position"));
  });

  group = "Add a bank account; it shows up in Quick Add";
  await safe(async () => {
    const p = await open(1280, { view: "Accounts" });
    await addAccountBtn(p).click(); await p.waitForTimeout(150);
    await p.fill("#aa-name", "Second Bank"); await type(p, "bank"); await p.fill("#aa-balance", "10000");
    eq("switching type keeps the name", await p.inputValue("#aa-name"), "Second Bank");
    await submit(p).click(); await p.waitForTimeout(250);
    const t = await mainText(p);
    check("Accounts: Money you have ₱64,196.25 and the bank row exists in the Bank group order", money(t, "Money you have") === "₱64,196.25" && /Second Bank Bank account ₱10,000\.00/.test(t), t.slice(0, 200));
    await p.locator('main button:has-text("Add transaction"):visible').first().click(); await p.waitForTimeout(150);
    check("Quick Add offers it with its balance", await p.evaluate(() => /Second Bank — ₱10,000\.00/.test(document.querySelector("#qa-account").innerText)));
    await p.keyboard.press("Escape");
  });

  group = "Names";
  await safe(async () => {
    const p = await open(375, { view: "Accounts" });
    await addAccountBtn(p).click(); await p.waitForTimeout(150);
    await p.fill("#aa-name", "  gcash "); await p.fill("#aa-balance", "1"); await p.locator("#aa-balance").focus(); await p.locator("#aa-name").focus();
    check("a duplicate name (any case, extra spaces) is refused inline", /You already have an account with that name\./.test(await dText(p)));
    check("the form stays open when submitted", (await submit(p).click(), await p.waitForTimeout(100), await dialogOpen(p)) && /Fix 1 thing to save/.test(await dText(p)));
    await p.fill("#aa-name", "x".repeat(61)); await p.locator("#aa-balance").focus();
    check("over 60 characters: 'Keep the name under 60 characters.'", /Keep the name under 60 characters\./.test(await dText(p)));
  });

  group = "Save fails once (?demo=save-error)";
  await safe(async () => {
    const p = await open(375, { query: "?demo=save-error", view: "Accounts" });
    await addAccountBtn(p).click(); await p.waitForTimeout(150);
    await p.fill("#aa-name", "Piggy"); await p.fill("#aa-balance", "250");
    await submit(p).click(); await p.waitForTimeout(250);
    check("notice shown, dialog open, everything kept, Save enabled again", await dialogOpen(p) && /Couldn't save\. Check your connection and try again\. Your entry is still here\./.test(await dText(p)) && await p.inputValue("#aa-name") === "Piggy" && await p.inputValue("#aa-balance") === "250" && await submit(p).isEnabled());
    await submit(p).click(); await p.waitForTimeout(250);
    check("retrying adds it", !(await dialogOpen(p)) && await status(p) === "Account added: Piggy." && (await mainText(p)).includes("Piggy"));
  });

  group = "Closing rules";
  await safe(async () => {
    const p = await open(1280, { view: "Accounts" });
    await addAccountBtn(p).click(); await p.waitForTimeout(150); await p.mouse.click(10, 10); await p.waitForTimeout(150);
    check("a click outside closes an untouched form", !(await dialogOpen(p)));
    await addAccountBtn(p).click(); await p.waitForTimeout(150); await p.fill("#aa-name", "x"); await p.mouse.click(10, 10); await p.waitForTimeout(150);
    check("…but not once something is typed", await dialogOpen(p));
    await dlg(p).locator("button:has-text('Cancel')").click(); await p.waitForTimeout(150);
    check("Cancel closes; focus returns to the Add account button", !(await dialogOpen(p)) && await p.evaluate(() => /Add account/.test(document.activeElement?.textContent || "")));
    await addAccountBtn(p).click(); await p.waitForTimeout(150);
    eq("from 768px: a centred 500px dialog", await dlg(p).evaluate(el => Math.round(el.getBoundingClientRect().width)), 500);
    await shot(p, "account-desktop-1280.png");
  });

  group = "Layout";
  await safe(async () => {
    for (const W of [360, 375, 768, 1280]) {
      for (const kind of ["cash", "card"]) {
        const p = await open(W, { view: "Accounts" });
        await (kind === "card" ? p.locator('main button:has-text("Add credit card")') : addAccountBtn(p)).click(); await p.waitForTimeout(150);
        if (kind === "cash") await type(p, "ewallet"); // the longest label, selected (with its check mark)
        else await type(p, "credit_card");
        const r = await p.evaluate(() => { const d = document.querySelector("[role=dialog]"); const dr = d.getBoundingClientRect(); const f = d.querySelector("[data-slot=dialog-footer]").getBoundingClientRect(); const labels = [...d.querySelectorAll("fieldset label span")].filter(s => s.closest("label").querySelector("input[name=aa-type]")); return { over: document.documentElement.scrollWidth > document.documentElement.clientWidth || d.querySelector("[data-slot=dialog-body]").scrollWidth > d.querySelector("[data-slot=dialog-body]").clientWidth, clipped: labels.filter(s => s.scrollWidth > s.clientWidth + 1 || s.getBoundingClientRect().height > s.parentElement.getBoundingClientRect().height).map(s => s.textContent).concat(labels.filter(s => { const r = document.createRange(); r.selectNodeContents(s); return r.getClientRects().length > 1; }).map(s => s.textContent + " (wraps)")), footVisible: f.bottom <= innerHeight + 1, within: dr.height <= innerHeight * 0.92 + 1, small: [...d.querySelectorAll("button, select, input:not([type=radio])")].filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height < 40 && e.textContent.trim() !== "").map(e => e.textContent.trim()).concat([...d.querySelectorAll("input:not([type=radio])")].filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height < 44).map(e => e.id)) }; });
        check(`${W}px ${kind}: no overflow, no clipped type label, footer visible, within 92%, controls 40px+`, !r.over && r.clipped.length === 0 && r.footVisible && r.within && r.small.length === 0, JSON.stringify(r));
        await p.context().close();
      }
    }
  });

  check("no request left the page's own origin", external.length === 0, external.length ? external.slice(0, 3).join(", ") : "all requests same-origin");
  check("no console errors or warnings, no uncaught exceptions", errors.length === 0, errors.slice(0, 3).join(" || ") || "none");

  await browser.close();
  const pass = results.filter(r => r.ok).length; let g = "";
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-account-verify.json"), JSON.stringify(results, null, 1));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
