/* PR C browser verification of Kakeibo (ADR-021) against the mock data source (read-only; nothing is installed).
 * Run (with the app served, e.g. `npx vite preview --port 4191`):  BASE_URL=http://localhost:4191/ node scripts/verify-kakeibo.cjs
 * Uses playwright-core and a Chromium that already exist on this machine (see browser-runtime.cjs).
 * Prints one PASS/FAIL line per check; RESULTS_JSON receives a JSON copy; SHOTS_DIR receives screenshots. */
const path = require("path");
const fs = require("fs");
const { chromium, executablePath: CHROME } = require("./browser-runtime.cjs");
const BASE = process.env.BASE_URL || "http://localhost:4173/";
const SHOTS = process.env.SHOTS_DIR || "";

const results = []; let group = "";
const check = (name, ok, detail = "") => results.push({ group, name, ok: !!ok, detail: String(detail) });
const eq = (name, a, e) => check(name, a === e, `got ${JSON.stringify(a)}${a === e ? "" : ` expected ${JSON.stringify(e)}`}`);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-gpu"] });
  const errors = [], external = [];
  const safe = async fn => { try { await fn(); } catch (e) { check("section aborted: " + String(e.message).split("\n")[0].slice(0, 220), false); } };
  async function open(width, { query = "", height = 900, view = "Kakeibo", reducedMotion } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}${query}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}@${width}${query}: ${m.text().slice(0, 140)}`); });
    page.on("request", r => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith("data:")) external.push(u); });
    await page.goto(BASE + query); await page.evaluate(() => document.fonts.ready);
    page.big = width >= 768;
    if (view !== "Overview") await nav(page, view);
    return page;
  }
  const nav = async (p, name) => { await p.locator(`nav[aria-label="Main"] >> visible=true >> button:has-text("${name}")`).first().click(); await p.waitForTimeout(150); };
  const T = s => s.replace(/\s+/g, " ").trim();
  const mainText = p => p.evaluate(() => document.querySelector("main").innerText.replace(/\s+/g, " ").trim());
  const dlg = p => p.locator('[role="dialog"]');
  const card = (p, envelope) => p.locator(`article[aria-labelledby="envelope-${envelope}-title"]`);
  const cardText = async (p, envelope) => T(await card(p, envelope).innerText());
  const status = p => p.locator('[role=status][aria-live=polite]').first().innerText().then(T);
  const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage: true }) : null;
  const openAdd = async p => { await (p.big ? p.locator('main button:has-text("Add transaction"):visible').first() : p.locator('nav[aria-label="Main"] >> visible=true >> button[aria-label^="Add transaction"]').last()).click(); await p.waitForTimeout(150); };
  const chip = (p, name) => dlg(p).locator(`label:has(input[name=qa-category]):has-text("${name}")`);
  const envChip = (p, name) => dlg(p).locator(`label:has(input[name=qa-envelope]):has-text("${name}")`);
  const checkedEnvelope = p => dlg(p).locator("input[name=qa-envelope]:checked").getAttribute("value");
  const planButton = p => p.locator('main button:has-text("Edit plan"), main button:has-text("Create plan")').first();
  const fillPlan = async (p, v) => { for (const [id, value] of Object.entries(v)) await p.fill(`#${id}`, value); };
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  group = "Navigation";
  await safe(async () => {
    for (const w of [320, 375]) {
      const p = await open(w, { view: "Overview" });
      const bar = await p.evaluate(() => {
        const nav = [...document.querySelectorAll('nav[aria-label="Main"]')].find(n => n.getBoundingClientRect().width > 0);
        return [...nav.querySelectorAll("button")].map(b => { const r = b.getBoundingClientRect(); return { text: b.innerText.replace(/\s+/g, " ").trim(), w: r.width, h: r.height, right: r.right }; });
      });
      eq(`${w}px: bottom bar has Overview, Activity, Accounts, Kakeibo and Add`, bar.map(b => b.text).join("|"), "Overview|Activity|Accounts|Kakeibo|Add");
      check(`${w}px: every bar item is at least 48px wide and 44px tall`, bar.every(b => b.w >= 48 && b.h >= 44), bar.map(b => `${b.text} ${Math.round(b.w)}x${Math.round(b.h)}`).join(", "));
      check(`${w}px: no label is cut off`, await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Main"] button span.truncate')].filter(s => s.getBoundingClientRect().width > 0).every(s => s.scrollWidth <= s.clientWidth)));
      check(`${w}px: the bar stays inside the screen`, bar.every(b => b.right <= w));
      await nav(p, "Kakeibo");
      eq(`${w}px: Kakeibo opens with its h1 focused`, await p.evaluate(() => document.activeElement === document.querySelector("main h1") && document.activeElement.textContent), "Kakeibo");
      eq(`${w}px: Kakeibo is the current page`, await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Main"] button[aria-current=page]')].filter(b => b.getBoundingClientRect().width > 0).map(b => b.innerText.trim()).join()), "Kakeibo");
      eq(`${w}px: no horizontal scroll on Kakeibo`, await overflow(p), 0);
      await openAdd(p);
      check(`${w}px: Add still opens Quick Add from Kakeibo`, await dlg(p).locator("h2:has-text('Add transaction')").isVisible());
      await shot(p, `kakeibo-${w}-quickadd.png`);
      await p.context().close();
    }
    for (const w of [768, 1440]) {
      const p = await open(w, { view: "Overview" });
      check(`${w}px: the ${w >= 1024 ? "sidebar" : "rail"} lists Kakeibo`, await p.locator('aside nav[aria-label="Main"] button:has-text("Kakeibo")').isVisible());
      await nav(p, "Kakeibo");
      eq(`${w}px: no horizontal scroll`, await overflow(p), 0);
      eq(`${w}px: one Add transaction button (page header)`, await p.locator('button:has-text("Add transaction"):visible').count(), 1);
      await shot(p, `kakeibo-${w}.png`);
      await p.context().close();
    }
  });

  group = "Dashboard with a saved plan";
  await safe(async () => {
    const p = await open(375);
    const t = await mainText(p);
    check("plan figures: income, starting funds, savings, debt reserve", /Planned income ₱36,000\.00/.test(t) && /Starting funds .*₱2,000\.00/.test(t) && /Savings target .*₱5,000\.00/.test(t) && /Debt reserve .*₱3,000\.00/.test(t));
    check("server figures: available ₱30,000.00 and unallocated ₱2,000.00", /Available to allocate ₱30,000\.00/.test(t) && /Unallocated .*₱2,000\.00/.test(t));
    check("the savings target is called a goal, not money saved", /A goal, not money already saved/.test(t));
    check("recorded figures are kept apart and labelled as activity", /Recorded so far From your activity Income \+₱36,500\.00 Total expenses .*₱27,127\.40/.test(t));
    check("the monthly intention is shown", /Cook at home on weekdays/.test(t));
    eq("four envelopes in order", await p.locator("article[aria-labelledby^=envelope-] h3").allInnerTexts().then(a => a.join("|")), "Needs|Wants|Culture|Unexpected");
    const needs = await cardText(p, "needs");
    check("Needs over its limit keeps the negative remainder", /Spent ₱19,951\.90 Remaining −₱1,951\.90/.test(needs), needs);
    check("Needs says it is over in words, with no red", /₱1,951\.90 over the ₱18,000\.00 limit/.test(needs) && !(await card(p, "needs").evaluate(el => [...el.querySelectorAll("*")].some(n => getComputedStyle(n).color === "rgb(196, 28, 41)"))));
    eq("Needs bar is full", await card(p, "needs").locator('[role=img] > div').evaluate(el => el.style.width), "100%");
    check("Wants shows 77% of ₱5,000.00 and ₱1,136.00 left", /₱3,864\.00 Remaining ₱1,136\.00 77% of ₱5,000\.00/.test(await cardText(p, "wants")));
    eq("Wants bar width", await card(p, "wants").locator('[role=img] > div').evaluate(el => el.style.width), "77%");
    eq("progress bars have a text alternative", await card(p, "culture").locator('[role=img]').getAttribute("aria-label"), "₱1,800.00 of ₱2,000.00 spent");
    check("unclassified ₱1,025.00, still counted in total expenses", /Not yet classified ₱1,025\.00 Expenses without an envelope\. They’re still counted in this month’s total expenses of ₱27,127\.40\./.test(t));
    check("the unclassified card offers Classify expenses", await p.getByRole("button", { name: "Classify expenses" }).isVisible());
    eq("Edit plan is offered", await planButton(p).innerText().then(T), "Edit plan");
    await shot(p, "kakeibo-375.png");
    await p.context().close();
  });

  group = "Empty and no-plan states";
  await safe(async () => {
    const p = await open(375, { query: "?demo=no-plan" });
    let t = await mainText(p);
    check("no plan: a friendly setup state, not an error", /No plan for October 2026 yet/.test(t) && (await p.locator("main [role=alert]").count()) === 0);
    eq("no plan: Create plan is offered", await planButton(p).innerText().then(T), "Create plan");
    check("no plan: envelopes still show actual spending, with no limit invented", /Spent ₱19,951\.90 Limit Not planned/.test(await cardText(p, "needs")) && (await p.locator("article [role=img]").count()) === 0);
    await p.selectOption("#kakeibo-month", "2026-09"); await p.waitForTimeout(250);
    t = await mainText(p);
    check("empty month: no plan, ₱0.00 recorded, no expenses yet", /No plan for September 2026 yet/.test(t) && /Income \+?₱0\.00/.test(t) && /No expenses recorded in September 2026 yet/.test(t));
    await nav(p, "Overview");
    eq("the month is shared with Overview", await p.inputValue("#month"), "2026-09");
    await p.context().close();
  });

  group = "Creating and editing a plan";
  await safe(async () => {
    const p = await open(375);
    await p.selectOption("#kakeibo-month", "2026-09"); await p.waitForTimeout(250);
    await planButton(p).click(); await p.waitForTimeout(250);
    check("the dialog opens as Plan September 2026", await dlg(p).locator("h2:has-text('Plan September 2026')").isVisible());
    eq("focus starts on Planned income", await p.evaluate(() => document.activeElement?.id), "kp-income");
    eq("starting funds and the debt reserve start at zero", `${await p.inputValue("#kp-starting")}|${await p.inputValue("#kp-debt")}`, "0.00|0.00");
    check("the dialog says a plan never changes the ledger", /never changes your accounts or activity/.test(T(await dlg(p).innerText())));
    await fillPlan(p, { "kp-income": "-100", "kp-savings": "1.234" });
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(150);
    const d = T(await dlg(p).innerText());
    check("a negative amount is refused", /Planned income: Plan amounts can't be negative\./.test(d), d.slice(0, 300));
    check("three decimal places are refused", /Savings target: Use at most 2 decimal places\./.test(d));
    check("empty limits ask for an amount, and 0 is fine", /Needs: Enter an amount \(0 is fine\)\./.test(d));
    eq("focus moves to the error summary", await p.evaluate(() => document.activeElement?.getAttribute("role")), "alert");
    await fillPlan(p, { "kp-income": "20000", "kp-savings": "0", "kp-needs": "15000", "kp-wants": "6000", "kp-culture": "0", "kp-unexpected": "1000" });
    const check1 = T(await dlg(p).innerText());
    check("the planning check shows an estimate", /Planning check \(estimate\) Available to allocate ₱20,000\.00 Over-allocated −₱2,000\.00/.test(check1), check1.slice(-500));
    check("over-allocation warns without changing the numbers", /Your limits are ₱2,000\.00 more than you have available\. You can still save this plan/.test(check1) && (await p.inputValue("#kp-needs")) === "15000");
    await p.fill("#kp-intention", "Walk to work twice a week.");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    check("saving closes the dialog", !(await dlg(p).count()));
    check("the confirmation says the ledger is unchanged", /Plan saved for September 2026\. Your accounts and activity are unchanged\./.test(await status(p)));
    eq("focus returns to the plan button", await p.evaluate(() => document.activeElement?.innerText.trim()), "Edit plan");
    let t = await mainText(p);
    check("the dashboard refreshes with the server's over-allocation", /Available to allocate ₱20,000\.00 Over-allocated .*−₱2,000\.00/.test(t) && /Your envelope limits add up to ₱2,000\.00 more than you have available/.test(t));
    check("a zero limit shows no bar and no division", /No limit set \(₱0\.00 planned\)\./.test(await cardText(p, "culture")) && (await card(p, "culture").locator("[role=img]").count()) === 0);
    await planButton(p).click(); await p.waitForTimeout(250);
    check("Edit loads the saved values", (await p.inputValue("#kp-income")) === "20000.00" && (await p.inputValue("#kp-culture")) === "0.00" && (await p.inputValue("#kp-intention")) === "Walk to work twice a week.");
    check("Edit is titled for the month", await dlg(p).locator("h2:has-text('Edit September 2026 plan')").isVisible());
    await p.fill("#kp-wants", "4000");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    check("updating says Plan updated", /Plan updated for September 2026/.test(await status(p)));
    t = await mainText(p);
    check("balanced plan: unallocated ₱0.00", /Unallocated .*₱0\.00/.test(t));
    await nav(p, "Accounts");
    check("saving plans leaves the accounts unchanged", /₱54,196\.25/.test(await mainText(p)));
    await p.context().close();
  });

  group = "All-zero plan";
  await safe(async () => {
    const p = await open(375);
    await p.selectOption("#kakeibo-month", "2026-08"); await p.waitForTimeout(250);
    await planButton(p).click(); await p.waitForTimeout(250);
    await fillPlan(p, { "kp-income": "0", "kp-savings": "0", "kp-needs": "0", "kp-wants": "0", "kp-culture": "0", "kp-unexpected": "0" });
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    const t = await mainText(p);
    check("an all-zero plan saves and shows ₱0.00 available", /Available to allocate ₱0\.00/.test(t) && /Unallocated .*₱0\.00/.test(t));
    eq("every envelope says no limit is set", (t.match(/No limit set \(₱0\.00 planned\)/g) || []).length, 4);
    await p.context().close();
  });

  group = "Failed saves, loading errors and retry";
  await safe(async () => {
    let p = await open(375, { query: "?demo=save-error" });
    await planButton(p).click(); await p.waitForTimeout(250);
    await p.fill("#kp-wants", "5500");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(300);
    check("a failed save says so and keeps the dialog open", /Couldn't save\. Check your connection and try again\. Your plan is still here\./.test(T(await dlg(p).innerText())));
    eq("what was typed is kept", await p.inputValue("#kp-wants"), "5500");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    check("saving again succeeds", !(await dlg(p).count()) && /₱5,500\.00/.test(await cardText(p, "wants")));
    await p.context().close();

    p = await open(375, { query: "?demo=slow" });
    await planButton(p).click(); await p.waitForTimeout(1700);
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(200);
    check("while saving, Save shows Saving… and is disabled", (await dlg(p).locator("button[type=submit]").isDisabled()) && /Saving…/.test(await dlg(p).locator("button[type=submit]").innerText()));
    check("while saving, the fields are disabled", await p.locator("#kp-income").isDisabled());
    await p.context().close();

    p = await open(375, { query: "?demo=load-error&failing=kakeibo" });
    await p.waitForTimeout(200);
    check("a failed load shows the retry block", /Couldn't load your Kakeibo plan\./.test(await mainText(p)));
    check("no plan button while the report failed", (await planButton(p).count()) === 0);
    await p.getByRole("button", { name: "Retry loading your Kakeibo plan" }).click(); await p.waitForTimeout(300);
    check("Retry loads the plan", /Your October 2026 plan/.test(await mainText(p)));
    await p.context().close();

    p = await open(375, { query: "?demo=load-error&failing=kakeibo-plan" });
    await planButton(p).click(); await p.waitForTimeout(250);
    check("the plan dialog says when the plan can't load", /Couldn’t load this month’s plan/.test(T(await dlg(p).innerText())));
    await dlg(p).getByRole("button", { name: "Try again" }).click(); await p.waitForTimeout(300);
    eq("Try again loads the plan", await p.inputValue("#kp-income"), "36000.00");
    await p.context().close();

    p = await open(375, { query: "?demo=offline" });
    await p.waitForTimeout(200);
    check("offline: the Kakeibo block fails on its own, with Retry", /Couldn't load your Kakeibo plan\./.test(await mainText(p)));
    await p.context().close();

    p = await open(375, { query: "?demo=loading" });
    check("?demo=loading shows the skeleton and a busy page", (await p.locator('main [aria-busy="true"]').count()) === 1 && /Loading your Kakeibo plan/.test(await p.locator("main p[role=status].sr-only").innerText()));
    await p.context().close();
  });

  group = "Quick Add envelopes";
  await safe(async () => {
    const p = await open(375);
    await openAdd(p);
    check("an expense offers the envelope picker, starting at Not sure yet", (await dlg(p).locator("legend:has-text('Kakeibo envelope')").isVisible()) && (await checkedEnvelope(p)) === "");
    await chip(p, "Groceries").click();
    eq("Groceries suggests Needs (followed while the person hasn't chosen)", await checkedEnvelope(p), "needs");
    await chip(p, "Food").click();
    eq("Food has no suggestion, so it goes back to Not sure yet", await checkedEnvelope(p), "");
    await envChip(p, "Wants").click();
    await chip(p, "Bills").click();
    eq("after a manual choice, changing category keeps it", await checkedEnvelope(p), "wants");
    check("the suggestion is offered, not applied", /Bills is usually Needs\. Use Needs/.test(T(await dlg(p).innerText())));
    await dlg(p).getByRole("button", { name: "Use Needs" }).click();
    eq("Use Needs applies the suggestion", await checkedEnvelope(p), "needs");
    for (const kind of ["Income", "Pay card", "Transfer"]) {
      await dlg(p).locator(`label:has(input[name=qa-kind]):has-text("${kind}")`).click();
      eq(`${kind}: no envelope picker`, await dlg(p).locator("input[name=qa-envelope]").count(), 0);
    }
    await dlg(p).locator('label:has(input[name=qa-kind]):has-text("Expense")').click();
    eq("back to Expense: Not sure yet again", await checkedEnvelope(p), "");
    await p.fill("#qa-amount", "250"); await p.selectOption("#qa-account", "1"); await chip(p, "Other").click(); await envChip(p, "Culture").click();
    await p.fill("#qa-note", "Paperback");
    await shot(p, "kakeibo-375-envelope-picker.png");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    check("the expense is saved", /Expense saved: −₱250\.00 from Cash on hand\./.test(await status(p)));
    check("Culture spending goes up by ₱250.00 (₱1,800.00 → ₱2,050.00)", /Spent ₱2,050\.00 Remaining −₱50\.00/.test(await cardText(p, "culture")), await cardText(p, "culture"));
    check("total expenses go up once", /Total expenses .*₱27,377\.40/.test(await mainText(p)));

    // Income, a card payment and a transfer never change the envelopes.
    const before = await p.evaluate(() => [...document.querySelectorAll("article[aria-labelledby^=envelope-]")].map(a => a.innerText).join("|"));
    const unclassified = () => p.locator("#kakeibo-unclassified-title").locator("xpath=..").innerText().then(T);
    const before2 = await unclassified();
    const entries = [
      { kind: "Income", fill: async () => { await p.fill("#qa-amount", "1000"); await p.selectOption("#qa-account", "2"); await chip(p, "Freelance").click(); } },
      { kind: "Pay card", fill: async () => { await p.fill("#qa-amount", "500"); await p.selectOption("#qa-account", "2"); await p.selectOption("#qa-card", "4"); } },
      { kind: "Transfer", fill: async () => { await p.fill("#qa-amount", "300"); await p.selectOption("#qa-account", "2"); await p.selectOption("#qa-destination", "3"); } },
    ];
    for (const e of entries) {
      await openAdd(p);
      await dlg(p).locator(`label:has(input[name=qa-kind]):has-text("${e.kind}")`).click();
      await e.fill();
      await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
      check(`${e.kind} saved`, !(await dlg(p).count()));
    }
    const after = await p.evaluate(() => [...document.querySelectorAll("article[aria-labelledby^=envelope-]")].map(a => a.innerText).join("|"));
    check("income, card payment and transfer leave every envelope unchanged", before === after);
    eq("and leave the unclassified total unchanged", await unclassified(), before2);
    check("income shows in Recorded so far", /Income \+₱37,500\.00/.test(await mainText(p)));
    await p.context().close();
  });

  group = "Editing keeps the classification";
  await safe(async () => {
    const p = await open(1440, { view: "Activity" });
    const editRow = async title => { await p.locator(`button[aria-label^="Edit ${title},"]`).first().click(); await p.waitForTimeout(200); };
    await editRow("Lunch with team");
    eq("an unclassified expense opens as Not sure yet", await checkedEnvelope(p), "");
    await chip(p, "Groceries").click();
    eq("changing its category doesn't classify it silently", await checkedEnvelope(p), "");
    check("the category's suggestion is offered instead", /Groceries is usually Needs\./.test(T(await dlg(p).innerText())));
    await chip(p, "Food").click();
    await p.fill("#qa-amount", "400");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    await editRow("Dinner with family");
    eq("a classified expense opens with its envelope", await checkedEnvelope(p), "wants");
    await p.fill("#qa-amount", "1300");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    await nav(p, "Kakeibo");
    check("the edited unclassified expense stays unclassified (₱1,025.00 → ₱1,040.00)", /Not yet classified ₱1,040\.00/.test(await mainText(p)));
    check("the edited Wants expense stays in Wants (₱3,864.00 → ₱3,914.00)", /Spent ₱3,914\.00/.test(await cardText(p, "wants")));
    await p.context().close();
  });

  group = "Keyboard, dialog focus and reduced motion";
  await safe(async () => {
    const p = await open(1440, { reducedMotion: "reduce" });
    const button = planButton(p);
    await button.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    eq("Enter opens the plan dialog with focus on Planned income", await p.evaluate(() => document.activeElement?.id), "kp-income");
    const labels = await p.evaluate(() => [...document.querySelectorAll('[role=dialog] input')].filter(i => !(i.labels && i.labels.length)).map(i => i.id));
    eq("every plan field has a label", labels.join(), "");
    await p.keyboard.press("Tab");
    eq("Tab moves to Starting funds", await p.evaluate(() => document.activeElement?.id), "kp-starting");
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    check("Escape closes it and focus returns to Edit plan", !(await dlg(p).count()) && /Edit plan/.test(await p.evaluate(() => document.activeElement?.innerText)));
    eq("nothing on Kakeibo animates with reduced motion", await p.evaluate(() => document.getAnimations().length), 0);
    await p.context().close();
  });

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} [${r.group}] ${r.name}${r.ok ? "" : ` — ${r.detail}`}`);
  check("no console errors or warnings", errors.length === 0, errors.slice(0, 5).join(" | "));
  check("no requests leave the app's origin", external.length === 0, external.slice(0, 3).join(" "));
  const last = results.slice(-2);
  for (const r of last) console.log(`${r.ok ? "PASS" : "FAIL"} [${r.group}] ${r.name}${r.ok ? "" : ` — ${r.detail}`}`);
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (process.env.RESULTS_JSON) fs.writeFileSync(process.env.RESULTS_JSON, JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
