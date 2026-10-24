/* Milestone 4.5a browser verification of Quick Add and Pay card (read-only).
 * Run (with `npx vite --port 4291` serving the app):  BASE_URL=http://localhost:4291/ node scripts/verify-quickadd.cjs
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
  const dialogOpen = async p => (await dlg(p).count()) > 0;
  /* The visible "Add transaction" opener: bottom-bar Add on phones, page-header button from 768px. */
  const openAdd = async p => { await (p.big ? p.locator('main button:has-text("Add transaction"):visible').first() : p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Add")').last()).click(); await p.waitForTimeout(150); };
  const chip = (p, name) => dlg(p).locator(`label:has(input[name=qa-category]):has-text("${name}")`);
  const fill = async (p, { amount, account, category, note, date }) => {
    if (amount !== undefined) await p.fill("#qa-amount", amount);
    if (account !== undefined) await p.selectOption("#qa-account", String(account));
    if (category) await chip(p, category).click();
    if (note !== undefined) await p.fill("#qa-note", note);
    if (date !== undefined) await p.fill("#qa-date", date);
  };
  const saveBtn = (p, label) => dlg(p).locator(`button[type=submit]:has-text("${label}")`);
  const status = p => p.locator('[role=status][aria-live=polite]').first().innerText().then(T);
  const money = (text, label) => { const m = new RegExp(label + "[^₱−+]{0,40}([−+]?₱[\\d,]+\\.\\d{2})").exec(text); return m && m[1]; };
  const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage: false }) : null;
  const overview = async p => { await nav(p, "Overview"); const t = await mainText(p); return { net: money(t, "Net position"), expenses: money(t, "Expenses"), income: money(t, "Income"), have: money(t, "Money you have"), t }; };

  group = "Opening the form";
  await safe(async () => {
    const p = await open(375); await openAdd(p);
    check("dialog opens as 'Add transaction'", await dlg(p).locator("h2:has-text('Add transaction')").isVisible());
    check("Amount is focused first", await p.evaluate(() => document.activeElement?.id) === "qa-amount");
    eq("type defaults to Expense", await dlg(p).locator("input[name=qa-kind]:checked").getAttribute("value"), "expense");
    check("double-count hint is shown on Expense", /Paying a card bill\? Use Pay card so it isn't counted twice\./.test(T(await dlg(p).innerText())));
    check("category chips are the 6 expense categories, as radios", await dlg(p).locator("input[name=qa-category]").count() === 6);
    check("account options show balances, cards show available credit, cards are in their own group", await p.evaluate(() => { const t = document.querySelector("#qa-account").innerText; return /GCash — ₱3,120\.75/.test(t) && /Blue Card — ₱35,750\.00 available/.test(t) && !!document.querySelector('#qa-account optgroup[label="Credit cards — adds to debt"]'); }));
    eq("Save button reads 'Save expense'", await dlg(p).locator("button[type=submit]").innerText(), "Save expense");
    const box = await dlg(p).evaluate(el => { const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight, w: Math.round(r.width) }; });
    check("phone: bottom sheet, full width, at most 92% of the height", box.bottom === box.vh && box.w === 375 && box.h <= box.vh * 0.92 + 1, JSON.stringify(box));
    await shot(p, "quickadd-expense-375.png");
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    check("Escape closes an untouched form", !(await dialogOpen(p)));
    check("focus returns to the Add button that opened it", await p.evaluate(() => /Add/.test(document.activeElement?.textContent || "") && !!document.activeElement.closest("nav")));
  });

  group = "Validation";
  await safe(async () => {
    const p = await open(375); await openAdd(p);
    await saveBtn(p, "Save expense").click(); await p.waitForTimeout(100);
    const text = T(await dlg(p).innerText());
    check("empty submit shows 'Fix 3 things to save' with the three messages", /Fix 3 things to save/.test(text) && /Enter an amount\./.test(text) && /Choose an account\./.test(text) && /Choose a category\./.test(text), text.slice(0, 200));
    check("focus moves to the error summary", await p.evaluate(() => document.activeElement?.getAttribute("role") === "alert" && /Fix 3/.test(document.activeElement.innerText)));
    check("fields are marked invalid and linked to their message", await p.evaluate(() => { const a = document.querySelector("#qa-amount"); return a.getAttribute("aria-invalid") === "true" && document.getElementById(a.getAttribute("aria-describedby"))?.innerText.includes("Enter an amount"); }));
    await dlg(p).locator("button:has-text('Choose an account.')").click();
    check("a summary item moves focus to its field", await p.evaluate(() => document.activeElement?.id) === "qa-account");
    await fill(p, { amount: "abc" }); await p.locator("#qa-note").focus();
    check("blur validates the amount: 'Use numbers only…'", /Use numbers only, like 350 or 350\.50\./.test(T(await dlg(p).innerText())));
    await fill(p, { amount: "1.234" }); check("'Use at most 2 decimal places.'", /Use at most 2 decimal places\./.test(T(await dlg(p).innerText())));
    await fill(p, { amount: "0" }); check("'Amount must be more than ₱0.00.'", /Amount must be more than ₱0\.00\./.test(T(await dlg(p).innerText())));
    await fill(p, { amount: "385", account: 3, category: "Food" });
    check("fixing everything removes the summary", !/Fix \d/.test(T(await dlg(p).innerText())));
    await fill(p, { note: "x".repeat(121) }); await p.locator("#qa-amount").focus();
    check("note over 120 characters is refused", /Keep the note under 120 characters\./.test(T(await dlg(p).innerText())));
    await fill(p, { note: "ok", date: "" }); await p.locator("#qa-amount").focus();
    check("a cleared date is refused", /Enter a valid date\./.test(T(await dlg(p).innerText())));
    await shot(p, "quickadd-errors-375.png");
  });

  group = "Journey U1: log a coffee (expense on cash)";
  await safe(async () => {
    const p = await open(375); const before = await overview(p);
    await openAdd(p);
    await fill(p, { amount: "120", account: 1, category: "Food", note: "Coffee" });
    check("no preview or warning for an expense on cash", !/estimate/.test(T(await dlg(p).innerText())));
    await saveBtn(p, "Save expense").click(); await p.waitForTimeout(250);
    check("dialog closed", !(await dialogOpen(p)));
    eq("one confirmation message", await status(p), "Expense saved: −₱120.00 from Cash on hand.");
    check("focus returns to the opener (bottom-bar Add)", await p.evaluate(() => !!document.activeElement.closest("nav")));
    const after = await overview(p);
    check("Overview: expenses +₱120.00 (₱27,127.40 → ₱27,247.40)", before.expenses === "₱27,127.40" && after.expenses === "₱27,247.40", `${before.expenses} → ${after.expenses}`);
    check("Overview: net position down by ₱120.00", before.net === "₱33,146.25" && after.net === "₱33,026.25", `${before.net} → ${after.net}`);
    await nav(p, "Accounts"); check("Accounts: Cash on hand ₱2,350.00 → ₱2,230.00", /Cash on hand Cash ₱2,230\.00/.test(await mainText(p)));
    await nav(p, "Activity"); check("Activity: the new entry is the newest row", /Expense: Coffee −₱120\.00 Food · Cash on hand/.test(await p.locator("main section ul li").first().innerText().then(T)), await p.locator("main section ul li").first().innerText().then(T));
    await openAdd(p);
    eq("the last account used is preselected next time", await p.inputValue("#qa-account"), "1");
    eq("the category is deliberately NOT remembered", await dlg(p).locator("input[name=qa-category]:checked").count(), 0);
    await p.keyboard.press("Escape");
  });

  group = "Journey U2: a purchase on a card (expense, adds to debt)";
  await safe(async () => {
    const p = await open(375); const before = await overview(p); await openAdd(p);
    await fill(p, { amount: "2,500", account: 4, category: "Shopping" });
    const text = T(await dlg(p).innerText());
    check("helper: 'Counts as an expense and adds to the card's debt.'", /Counts as an expense and adds to the card's debt\./.test(text));
    check("preview: 'Blue Card owed: ₱14,250.00 → ₱16,750.00'", /After saving \(estimate\)/.test(text) && /Blue Card owed: ₱14,250\.00 → ₱16,750\.00/.test(text), text.slice(-260));
    await fill(p, { amount: "40,000" });
    check("over the available credit: a warning, and Save stays enabled", /more than the ₱35,750\.00 credit available on Blue Card/.test(T(await dlg(p).innerText())) && await saveBtn(p, "Save expense").isEnabled());
    await fill(p, { amount: "2,500" });
    await saveBtn(p, "Save expense").click(); await p.waitForTimeout(250);
    eq("message names what the card now owes", await status(p), "Expense saved: −₱2,500.00 from Blue Card. Blue Card now owes ₱16,750.00.");
    const after = await overview(p);
    check("expenses +₱2,500.00 and net position −₱2,500.00", after.expenses === "₱29,627.40" && after.net === "₱30,646.25", `${after.expenses} / ${after.net}`);
    await nav(p, "Accounts"); check("Accounts: Blue Card ₱16,750.00 owed", /Blue Card ₱16,750\.00 owed/.test(await mainText(p)));
    check("Money you have did not change (a card purchase is not cash)", before.have === after.have, `${before.have} / ${after.have}`);
  });

  group = "Journey U3: pay a card";
  await safe(async () => {
    const p = await open(375); const before = await overview(p); await nav(p, "Accounts");
    await p.locator('button[aria-label="Pay card, Blue Card"]').click(); await p.waitForTimeout(150);
    check("opens as 'Pay credit card' on the Pay card type with the card preselected", await dlg(p).locator("h2:has-text('Pay credit card')").isVisible() && await dlg(p).locator("input[name=qa-kind]:checked").getAttribute("value") === "payment" && await p.inputValue("#qa-card") === "4");
    check("no category chips on a payment", await dlg(p).locator("input[name=qa-category]").count() === 0);
    check("'Pay from' lists no card; 'Pay card' lists only cards", await p.evaluate(() => !/Card/.test(document.querySelector("#qa-account").innerText) && [...document.querySelectorAll("#qa-card option")].slice(1).every(o => /Card/.test(o.textContent))));
    eq("helper shows what is owed", /Owed now: ₱14,250\.00\. No category — payments aren't expenses\./.test(T(await dlg(p).innerText())), true);
    await dlg(p).locator("button:has-text('Pay full ₱14,250.00')").click();
    eq("Pay full fills the amount from the owed figure", await p.inputValue("#qa-amount"), "14250.00");
    await fill(p, { amount: "5,000", account: 2 });
    const text = T(await dlg(p).innerText());
    check("preview: both balances move, expenses do not", /After paying \(estimate\)/.test(text) && /Main Savings: ₱48,725\.50 → ₱43,725\.50/.test(text) && /Blue Card owed: ₱14,250\.00 → ₱9,250\.00/.test(text) && /Expenses: no change/.test(text));
    await shot(p, "quickadd-payment-375.png");
    eq("Save button reads 'Pay credit card'", await dlg(p).locator("button[type=submit]").innerText(), "Pay credit card");
    await saveBtn(p, "Pay credit card").click(); await p.waitForTimeout(250);
    eq("one message saying it is not an expense", await status(p), "Card payment saved: ₱5,000.00 from Main Savings to Blue Card. Blue Card now owes ₱9,250.00. Card payments don't count as expenses and don't change your net position.");
    check("focus returns to the Pay card button", await p.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Pay card, Blue Card"));
    const after = await overview(p);
    check("expenses unchanged", before.expenses === after.expenses, `${before.expenses} / ${after.expenses}`);
    check("net position unchanged", before.net === after.net, `${before.net} / ${after.net}`);
    check("Money you have fell by ₱5,000.00", before.have === "₱54,196.25" && after.have === "₱49,196.25", `${before.have} → ${after.have}`);
    await nav(p, "Activity");
    check("Activity: a card payment row (no sign, 'Payment'), not an expense", /Card payment: Card payment ₱5,000\.00 Main Savings → Blue Card/.test(await p.locator("main section ul li").first().innerText().then(T)) || (await mainText(p)).includes("Main Savings → Blue Card"));
  });

  group = "Switching type, warnings";
  await safe(async () => {
    const p = await open(375); await openAdd(p);
    await fill(p, { amount: "750", account: 4, category: "Food", note: "Visa bill", date: "2026-10-20" });
    await dlg(p).locator("button:has-text('Use Pay card')").click();
    eq("'Use Pay card' keeps amount", await p.inputValue("#qa-amount"), "750");
    eq("…keeps the note", await p.inputValue("#qa-note"), "Visa bill");
    eq("…keeps the date", await p.inputValue("#qa-date"), "2026-10-20");
    eq("…clears a card chosen as the payer", await p.inputValue("#qa-account"), "");
    await dlg(p).locator("label:has(input[value=income])").click();
    check("Income: 'Deposit to', 3 income categories, no cards offered", await p.evaluate(() => document.querySelector('label[for=qa-account]').textContent === "Deposit to" && document.querySelectorAll("input[name=qa-category]").length === 3 && !/Card/.test(document.querySelector("#qa-account").innerText)));
    eq("Income Save button reads 'Save income'", await dlg(p).locator("button[type=submit]").innerText(), "Save income");
    await dlg(p).locator("label:has(input[value=payment])").click();
    await fill(p, { amount: "20,000", account: 2 }); await p.selectOption("#qa-card", "5");
    const text = T(await dlg(p).innerText());
    check("overpaying warns that the extra becomes credit; Save stays enabled", /more than the ₱6,800\.00 currently owed\. The extra becomes credit on the card\./.test(text) && await saveBtn(p, "Pay credit card").isEnabled());
    await fill(p, { account: 3 });
    check("paying from a short account warns it will go below zero", /GCash has ₱3,120\.75, less than this payment\. Its balance will go below zero\./.test(T(await dlg(p).innerText())));
  });

  group = "Saving and failing (?demo=save-error)";
  await safe(async () => {
    const p = await open(375, { query: "?demo=save-error" }); await openAdd(p);
    await fill(p, { amount: "99", account: 1, category: "Food", note: "Keep me" });
    await saveBtn(p, "Save expense").click(); await p.waitForTimeout(250);
    check("a failed save keeps the dialog open with a notice", await dialogOpen(p) && /Couldn't save\. Check your connection and try again\. Your entry is still here\./.test(T(await dlg(p).innerText())));
    check("everything typed is still there", await p.inputValue("#qa-amount") === "99" && await p.inputValue("#qa-note") === "Keep me" && await p.inputValue("#qa-account") === "1");
    check("Save is enabled again", await saveBtn(p, "Save expense").isEnabled());
    await saveBtn(p, "Save expense").click(); await p.waitForTimeout(250);
    check("retrying works", !(await dialogOpen(p)) && /Expense saved: −₱99\.00 from Cash on hand\./.test(await status(p)));
  });

  group = "Closing rules";
  await safe(async () => {
    const p = await open(1280); await openAdd(p);
    await p.mouse.click(10, 10); await p.waitForTimeout(150);
    check("a click outside closes an untouched form", !(await dialogOpen(p)));
    await openAdd(p); await p.fill("#qa-amount", "5");
    await p.mouse.click(10, 10); await p.waitForTimeout(150);
    check("a click outside does NOT close once something is typed", await dialogOpen(p));
    await dlg(p).locator("button:has-text('Cancel')").click(); await p.waitForTimeout(150);
    check("Cancel always closes", !(await dialogOpen(p)));
    await openAdd(p);
    const w = await dlg(p).evaluate(el => Math.round(el.getBoundingClientRect().width));
    eq("from 768px the dialog is a centred 500px dialog", w, 500);
    await shot(p, "quickadd-desktop-1280.png");
    check("focus returns to the header Add transaction button", (await (async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(150); return p.evaluate(() => document.activeElement?.textContent?.trim()); })()) === "Add transaction");
  });

  group = "Hidden by your filters (Activity)";
  await safe(async () => {
    const p = await open(1280, { view: "Activity" });
    await p.selectOption("#activity-account", { label: "GCash" });
    await openAdd(p); await fill(p, { amount: "50", account: 1, category: "Food", note: "Hidden one" });
    await saveBtn(p, "Save expense").click(); await p.waitForTimeout(250);
    const msg = await status(p);
    check("the SAME message gets 'It's hidden by your filters.' appended", /^Expense saved: −₱50\.00 from Cash on hand\. It's hidden by your filters\./.test(msg), msg);
    check("list does not show it", !(await mainText(p)).includes("Hidden one"));
    await p.locator('[role=status] button:has-text("Show it")').click(); await p.waitForTimeout(100);
    check("'Show it' clears the account filter and the entry appears", await p.inputValue("#activity-account") === "" && (await mainText(p)).includes("Hidden one"));
    await openAdd(p); await fill(p, { amount: "60", account: 3, category: "Food", note: "Visible one" });
    await saveBtn(p, "Save expense").click(); await p.waitForTimeout(250);
    check("an entry that is visible gets no extra clause", !/hidden/.test(await status(p)));
    await p.locator('button[aria-label="Dismiss message"]').click();
    check("the message can be dismissed", (await status(p)) === "");
  });

  group = "First run and layout";
  await safe(async () => {
    const q = await open(375, { query: "?demo=no-accounts" });
    check("with no accounts the Add button is disabled and no dialog can open", await q.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Add")').last().isDisabled());
    for (const W of [360, 375, 768, 1280]) {
      const p = await open(W); await openAdd(p);
      await p.locator("label:has(input[value=payment])").click(); await fill(p, { amount: "5000", account: 2 }); await p.selectOption("#qa-card", "4");
      const r = await p.evaluate(() => { const d = document.querySelector("[role=dialog]"); const body = d.querySelector("[data-slot=dialog-body]"); const foot = d.querySelector("[data-slot=dialog-footer]").getBoundingClientRect(); return { overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth || body.scrollWidth > body.clientWidth, footVisible: foot.bottom <= innerHeight + 1 && foot.top >= 0, dh: d.getBoundingClientRect().height, vh: innerHeight }; });
      check(`${W}px: no horizontal overflow, footer buttons stay visible, dialog within 92% of the height`, !r.overflowX && r.footVisible && r.dh <= r.vh * 0.92 + 1, JSON.stringify(r));
      const targets = await dlg(p).evaluate(d => [...d.querySelectorAll("button, select, input:not([type=radio])")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0; }).filter(e => e.getBoundingClientRect().height < 40 && !/^Fix|Dismiss/.test(e.textContent) && e.closest("ul") === null && !e.closest("p")).map(e => e.tagName + ":" + (e.id || e.textContent.trim().slice(0, 20))));
      check(`${W}px: every control is at least 40px tall`, targets.length === 0, targets.join(", "));
      await p.context().close();
    }
  });

  check("no request left the page's own origin", external.length === 0, external.length ? external.slice(0, 3).join(", ") : "all requests same-origin");
  check("no console errors or warnings, no uncaught exceptions", errors.length === 0, errors.slice(0, 3).join(" || ") || "none");

  await browser.close();
  const pass = results.filter(r => r.ok).length; let g = "";
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-quickadd-verify.json"), JSON.stringify(results, null, 1));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
