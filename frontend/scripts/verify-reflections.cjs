/* PR D browser verification of Kakeibo reflections, classification and suggestions (ADR-021), mock data only.
 * Run (with the app served, e.g. `npx vite preview --port 4191`):  BASE_URL=http://localhost:4191/ node scripts/verify-reflections.cjs
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
  const nav = async (p, name) => { await p.locator(`nav[aria-label="Main"] >> visible=true >> button:has-text("${name}")`).first().click(); await p.waitForTimeout(200); };
  const T = s => s.replace(/\s+/g, " ").trim();
  const dlg = p => p.locator('[role="dialog"]');
  const region = (p, id) => p.locator(`[aria-labelledby="${id}"]`).first();
  const text = async (p, id) => T(await region(p, id).innerText());
  const status = p => p.locator('[role=status][aria-live=polite]').first().innerText().then(T);
  const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage: true }) : null;
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const accountsText = async p => { await nav(p, "Accounts"); const t = T(await p.locator("main").innerText()); await nav(p, "Kakeibo"); return t.match(/Money you have ₱[\d,.]+/)?.[0]; };
  const openClassify = async p => { await p.getByRole("button", { name: "Classify expenses" }).click(); await p.waitForTimeout(350); };
  const rowBox = (p, title) => dlg(p).locator(`li:has-text("${title}") input[type=checkbox]`);

  group = "Layout and order";
  await safe(async () => {
    for (const w of [320, 375, 768, 1440]) {
      const p = await open(w);
      eq(`${w}px: no horizontal scroll`, await overflow(p), 0);
      const order = await p.evaluate(() => [...document.querySelectorAll("main h2")].map(h => h.textContent.trim()));
      check(`${w}px: plan and envelopes come before the look-back cards`, order.indexOf("Envelopes") < order.indexOf("Look back") && order.indexOf("Look back") < order.indexOf("Weekly check-in"), order.join(" | "));
      eq(`${w}px: still four views in the navigation`, await p.evaluate(() => [...[...document.querySelectorAll('nav[aria-label="Main"]')].find(n => n.getBoundingClientRect().width > 0).querySelectorAll("button[aria-current], button:not([aria-label])")].length), w < 768 ? 4 : 4);
      await shot(p, `reflections-${w}.png`);
      await p.context().close();
    }
  });

  group = "Weekly check-in";
  await safe(async () => {
    const p = await open(375);
    eq("the week of today is shown first", await p.inputValue("#kakeibo-week"), "2026-10-19");
    eq("weeks touching October, newest first (the first starts in September)", await p.locator("#kakeibo-week option").allInnerTexts().then(a => a.join(" | ")), "Oct 19 – Oct 25, 2026 | Oct 12 – Oct 18, 2026 | Oct 5 – Oct 11, 2026 | Sep 28 – Oct 4, 2026");
    let t = await text(p, "kakeibo-week-title");
    check("server totals for the week: total, Needs, Unexpected, not classified", /Total expenses ₱4,358\.00 Needs ₱2,846\.50 Wants ₱0\.00 Culture ₱0\.00 Unexpected ₱486\.50 Not classified ₱1,025\.00/.test(t), t);
    check("saved notes are shown under their questions", /What surprised me about my spending\? Small food buys added up faster than I thought\./.test(t));
    await p.selectOption("#kakeibo-week", "2026-09-28"); await p.waitForTimeout(300);
    t = await text(p, "kakeibo-week-title");
    check("a week with no notes says so without pressure", /No notes for this week\. A quick look back is optional\./.test(t));
    check("the Sep 28 – Oct 4 week counts its October days (rent and the wet market)", /Total expenses ₱9,920\.25/.test(t), t);
    await p.getByRole("button", { name: "Write notes" }).click(); await p.waitForTimeout(250);
    check("the form is titled with the week", await dlg(p).locator("h2:has-text('Week of Sep 28 – Oct 4, 2026')").isVisible());
    eq("focus starts on the first question", await p.evaluate(() => document.activeElement?.id), "kw-surprise");
    eq("every note has a label", await p.evaluate(() => [...document.querySelectorAll("[role=dialog] textarea")].filter(t => !t.labels?.length).length), 0);
    await p.fill("#kw-surprise", "Rent and bills came in one week.");
    await p.fill("#kw-next", "Spread the bills out.");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    check("saving closes the form and confirms", !(await dlg(p).count()) && /Notes saved for the week of Sep 28 – Oct 4, 2026\./.test(await status(p)));
    eq("focus returns to the button that opened it", await p.evaluate(() => document.activeElement?.innerText.trim()), "Edit notes");
    t = await text(p, "kakeibo-week-title");
    check("the saved notes appear, the blank one doesn't", /Rent and bills came in one week\./.test(t) && /Spread the bills out\./.test(t) && !/Which expenses felt worthwhile\?/.test(t));
    await p.getByRole("button", { name: "Edit notes" }).click(); await p.waitForTimeout(250);
    eq("editing loads the saved notes", await p.inputValue("#kw-next"), "Spread the bills out.");
    await p.fill("#kw-surprise", "");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    t = await text(p, "kakeibo-week-title");
    check("clearing one note on purpose clears only that one", !/Rent and bills/.test(t) && /Spread the bills out\./.test(t));
    await p.selectOption("#kakeibo-week", "2026-10-19"); await p.waitForTimeout(250);
    check("other weeks keep their notes", /Small food buys/.test(await text(p, "kakeibo-week-title")));
    await p.selectOption("#kakeibo-month", "2026-09"); await p.waitForTimeout(300);
    eq("another month starts at its own last week", await p.inputValue("#kakeibo-week"), "2026-09-28");
    await p.context().close();

    const q = await open(375, { query: "?demo=save-error" });
    await q.getByRole("button", { name: "Edit notes" }).click(); await q.waitForTimeout(250);
    await q.fill("#kw-worthwhile", "Kept after a failure");
    await dlg(q).locator("button[type=submit]").click(); await q.waitForTimeout(300);
    check("a failed save says so and keeps the form open", /Couldn't save\. Check your connection and try again\. What you wrote is still here\./.test(T(await dlg(q).innerText())));
    eq("the typed note is kept", await q.inputValue("#kw-worthwhile"), "Kept after a failure");
    eq("and the untouched notes too", await q.inputValue("#kw-next"), "Pack lunch on Tuesday and Thursday.");
    await dlg(q).locator("button[type=submit]").click(); await q.waitForTimeout(400);
    check("saving again works", !(await dlg(q).count()) && /Kept after a failure/.test(await text(q, "kakeibo-week-title")));
    await q.context().close();

    const r = await open(375, { query: "?demo=load-error&failing=kakeibo-week" });
    await r.waitForTimeout(200);
    check("a week that fails to load shows Retry, and the rest of Kakeibo stays", /Couldn't load this week's summary\./.test(await text(r, "kakeibo-week-title")) && /Your October 2026 plan/.test(T(await r.locator("main").innerText())));
    await r.getByRole("button", { name: "Retry loading this week's summary" }).click(); await r.waitForTimeout(300);
    check("Retry loads the week", /Total expenses ₱4,358\.00/.test(await text(r, "kakeibo-week-title")));
    await r.context().close();
  });

  group = "Month-end reflection";
  await safe(async () => {
    const p = await open(375);
    check("no reflection yet: a gentle invitation", /Look back on October 2026/.test(await text(p, "kakeibo-month-review-title")));
    await p.getByRole("button", { name: "Write reflection" }).click(); await p.waitForTimeout(250);
    const d = T(await dlg(p).innerText());
    check("the form shows this month's server totals", /October 2026 so far, from your activity Income \+₱36,500\.00 Total expenses ₱27,127\.40 Needs ₱19,951\.90/.test(d), d.slice(0, 300));
    check("savings are labelled self-reported and unchecked", /Self-reported savings \(optional\)/.test(d) && /doesn't check it against your accounts or move any money/.test(d));
    eq("focus starts on self-reported savings", await p.evaluate(() => document.activeElement?.id), "kr-saved");
    await p.fill("#kr-saved", "-10");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(200);
    check("a negative amount is refused", /Plan amounts can't be negative\./.test(T(await dlg(p).innerText())) && (await dlg(p).count()) === 1);
    await p.fill("#kr-saved", "0");
    await p.fill("#kr-change", "Cook at home three nights a week.");
    await p.fill("#kr-lesson", "Small buys add up.");
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    check("zero savings is accepted and the reflection saves", !(await dlg(p).count()) && /October 2026 reflection saved/.test(await status(p)));
    let t = await text(p, "kakeibo-month-review-title");
    check("the card shows when it was saved", /Saved [A-Z][a-z]{2} \d{1,2}, \d{4}/.test(t), t.slice(0, 120));
    check("the snapshot is the server's totals at saving", /Totals when you saved it Income \+₱36,500\.00 Total expenses ₱27,127\.40/.test(t));
    check("self-reported ₱0.00, marked as not a balance", /Self-reported savings ₱0\.00 \(your own figure, not an account balance\)/.test(t));
    check("no changed warning right after saving", !/has changed since/.test(t));
    // An ordinary edit to the ledger: the snapshot stays, and the card says the activity changed.
    await p.locator('main button:has-text("Add transaction"):visible, nav[aria-label="Main"] >> visible=true >> button[aria-label^="Add transaction"]').last().click(); await p.waitForTimeout(200);
    await p.fill("#qa-amount", "100"); await p.selectOption("#qa-account", "1"); await dlg(p).locator('label:has(input[name=qa-category]):has-text("Food")').click();
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    t = await text(p, "kakeibo-month-review-title");
    check("after a new expense, the card says activity changed", /Your activity for October 2026 has changed since this reflection was saved/.test(t));
    check("and the saved snapshot is unchanged (₱27,127.40, not ₱27,227.40)", /Total expenses ₱27,127\.40/.test(t) && !/₱27,227\.40/.test(t));
    await p.getByRole("button", { name: "Edit reflection" }).click(); await p.waitForTimeout(250);
    check("editing warns that saving replaces the stored totals", /Saving again replaces the totals stored on .* with this month’s totals as they are now\./.test(T(await dlg(p).innerText())));
    eq("editing keeps the saved answers", await p.inputValue("#kr-change"), "Cook at home three nights a week.");
    eq("and the saved savings figure", await p.inputValue("#kr-saved"), "0.00");
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    check("cancelling saves nothing (the warning stays)", /has changed since/.test(await text(p, "kakeibo-month-review-title")));
    await p.getByRole("button", { name: "Edit reflection" }).click(); await p.waitForTimeout(250);
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    t = await text(p, "kakeibo-month-review-title");
    check("saving again takes a new snapshot and the warning goes", /Total expenses ₱27,227\.40/.test(t) && !/has changed since/.test(t));
    await p.context().close();

    const q = await open(1440, { query: "?demo=reviewed" });
    t = await text(q, "kakeibo-month-review-title");
    check("?demo=reviewed: the changed warning and the original snapshot show", /has changed since/.test(t) && /Total expenses ₱26,742\.40/.test(t) && /₱4,000\.00 \(your own figure/.test(t));
    await q.context().close();

    const r = await open(375, { query: "?demo=no-plan" });
    await r.getByRole("button", { name: "Write reflection" }).click(); await r.waitForTimeout(250);
    check("with no plan, the form says the plan amounts will be stored as ₱0.00", /October 2026 has no plan\. Saving a reflection also stores its plan amounts as ₱0\.00/.test(T(await dlg(r).innerText())));
    await dlg(r).locator("button[type=submit]").click(); await r.waitForTimeout(400);
    t = await text(r, "kakeibo-plan-title");
    check("afterwards the plan card says no plan amounts, not a plan you made", /No plan amounts for October 2026/.test(t) && !/Your October 2026 plan/.test(t));
    eq("and still offers Create plan", await r.locator('main button:has-text("Create plan")').count(), 1);
    await r.context().close();
  });

  group = "Classifying past expenses";
  await safe(async () => {
    const p = await open(375);
    const money = await accountsText(p);
    await openClassify(p);
    let d = T(await dlg(p).innerText());
    check("the dialog says only the envelope changes", /Only the envelope changes\. Amounts, accounts, dates and balances stay the same\./.test(d));
    eq("it lists the two unclassified expenses, nothing ticked", `${await dlg(p).locator("li input[type=checkbox]").count()}|${await dlg(p).locator("li input[type=checkbox]:checked").count()}`, "2|0");
    await dlg(p).locator('label:has(input[name=kc-show]):has-text("All expenses")').click(); await p.waitForTimeout(100);
    d = T(await dlg(p).innerText());
    eq("All expenses lists the 15 October expenses", await dlg(p).locator("li input[type=checkbox]").count(), 15);
    check("income, card payments and transfers never appear", !/October salary|Logo project|Card payment/.test(d));
    await dlg(p).locator('label:has(input[name=kc-show]):has-text("Not classified")').click(); await p.waitForTimeout(100);
    check("Review is disabled until something is ticked", await dlg(p).locator('button:has-text("Tick expenses first")').isDisabled());
    await rowBox(p, "Lunch with team").check();
    check("…and until an envelope is chosen", await dlg(p).locator('button:has-text("Choose an envelope")').isDisabled());
    check("the count is shown", /Move 1 expense to/.test(T(await dlg(p).innerText())));
    await dlg(p).locator('label:has(input[name=kc-envelope]):has-text("Wants")').click();
    await dlg(p).getByRole("button", { name: "Review 1 expense" }).click(); await p.waitForTimeout(100);
    check("a confirmation names the change and the expense", /Move 1 expense to Wants\? Lunch with team · Oct 24, 2026/.test(T(await dlg(p).innerText())));
    await dlg(p).getByRole("button", { name: "Move 1 to Wants" }).click(); await p.waitForTimeout(500);
    check("single classification closes with a clear message", !(await dlg(p).count()) && /1 expense moved to Wants\. Balances and totals are unchanged\./.test(await status(p)));
    let t = T(await p.locator("main").innerText());
    check("unclassified drops by ₱385.00 and Wants rises", /Not yet classified ₱640\.00/.test(t) && /Spent ₱4,249\.00/.test(await text(p, "envelope-wants-title")));
    check("total expenses are unchanged", /Total expenses .*₱27,127\.40/.test(t));
    eq("balances are unchanged", await accountsText(p), money);

    await openClassify(p);
    await dlg(p).locator('label:has(input[name=kc-show]):has-text("All expenses")').click();
    await rowBox(p, "Coffee and pandesal").check(); await rowBox(p, "Online order").check(); await rowBox(p, "Movie night").check();
    await dlg(p).locator('label:has(input[name=kc-envelope]):has-text("Culture")').click();
    await dlg(p).getByRole("button", { name: "Review 3 expenses" }).click();
    await dlg(p).getByRole("button", { name: "Move 3 to Culture" }).click(); await p.waitForTimeout(600);
    check("three at once", /3 expenses moved to Culture/.test(await status(p)));
    check("Culture includes them now (₱1,800.00 + ₱215.00 + ₱2,399.00 + ₱640.00)", /Spent ₱5,054\.00/.test(await text(p, "envelope-culture-title")), await text(p, "envelope-culture-title"));
    await openClassify(p);
    await dlg(p).locator('label:has(input[name=kc-show]):has-text("All expenses")').click();
    await rowBox(p, "Movie night").check();
    await dlg(p).locator('label:has(input[name=kc-envelope]):has-text("Not classified")').click();
    await dlg(p).getByRole("button", { name: "Review 1 expense" }).click();
    check("clearing is confirmed in its own words", /Clear the envelope on 1 expense\?/.test(T(await dlg(p).innerText())));
    await dlg(p).getByRole("button", { name: "Clear 1" }).click(); await p.waitForTimeout(500);
    check("clearing works", /1 expense cleared/.test(await status(p)) && /Not yet classified ₱640\.00/.test(T(await p.locator("main").innerText())));
    await nav(p, "Activity");
    check("Activity still shows every entry with its amount", /Movie night/.test(T(await p.locator("main").innerText())) && /−₱640\.00/.test(T(await p.locator("main").innerText())));
    await p.context().close();

    const q = await open(375, { query: "?demo=partial" });
    await openClassify(q);
    await dlg(q).locator("label:has-text('Tick all 2 shown') input").check();
    await dlg(q).locator('label:has(input[name=kc-envelope]):has-text("Needs")').click();
    await dlg(q).getByRole("button", { name: "Review 2 expenses" }).click();
    await dlg(q).getByRole("button", { name: "Move 2 to Needs" }).click(); await q.waitForTimeout(600);
    const d2 = T(await dlg(q).innerText());
    check("a partly failed batch is reported honestly", /1 of 2 expenses moved to Needs\. 1 couldn't be saved and is still ticked\./.test(d2), d2.slice(0, 260));
    eq("the failed one stays ticked; the saved one leaves the list", `${await dlg(q).locator("li input[type=checkbox]").count()}|${await dlg(q).locator("li input[type=checkbox]:checked").count()}`, "1|1");
    check("the dashboard behind already shows the saved one", /Not yet classified ₱/.test(T(await q.locator("main").innerText())));
    await dlg(q).locator('label:has(input[name=kc-envelope]):has-text("Needs")').click();
    await dlg(q).getByRole("button", { name: "Review 1 expense" }).click();
    await dlg(q).getByRole("button", { name: "Move 1 to Needs" }).click(); await q.waitForTimeout(500);
    check("trying again finishes it", !(await dlg(q).count()) && /Not yet classified ₱0\.00/.test(T(await q.locator("main").innerText())));
    await q.context().close();

    const s = await open(375, { query: "?demo=huge" });
    await openClassify(s);
    const d3 = T(await dlg(s).innerText());
    check("a very long month says only the latest 200 are listed and more may exist", /Showing the latest 200 entries of October 2026\. More may exist\./.test(d3), d3.slice(-300));
    check("nothing is ticked automatically", (await dlg(s).locator("li input[type=checkbox]:checked").count()) === 0);
    await s.context().close();
  });

  group = "Category suggestions";
  await safe(async () => {
    const p = await open(375);
    check("the card lists current suggestions", /Transportation: Needs · Groceries: Needs · Bills: Needs · Shopping: Wants/.test(await text(p, "kakeibo-suggestions-title")));
    await p.getByRole("button", { name: "Edit suggestions" }).click(); await p.waitForTimeout(250);
    const d = T(await dlg(p).innerText());
    check("it says suggestions never change saved expenses", /Changing a suggestion never changes expenses you’ve already saved\./.test(d));
    check("only expense categories are listed", !/Salary|Freelance/.test(d) && (await dlg(p).locator("select").count()) === 6);
    eq("each has the four envelopes and No suggestion", await dlg(p).locator("select").first().locator("option").allInnerTexts().then(a => a.join("|")), "Needs|Wants|Culture|Unexpected|No suggestion");
    check("Save waits for a change", await dlg(p).getByRole("button", { name: "No changes" }).isDisabled());
    const before = await text(p, "envelope-needs-title");
    await dlg(p).getByLabel("Food").selectOption("wants");
    await dlg(p).getByLabel("Groceries").selectOption("");
    await dlg(p).getByRole("button", { name: "Save 2 changes" }).click(); await p.waitForTimeout(400);
    check("saved, with a reminder that history is kept", !(await dlg(p).count()) && /Suggestions saved\. Expenses you already saved keep their envelopes\./.test(await status(p)));
    check("the card updates", /Food: Wants/.test(await text(p, "kakeibo-suggestions-title")) && !/Groceries: Needs/.test(await text(p, "kakeibo-suggestions-title")));
    eq("saved expenses keep their envelopes", await text(p, "envelope-needs-title"), before);
    await p.locator('nav[aria-label="Main"] >> visible=true >> button[aria-label^="Add transaction"]').last().click(); await p.waitForTimeout(200);
    await dlg(p).locator('label:has(input[name=qa-category]):has-text("Food")').click();
    eq("Quick Add follows the new Food suggestion", await dlg(p).locator("input[name=qa-envelope]:checked").getAttribute("value"), "wants");
    await dlg(p).locator('label:has(input[name=qa-category]):has-text("Groceries")').click();
    eq("…and Groceries no longer suggests one", await dlg(p).locator("input[name=qa-envelope]:checked").getAttribute("value"), "");
    await p.context().close();
  });

  group = "Mindful prompts";
  await safe(async () => {
    const p = await open(375);
    await p.locator('nav[aria-label="Main"] >> visible=true >> button[aria-label^="Add transaction"]').last().click(); await p.waitForTimeout(200);
    const details = dlg(p).locator("details");
    check("an expense has a closed 'Pause before buying?' disclosure", (await details.count()) === 1 && !(await details.evaluate(d => d.open)));
    await details.locator("summary").click();
    check("it opens to three short questions and says nothing is saved", /Is this something I need, or something I want\? Does it fit what matters to me this month\? Could I wait a few days before buying it\? Just something to think about\. Nothing here is saved\./.test(T(await details.innerText())));
    for (const kind of ["Income", "Pay card", "Transfer"]) {
      await dlg(p).locator(`label:has(input[name=qa-kind]):has-text("${kind}")`).click();
      eq(`${kind}: no prompts`, await dlg(p).locator("details").count(), 0);
    }
    await dlg(p).locator('label:has(input[name=qa-kind]):has-text("Expense")').click();
    await p.fill("#qa-amount", "50"); await p.selectOption("#qa-account", "1"); await dlg(p).locator('label:has(input[name=qa-category]):has-text("Food")').click();
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(400);
    check("the prompts never block saving", !(await dlg(p).count()));
    await p.context().close();
  });

  group = "Keyboard and reduced motion";
  await safe(async () => {
    const p = await open(1440, { reducedMotion: "reduce" });
    await p.getByRole("button", { name: "Write reflection" }).focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(250);
    eq("Enter opens the reflection on its first field", await p.evaluate(() => document.activeElement?.id), "kr-saved");
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    eq("Escape returns focus to the opener", await p.evaluate(() => document.activeElement?.innerText.trim()), "Write reflection");
    await openClassify(p);
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    eq("the classify dialog closes with Escape and focus returns", await p.evaluate(() => document.activeElement?.innerText.trim()), "Classify expenses");
    eq("nothing animates with reduced motion", await p.evaluate(() => document.getAnimations().length), 0);
    await p.context().close();
  });

  check("no console errors or warnings", errors.length === 0, errors.slice(0, 5).join(" | "));
  check("no requests leave the app's origin", external.length === 0, external.slice(0, 3).join(" "));
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} [${r.group}] ${r.name}${r.ok ? "" : ` — ${r.detail}`}`);
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (process.env.RESULTS_JSON) fs.writeFileSync(process.env.RESULTS_JSON, JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
