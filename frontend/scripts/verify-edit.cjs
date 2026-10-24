/* Milestone 4.5b browser verification of Edit and Delete (read-only).
 * Run (with `npx vite --port 4291` serving the app):  BASE_URL=http://localhost:4291/ node scripts/verify-edit.cjs
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
  async function open(width, { query = "", height = 900, view = "Activity" } = {}) {
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
  const overview = async p => { await nav(p, "Overview"); const t = await mainText(p); return { net: money(t, "Net position"), expenses: money(t, "Expenses"), have: money(t, "Money you have"), t }; };
  const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage: false }) : null;
  /* Phones: tap the row. Desktop: the row's Edit icon. */
  const openEditRow = async (p, key, label) => { await (p.big ? p.locator(`button[aria-label^="Edit ${label}"]`).first() : p.locator(`li button[data-row="${key}"]:visible`)).click(); await p.waitForTimeout(150); };
  const firstRow = p => p.locator("main section ul li").first().innerText().then(T);
  const activeAria = p => p.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.getAttribute("data-row") || document.activeElement?.tagName);

  group = "Edit an expense (journey U4)";
  await safe(async () => {
    const p = await open(375); const before = await overview(p); await nav(p, "Activity");
    await openEditRow(p, "t-17", "Lunch with team");
    check("opens as 'Edit expense'", await dlg(p).locator("h2:has-text('Edit expense')").isVisible());
    check("the type is a label, not a switch", /Type: Expense/.test(await dText(p)) && await dlg(p).locator("input[name=qa-kind]").count() === 0);
    check("fields are pre-filled", await p.inputValue("#qa-amount") === "385.00" && await p.inputValue("#qa-account") === "3" && await p.inputValue("#qa-date") === "2026-10-24" && await p.inputValue("#qa-note") === "Lunch with team" && await dlg(p).locator("input[name=qa-category]:checked").evaluate(i => i.parentElement.innerText.trim()) === "Food");
    check("Amount is focused", await p.evaluate(() => document.activeElement?.id) === "qa-amount");
    const text = await dText(p);
    check("no double-count hint, no Pay full, no estimate in edit mode", !/Paying a card bill/.test(text) && !/Pay full/.test(text) && !/estimate/.test(text));
    check("account options carry no balances (they already include this entry)", await p.evaluate(() => [...document.querySelectorAll("#qa-account option")].slice(1).every(o => !/₱/.test(o.textContent))));
    eq("Save button reads 'Save changes'", await dlg(p).locator("button[type=submit]").innerText(), "Save changes");
    check("a Delete button sits in the footer", await dlg(p).locator("#qa-delete").isVisible());
    await shot(p, "edit-expense-375.png");
    await p.fill("#qa-amount", "485");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(250);
    check("dialog closed", !(await dialogOpen(p)));
    eq("one confirmation message", await status(p), "Expense saved: −₱485.00 from GCash.");
    check("focus returns to the row that was tapped", await activeAria(p) === "t-17");
    check("Activity row shows the new amount", /Lunch with team −₱485\.00/.test(await firstRow(p)), await firstRow(p));
    eq("still 18 entries (changed, not added)", (await p.locator("main p[role=status]").allInnerTexts().then(a => a.map(T).find(x => /entries/.test(x)))), "18 entries · October 2026");
    const after = await overview(p);
    check("Overview: expenses +₱100.00 and net position −₱100.00", before.expenses === "₱27,127.40" && after.expenses === "₱27,227.40" && after.net === "₱33,046.25", `${after.expenses} / ${after.net}`);
    await nav(p, "Accounts"); check("Accounts: GCash ₱3,120.75 → ₱3,020.75", /GCash E-wallet ₱3,020\.75/.test(await mainText(p)));
  });

  group = "Edit validation and failure";
  await safe(async () => {
    const p = await open(375); await openEditRow(p, "t-17", "Lunch with team");
    await p.fill("#qa-amount", ""); await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(100);
    check("clearing the amount: 'Fix 1 thing to save' with the message", /Fix 1 thing to save/.test(await dText(p)) && /Enter an amount\./.test(await dText(p)));
    await p.fill("#qa-amount", "1.234"); await p.locator("#qa-note").focus();
    check("'Use at most 2 decimal places.'", /Use at most 2 decimal places\./.test(await dText(p)));
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    check("Escape after typing: the dialog closes (only outside clicks are guarded)", !(await dialogOpen(p)));
    const q = await open(375, { query: "?demo=save-error" }); await openEditRow(q, "t-17", "Lunch with team");
    await q.fill("#qa-amount", "400"); await dlg(q).locator("button[type=submit]").click(); await q.waitForTimeout(250);
    check("a failed edit keeps the dialog open and the change typed, with the notice", await dialogOpen(q) && await q.inputValue("#qa-amount") === "400" && /Couldn't save\. Check your connection and try again\. Your entry is still here\./.test(await dText(q)));
    await dlg(q).locator("button[type=submit]").click(); await q.waitForTimeout(250);
    check("retrying saves", !(await dialogOpen(q)) && /Expense saved: −₱400\.00 from GCash\./.test(await status(q)));
  });

  group = "Edit a card payment and an income";
  await safe(async () => {
    const p = await open(375); const before = await overview(p); await nav(p, "Activity");
    await p.locator('li button[data-row="p-1"]:visible').click(); await p.waitForTimeout(150);
    check("opens as 'Edit card payment' with card and pay-from set, no category", await dlg(p).locator("h2:has-text('Edit card payment')").isVisible() && await p.inputValue("#qa-account") === "2" && await p.inputValue("#qa-card") === "4" && await dlg(p).locator("input[name=qa-category]").count() === 0);
    check("no 'Owed now' or Pay full in edit mode", !/Owed now|Pay full/.test(await dText(p)));
    await p.fill("#qa-amount", "8,000");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(250);
    eq("message says it is not an expense and what the card owes now", await status(p), "Card payment saved: ₱8,000.00 from Main Savings to Blue Card. Blue Card now owes ₱11,250.00. Card payments don't count as expenses and don't change your net position.");
    const after = await overview(p);
    check("expenses and net position unchanged", before.expenses === after.expenses && before.net === after.net, `${before.expenses}/${after.expenses} ${before.net}/${after.net}`);
    await nav(p, "Activity");
    await p.locator('li button[data-row="t-11"]:visible').click(); await p.waitForTimeout(150);
    check("an income opens as 'Edit income' with income categories", await dlg(p).locator("h2:has-text('Edit income')").isVisible() && await dlg(p).locator("input[name=qa-category]").count() === 3);
    await p.keyboard.press("Escape");
  });

  group = "Edit moves an entry out of view";
  await safe(async () => {
    const p = await open(1280);
    await openEditRow(p, "t-17", "Lunch with team"); await p.fill("#qa-date", "2026-09-10");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(250);
    check("the same message gets 'It's hidden by your filters.' and Show it", /^Expense saved: −₱385\.00 from GCash\. It's hidden by your filters\./.test(await status(p)));
    check("focus falls back to the page heading (the row left the list)", await p.evaluate(() => document.activeElement?.tagName) === "H1");
    await p.locator('[role=status] button:has-text("Show it")').click(); await p.waitForTimeout(100);
    check("Show it opens September, where the entry now is", await p.inputValue("#month") === "2026-09" && (await mainText(p)).includes("Lunch with team"));
  });

  group = "Delete from the edit form (phone)";
  await safe(async () => {
    const p = await open(375); const before = await overview(p); await nav(p, "Activity");
    await openEditRow(p, "t-17", "Lunch with team"); await p.fill("#qa-amount", "999");
    await dlg(p).locator("#qa-delete").click(); await p.waitForTimeout(150);
    const text = await dText(p);
    check("confirmation names the entry and what changes", /Delete this expense\?/.test(text) && /Lunch with team · −₱385\.00 · Oct 24, 2026 · GCash/.test(text) && /GCash goes up by ₱385\.00 and this month's expenses drop by ₱385\.00\. This can't be undone\./.test(text), text);
    check("it replaces the form in the same dialog (one dialog)", await p.locator('[role=dialog]').count() === 1 && !(await dlg(p).locator("#qa-amount").isVisible()));
    check("Cancel has focus first", await p.evaluate(() => document.activeElement?.textContent?.trim()) === "Cancel");
    await shot(p, "delete-confirm-375.png");
    await dlg(p).locator("button:visible:has-text('Cancel')").click(); await p.waitForTimeout(100);
    check("Cancel returns to the form with the typed value still there", await dlg(p).locator("h2:has-text('Edit expense')").isVisible() && await p.inputValue("#qa-amount") === "999");
    check("focus returns to the form's Delete button", await p.evaluate(() => document.activeElement?.id) === "qa-delete");
    await dlg(p).locator("#qa-delete").click(); await p.waitForTimeout(100);
    await dlg(p).locator("button:has-text('Delete expense')").click(); await p.waitForTimeout(250);
    check("dialog closed", !(await dialogOpen(p)));
    eq("message", await status(p), "Expense deleted.");
    check("the row is gone: 17 entries", (await p.locator("main p[role=status]").allInnerTexts().then(a => a.map(T).find(x => /entries/.test(x)))) === "17 entries · October 2026" && !(await mainText(p)).includes("Lunch with team"));
    check("focus moves to the page heading (the opener no longer exists)", await p.evaluate(() => document.activeElement?.tagName) === "H1");
    const after = await overview(p);
    check("Overview: expenses −₱385.00, net position +₱385.00", after.expenses === "₱26,742.40" && after.net === "₱33,531.25", `${before.expenses} → ${after.expenses} / ${before.net} → ${after.net}`);
  });

  group = "Delete from the desktop row";
  await safe(async () => {
    const p = await open(1280);
    const del = p.locator('button[aria-label="Delete Lunch with team, ₱385.00"]');
    await del.click(); await p.waitForTimeout(150);
    check("opens straight on the confirmation with Cancel focused", /Delete this expense\?/.test(await dText(p)) && await p.evaluate(() => document.activeElement?.textContent?.trim()) === "Cancel");
    await shot(p, "delete-confirm-1280.png");
    await dlg(p).locator("button:visible:has-text('Cancel')").click(); await p.waitForTimeout(150);
    check("Cancel closes and focus returns to that Delete icon", !(await dialogOpen(p)) && await activeAria(p) === "Delete Lunch with team, ₱385.00");
    await del.click(); await p.waitForTimeout(100); await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    check("Escape does the same", !(await dialogOpen(p)) && await activeAria(p) === "Delete Lunch with team, ₱385.00");
    const before = await overview(p); await nav(p, "Activity");
    await p.locator('button[aria-label^="Delete Card payment"]').click(); await p.waitForTimeout(150);
    const text = await dText(p);
    check("payment: 'Delete this card payment?' says expenses don't change", /Delete this card payment\?/.test(text) && /Card payment · ₱5,000\.00 · Oct 20, 2026 · Main Savings → Blue Card/.test(text) && /Main Savings goes up by ₱5,000\.00 and Blue Card owed goes up by ₱5,000\.00\. Your expenses don't change\./.test(text), text);
    await dlg(p).locator("button:has-text('Delete payment')").click(); await p.waitForTimeout(250);
    eq("message", await status(p), "Card payment deleted.");
    const after = await overview(p);
    check("expenses and net position unchanged; Money you have +₱5,000.00", before.expenses === after.expenses && before.net === after.net && before.have === "₱54,196.25" && after.have === "₱59,196.25", `${before.have} → ${after.have}`);
    await nav(p, "Accounts"); check("Accounts: Blue Card owed back to ₱19,250.00", /Blue Card ₱19,250\.00 owed/.test(await mainText(p)));
  });

  group = "Delete fails once (?demo=save-error)";
  await safe(async () => {
    const p = await open(1280, { query: "?demo=save-error" });
    await p.locator('button[aria-label="Delete Lunch with team, ₱385.00"]').click(); await p.waitForTimeout(150);
    await dlg(p).locator("button:has-text('Delete expense')").click(); await p.waitForTimeout(250);
    check("notice in the dialog, nothing deleted, buttons usable again", await dialogOpen(p) && /Couldn't delete\. Nothing was changed\. Try again\./.test(await dText(p)) && await dlg(p).locator("button:has-text('Delete expense')").isEnabled() && (await mainText(p)).includes("Lunch with team"));
    await dlg(p).locator("button:has-text('Delete expense')").click(); await p.waitForTimeout(250);
    check("retrying deletes it", !(await dialogOpen(p)) && !(await mainText(p)).includes("Lunch with team") && await status(p) === "Expense deleted.");
  });

  group = "Layout";
  await safe(async () => {
    for (const W of [360, 375, 768, 1280]) {
      const p = await open(W); await openEditRow(p, "t-17", "Lunch with team");
      const edit = await p.evaluate(() => { const d = document.querySelector("[role=dialog]"); const f = [...d.querySelectorAll("[data-slot=dialog-footer]")].find(x => x.getBoundingClientRect().height > 0); const dr = d.getBoundingClientRect(); return { over: document.documentElement.scrollWidth > document.documentElement.clientWidth, footIn: [...f.querySelectorAll("button")].every(b => { const r = b.getBoundingClientRect(); return r.left >= dr.left - 1 && r.right <= dr.right + 1 && r.height >= 44; }), n: f.querySelectorAll("button").length, vis: f.getBoundingClientRect().bottom <= innerHeight + 1 }; });
      check(`${W}px edit: three footer buttons fit inside the dialog at 44px+, footer visible, no overflow`, !edit.over && edit.footIn && edit.n === 3 && edit.vis, JSON.stringify(edit));
      await p.locator("#qa-delete").click(); await p.waitForTimeout(100);
      const conf = await p.evaluate(() => { const d = document.querySelector("[role=dialog]"); const f = [...d.querySelectorAll("[data-slot=dialog-footer]")].find(x => x.getBoundingClientRect().height > 0); const dr = d.getBoundingClientRect(); return { over: document.documentElement.scrollWidth > document.documentElement.clientWidth, footIn: [...f.querySelectorAll("button")].every(b => { const r = b.getBoundingClientRect(); return r.left >= dr.left - 1 && r.right <= dr.right + 1 && r.height >= 44; }) }; });
      check(`${W}px delete confirmation: buttons fit at 44px+, no overflow`, !conf.over && conf.footIn, JSON.stringify(conf));
      if (W === 1280) { await p.locator("button:visible:has-text('Cancel')").click(); await p.waitForTimeout(100); await shot(p, "edit-expense-1280.png"); }
      await p.context().close();
    }
  });

  check("no request left the page's own origin", external.length === 0, external.length ? external.slice(0, 3).join(", ") : "all requests same-origin");
  check("no console errors or warnings, no uncaught exceptions", errors.length === 0, errors.slice(0, 3).join(" || ") || "none");

  await browser.close();
  const pass = results.filter(r => r.ok).length; let g = "";
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-edit-verify.json"), JSON.stringify(results, null, 1));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
