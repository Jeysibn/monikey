/* Browser acceptance against a real, disposable MoniKey stack (built React app → Nginx → FastAPI → PostgreSQL).
 *
 * Never point this at a real MoniKey. It refuses any base URL that is not http://127.0.0.1:<port>/, refuses
 * port 8080 (the default Compose port, which may be someone's working copy), and refuses to seed unless the
 * database starts with no accounts. Every record it writes is fictional ("QA …" / "Fictional …").
 *
 * Usage (see docs/quality/KAKEIBO_BROWSER_ACCEPTANCE.md for the full, isolated Compose recipe):
 *   QA_BASE_URL=http://127.0.0.1:18491/ node scripts/verify-real-api.cjs seed
 *   # mark August 2026 as a pre-migration-006 row, inside the disposable database only:
 *   #   UPDATE kakeibo_month_plans SET plan_presence = NULL WHERE month = '2026-08-01';
 *   QA_BASE_URL=http://127.0.0.1:18491/ SHOTS_DIR=… RESULTS_JSON=… node scripts/verify-real-api.cjs browser
 *
 * Uses playwright-core and a Chromium that already exist on this machine (nothing is installed).
 * The browser phase assumes the app's "today" is in November 2026 (Asia/Manila), when this run was recorded.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");

const RAW = process.env.QA_BASE_URL || "";
const m = /^http:\/\/127\.0\.0\.1:(\d{2,5})\/$/.exec(RAW);
if (!m || m[1] === "8080") {
  console.error("Refusing to run: set QA_BASE_URL to http://127.0.0.1:<dedicated port>/ of a disposable stack (not 8080).");
  process.exit(2);
}
const BASE = RAW;
const API = BASE + "api";
const MODE = process.argv[2];
const SHOTS = process.env.SHOTS_DIR || "";

async function api(method, route, body, expected) {
  const res = await fetch(API + route, {
    method,
    redirect: "error",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (expected !== undefined && res.status !== expected) throw new Error(`${method} ${route}: expected ${expected}, got ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/* ------------------------------------------------------------------ seed */
async function seed() {
  if ((await api("GET", "/health/ready", undefined, 200)).status !== "ok") throw new Error("API not ready");
  const existing = await api("GET", "/accounts", undefined, 200);
  if (existing.length !== 0) {
    console.error(`Refusing to seed: the database already has ${existing.length} account(s). Use a fresh disposable stack.`);
    process.exit(3);
  }
  const acct = (name, type, extra) => api("POST", "/accounts", { name, type, opening_balance: "0.00", opening_debt: "0.00", credit_limit: null, ...extra }, 201);
  const wallet = await acct("QA Wallet", "cash", { opening_balance: "5000.00" });
  const bank = await acct("QA Bank", "bank", { opening_balance: "40000.00" });
  const card = await acct("QA Card", "credit_card", { opening_debt: "2000.00", credit_limit: "20000.00" });
  const cats = await api("GET", "/categories", undefined, 200);
  const cat = (name, type) => cats.find(c => c.name === name && c.type === type).id;
  const tx = (account, category, amount, day, note, envelope) =>
    api("POST", "/transactions", { account_id: account.id, category_id: category, amount, transaction_date: day, note, ...(envelope === undefined ? {} : { kakeibo_envelope: envelope }) }, 201);

  await tx(bank, cat("Salary", "income"), "30000.00", "2026-10-01", "Fictional salary");
  await tx(bank, cat("Groceries", "expense"), "1250.00", "2026-10-05", "Fictional groceries", "needs");
  await tx(wallet, cat("Food", "expense"), "480.00", "2026-10-12", "Fictional lunch");
  await tx(card, cat("Shopping", "expense"), "2100.00", "2026-10-20", "Fictional headphones", "wants");
  await tx(wallet, cat("Food", "expense"), "350.00", "2026-10-28", "Fictional dinner");
  await tx(bank, cat("Bills", "expense"), "1800.00", "2026-10-31", "Fictional internet bill");
  await tx(wallet, cat("Food", "expense"), "200.00", "2025-12-30", "Fictional year-end snack");
  await tx(wallet, cat("Food", "expense"), "150.00", "2026-01-02", "Fictional new-year coffee");
  await api("POST", "/credit-card-payments", { source_account_id: bank.id, card_account_id: card.id, amount: "1000.00", payment_date: "2026-10-25", note: "Fictional card payment" }, 201);
  await api("POST", "/account-transfers", { source_account_id: bank.id, destination_account_id: wallet.id, amount: "2000.00", transfer_date: "2026-10-26", note: "Fictional transfer" }, 201);

  // July 2026: more expenses than the classification list loads (it stops at 1,000).
  for (let i = 0; i < 1005; i++) await tx(wallet, cat("Other", "expense"), "1.00", `2026-07-${String(1 + (i % 28)).padStart(2, "0")}`, `Fictional bulk ${i + 1}`);

  // August 2026: a plan saved through the API, which the operator then marks as pre-006 (plan_presence NULL).
  const zero = Object.fromEntries(["planned_income", "allocated_starting_funds", "savings_target", "prior_period_debt_reserve", "needs_limit", "wants_limit", "culture_limit", "unexpected_limit"].map(k => [k, "0.00"]));
  await api("PUT", "/kakeibo/months/2026-08", { ...zero, needs_limit: "3000.00", monthly_intention: null }, 200);
  console.log("SEEDED 3 accounts, 1,013 transactions, 1 card payment, 1 transfer, an August plan (fictional).");
}

/* ------------------------------------------------------------------ browser */
async function browserRun() {
  const { chromium, executablePath: CHROME } = require("./browser-runtime.cjs");
  const results = []; let group = "";
  const check = (name, ok, detail = "") => results.push({ group, name, ok: !!ok, detail: String(detail) });
  const eq = (name, a, e) => check(name, a === e, `got ${JSON.stringify(a)}${a === e ? "" : ` expected ${JSON.stringify(e)}`}`);
  const errors = [], external = [], failures = [];
  const expectedFailures = []; // requests this run breaks on purpose
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-gpu"] });
  const version = browser.version();
  const safe = async fn => { try { await settle(); await fn(); } catch (e) { const lines = String(e.message).split("\n"); check("section aborted: " + lines[0].slice(0, 160) + " " + (lines.find(l => /waiting for/.test(l)) || "").trim().slice(0, 200), false); } };

  let current = null; // the page a section works on; a section that aborts must not leave a dialog open for the next
  const settle = async () => { for (let i = 0; current && i < 3 && await current.locator('[role="dialog"]').count(); i++) { await current.keyboard.press("Escape"); await current.waitForTimeout(300); const close = current.locator('[role="dialog"] button:has-text("Close"), [role="dialog"] button:has-text("Cancel")').first(); if (await close.count()) await close.click().catch(() => {}); await current.waitForTimeout(200); } };
  async function open(width, { height = 900, view = "Overview" } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}: ${e.message}`));
    page.on("console", msg => {
      if (msg.type() !== "error" && msg.type() !== "warning") return;
      const t = msg.text();
      if (/Failed to load resource/.test(t) && expectedFailures.length) return; // the browser's own line for a request broken on purpose
      errors.push(`console.${msg.type()}@${width}: ${t.slice(0, 160)}`);
    });
    page.on("request", r => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith("data:")) external.push(u); });
    page.on("response", r => { if (r.status() >= 400 && !expectedFailures.some(f => f(r))) failures.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "/")}`); });
    page.on("requestfailed", r => { if (!expectedFailures.some(f => f(r))) failures.push(`failed ${r.method()} ${r.url().replace(BASE, "/")}: ${r.failure()?.errorText}`); });
    await page.goto(BASE); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500);
    page.big = width >= 768;
    if (view !== "Overview") await nav(page, view);
    return page;
  }
  const nav = async (p, name) => { await p.locator(`nav[aria-label="Main"] >> visible=true >> button:has-text("${name}")`).first().click(); await p.waitForTimeout(400); };
  const T = s => s.replace(/\s+/g, " ").trim();
  const dlg = p => p.locator('[role="dialog"]');
  const dText = async p => T(await dlg(p).innerText());
  const region = (p, id) => p.locator(`[aria-labelledby="${id}"]`).first();
  const text = async (p, id) => T(await region(p, id).innerText());
  const main = async p => T(await p.locator("main").innerText());
  const status = p => p.locator('[role=status][aria-live=polite]').first().innerText().then(T);
  const shot = (p, name, fullPage = true) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage }) : null;
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const month = async (p, value) => { await p.selectOption("#kakeibo-month", value); await p.waitForTimeout(600); };
  const reload = async p => { await p.reload(); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600); };
  const openAdd = async p => { await (p.big ? p.locator('main button:has-text("Add transaction"):visible').first() : p.locator('nav[aria-label="Main"] >> visible=true >> button[aria-label^="Add transaction"]').last()).click(); await p.waitForTimeout(250); };
  const chip = (p, name) => dlg(p).locator(`label:has(input[name=qa-category]):has-text("${name}")`);
  const kind = (p, value) => dlg(p).locator(`label:has(input[name=qa-kind][value=${value}])`).click();
  const envelopeChoice = (p, label) => dlg(p).locator(`label:has(input[name=qa-envelope]):has-text("${label}")`).click();
  const checkedEnvelope = p => dlg(p).locator("input[name=qa-envelope]:checked").getAttribute("value");
  const submit = async p => { await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(700); };
  const openClassify = async p => { await p.getByRole("button", { name: "Classify expenses" }).click(); await p.waitForTimeout(700); };
  const rowBox = (p, title) => dlg(p).locator(`li:has-text("${title}") input[type=checkbox]`);
  const peso = s => "₱" + Number(s).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const accountsByName = async () => Object.fromEntries((await api("GET", "/accounts")).map(a => [a.name, a]));
  const ledger = async monthValue => (await api("GET", `/transactions?month=${monthValue}`)).map(({ kakeibo_envelope: _e, updated_at: _u, ...rest }) => rest);
  const txByNote = async (monthValue, note) => (await api("GET", `/transactions?month=${monthValue}`)).find(t => t.note === note);
  const report = monthValue => api("GET", `/kakeibo/months/${monthValue}/report`);
  const noBadNumbers = async (p, where) => { const t = await main(p); check(`${where}: no NaN, Infinity or undefined anywhere`, !/NaN|Infinity|undefined/.test(t)); };
  const progressOk = p => p.evaluate(() => [...document.querySelectorAll("main [role=progressbar], main [aria-valuenow]")].every(e => {
    const now = e.getAttribute("aria-valuenow"); return now === null || Number.isFinite(Number(now));
  }));

  const positions0 = await accountsByName();
  const october0 = await ledger("2026-10");

  /* --------------------------------------------------------------- dashboard and plan states */
  group = "Kakeibo dashboard and plan states (real API)";
  const p = await open(1280); current = p;
  await safe(async () => {
    check("Overview loads the fictional accounts from the API", /QA Wallet|QA Bank|QA Card/.test(await main(p)) || /Net position/.test(await main(p)));
    await nav(p, "Kakeibo");
    eq("opens on the current month (November 2026)", await p.inputValue("#kakeibo-month"), "2026-11");
    const nov = await report("2026-11");
    check("API: November is not_saved with plan null", nov.plan_status === "not_saved" && nov.plan === null, JSON.stringify({ s: nov.plan_status, p: nov.plan }));
    check("UI: 'No plan for November 2026 yet' and 'Create plan'", /No plan for November 2026 yet/.test(await text(p, "kakeibo-plan-title")) && await p.locator('main button:has-text("Create plan")').count() === 1);
    await month(p, "2026-10");
    const oct = await report("2026-10");
    const t = await main(p);
    check("October actuals come from the server: income, total expenses, unclassified", t.includes(peso(oct.actual_income)) && t.includes(peso(oct.total_expenses)) && t.includes(peso(oct.unclassified_expenses)), `${oct.actual_income} / ${oct.total_expenses} / ${oct.unclassified_expenses}`);
    check("server: total ₱5,980.00, unclassified ₱2,630.00 (payment and transfer excluded)", oct.total_expenses === "5980.00" && oct.unclassified_expenses === "2630.00", `${oct.total_expenses} / ${oct.unclassified_expenses}`);
    check("Needs and Wants show the server's spending", /₱1,250\.00/.test(await text(p, "envelope-needs-title")) && /₱2,100\.00/.test(await text(p, "envelope-wants-title")));
    await shot(p, "real-kakeibo-october-no-plan-1280.png");

    await p.locator('main button:has-text("Create plan")').click(); await p.waitForTimeout(300);
    const fill = { "kp-income": "30,000", "kp-starting": "0", "kp-savings": "5,000", "kp-debt": "0", "kp-needs": "8,000", "kp-wants": "1,500", "kp-culture": "0", "kp-unexpected": "1,000", "kp-intention": "Fictional: cook at home more" };
    for (const [id, v] of Object.entries(fill)) await p.fill(`#${id}`, v);
    await submit(p);
    const saved = await report("2026-10");
    check("API: plan saved (plan_status saved) with the typed limits", saved.plan_status === "saved" && saved.plan.needs_limit === "8000.00" && saved.plan.wants_limit === "1500.00", JSON.stringify(saved.plan));
    check("UI: 'Your October 2026 plan' with Edit plan", /Your October 2026 plan/.test(await text(p, "kakeibo-plan-title")) && await p.locator('main button:has-text("Edit plan")').count() === 1);
    const wants = await text(p, "envelope-wants-title");
    check("Wants is over its limit: the server's negative remaining is shown", saved.envelopes.wants.remaining === "-600.00" && /600\.00/.test(wants), wants);
    const culture = await text(p, "envelope-culture-title");
    check("Culture has a ₱0.00 limit and no spending, shown without a broken bar", /₱0\.00/.test(culture) && await progressOk(p), culture);
    const planText = await text(p, "kakeibo-plan-title");
    check("planned income and actual income appear separately", /₱30,000\.00/.test(planText) && /Planned income|planned/i.test(planText), planText.slice(0, 300));
    check("the savings target is labelled a goal, not money saved", /Savings target/.test(planText) && /goal, not money already saved/i.test(planText));
    await noBadNumbers(p, "October with a plan");
    await shot(p, "real-kakeibo-october-plan-1280.png");

    await reload(p); await nav(p, "Kakeibo"); await month(p, "2026-10");
    check("after a reload the plan is still there", /Your October 2026 plan/.test(await text(p, "kakeibo-plan-title")));
    await p.locator('main button:has-text("Edit plan")').click(); await p.waitForTimeout(300);
    eq("the form opens with the saved needs limit", await p.inputValue("#kp-needs"), "8000.00");
    await p.fill("#kp-needs", "7,500"); await submit(p);
    eq("API: the edit is saved", (await report("2026-10")).plan.needs_limit, "7500.00");
    await reload(p); await nav(p, "Kakeibo"); await month(p, "2026-10");
    check("after a reload the edit is shown", /₱7,500\.00/.test(await text(p, "envelope-needs-title")), await text(p, "envelope-needs-title"));

    await month(p, "2026-09");
    await p.locator('main button:has-text("Create plan")').click(); await p.waitForTimeout(300);
    for (const id of ["kp-income", "kp-starting", "kp-savings", "kp-debt", "kp-needs", "kp-wants", "kp-culture", "kp-unexpected"]) await p.fill(`#${id}`, "0");
    await submit(p);
    const sep = await report("2026-09");
    check("API: an all-zero plan is a saved plan", sep.plan_status === "saved" && sep.plan !== null, sep.plan_status);
    check("UI: the all-zero plan reads as a plan (not 'No plan')", /Your September 2026 plan/.test(await text(p, "kakeibo-plan-title")) && await p.locator('main button:has-text("Edit plan")').count() === 1);
    check("all-zero limits: progress values stay finite", await progressOk(p));
    await noBadNumbers(p, "September all-zero plan");
    await shot(p, "real-kakeibo-zero-plan-1280.png");

    await month(p, "2026-08");
    const aug = await report("2026-08");
    eq("API: August (plan_presence NULL in the disposable DB) is legacy_unknown", aug.plan_status, "legacy_unknown");
    const augText = await text(p, "kakeibo-plan-title");
    check("UI: the legacy notice is shown with the preserved amounts", /predates plan tracking/.test(augText) && /₱3,000\.00/.test(await text(p, "envelope-needs-title")), augText.slice(0, 200));
    check("UI: the action reads 'Confirm plan'", await p.locator('main button:has-text("Confirm plan")').count() === 1);
    await shot(p, "real-kakeibo-legacy-plan-1280.png");
    await p.locator('main button:has-text("Confirm plan")').click(); await p.waitForTimeout(300);
    eq("confirm opens the saved amounts", await p.inputValue("#kp-needs"), "3000.00");
    await submit(p);
    eq("API: confirming saves it (saved)", (await report("2026-08")).plan_status, "saved");
    check("UI: the legacy notice is gone and it reads Edit plan", !/predates plan tracking/.test(await text(p, "kakeibo-plan-title")) && await p.locator('main button:has-text("Edit plan")').count() === 1);
  });

  /* --------------------------------------------------------------- suggestions and historical classification */
  group = "Category suggestions and historical classification (real API)";
  await safe(async () => {
    await month(p, "2026-10");
    const lunchBefore = await txByNote("2026-10", "Fictional lunch");
    await p.getByRole("button", { name: "Edit suggestions" }).click(); await p.waitForTimeout(400);
    check("only expense categories are offered", !/Salary|Freelance/.test(await dText(p)));
    await dlg(p).getByLabel("Food").selectOption("wants");
    await dlg(p).getByRole("button", { name: /Save 1 change/ }).click(); await p.waitForTimeout(700);
    const food = (await api("GET", "/categories")).find(c => c.name === "Food" && c.type === "expense");
    eq("API: Food suggests Wants", food.default_kakeibo_envelope, "wants");
    eq("API: the existing Food expense keeps no envelope", (await txByNote("2026-10", "Fictional lunch")).kakeibo_envelope, lunchBefore.kakeibo_envelope);

    await openClassify(p);
    const d = await dText(p);
    eq("Not classified lists the three unclassified October expenses", await dlg(p).locator("li input[type=checkbox]").count(), 3);
    check("income, card payments and transfers are never listed", !/Fictional salary|Fictional card payment|Fictional transfer/.test(d));
    await dlg(p).locator('label:has(input[name=kc-show]):has-text("All expenses")').click(); await p.waitForTimeout(150);
    eq("All expenses lists the five October expenses", await dlg(p).locator("li input[type=checkbox]").count(), 5);
    check("…still no income, payment or transfer", !/Fictional salary|Fictional card payment|Fictional transfer/.test(await dText(p)));
    await dlg(p).locator('label:has(input[name=kc-show]):has-text("Not classified")').click(); await p.waitForTimeout(150);
    await rowBox(p, "Fictional lunch").check();
    await dlg(p).locator('label:has(input[name=kc-envelope]):has-text("Needs")').click();
    await dlg(p).getByRole("button", { name: "Review 1 expense" }).click(); await p.waitForTimeout(150);
    check("an explicit confirmation names the change", /Move 1 expense to Needs\?/.test(await dText(p)));
    await dlg(p).getByRole("button", { name: "Move 1 to Needs" }).click(); await p.waitForTimeout(900);
    check("one expense: saved, with the unchanged-balances message", !(await dlg(p).count()) && /1 expense moved to Needs\. Balances and totals are unchanged\./.test(await status(p)), await status(p));
    eq("API: lunch is Needs", (await txByNote("2026-10", "Fictional lunch")).kakeibo_envelope, "needs");

    await openClassify(p);
    await rowBox(p, "Fictional dinner").check(); await rowBox(p, "Fictional internet bill").check();
    await dlg(p).locator('label:has(input[name=kc-envelope]):has-text("Unexpected")').click();
    await dlg(p).getByRole("button", { name: "Review 2 expenses" }).click();
    await dlg(p).getByRole("button", { name: "Move 2 to Unexpected" }).click(); await p.waitForTimeout(1200);
    check("several at once", /2 expenses moved to Unexpected/.test(await status(p)), await status(p));
    check("API: dinner and internet bill are Unexpected", (await txByNote("2026-10", "Fictional dinner")).kakeibo_envelope === "unexpected" && (await txByNote("2026-10", "Fictional internet bill")).kakeibo_envelope === "unexpected");

    await openClassify(p);
    await dlg(p).locator('label:has(input[name=kc-show]):has-text("All expenses")').click(); await p.waitForTimeout(150);
    await rowBox(p, "Fictional lunch").check();
    await dlg(p).locator('label:has(input[name=kc-envelope]):has-text("Not classified")').click();
    await dlg(p).getByRole("button", { name: "Review 1 expense" }).click();
    check("clearing has its own confirmation", /Clear the envelope on 1 expense\?/.test(await dText(p)));
    await dlg(p).getByRole("button", { name: "Clear 1" }).click(); await p.waitForTimeout(900);
    eq("API: lunch is cleared (null)", (await txByNote("2026-10", "Fictional lunch")).kakeibo_envelope, null);

    // Partial failure, for real: one of two ticked expenses is deleted on the server before the batch runs.
    await openClassify(p);
    await dlg(p).locator('label:has(input[name=kc-show]):has-text("All expenses")').click(); await p.waitForTimeout(150); // switching the filter clears ticks
    await rowBox(p, "Fictional lunch").check(); await rowBox(p, "Fictional groceries").check();
    await dlg(p).locator('label:has(input[name=kc-envelope]):has-text("Culture")').click();
    await dlg(p).getByRole("button", { name: "Review 2 expenses" }).click();
    const doomed = await txByNote("2026-10", "Fictional groceries");
    expectedFailures.push(r => (r.request ? r.request() : r).method() === "PATCH" && (r.url ? r.url() : "").includes(`/transactions/${doomed.id}/`));
    await api("DELETE", `/transactions/${doomed.id}`, undefined, 204);
    await dlg(p).getByRole("button", { name: "Move 2 to Culture" }).click(); await p.waitForTimeout(1200);
    const partial = await dText(p);
    check("a partly failed batch is reported honestly, the failed one still ticked", /1 of 2 expenses moved to Culture\. 1 couldn't be saved and is still ticked\./.test(partial), partial.slice(0, 300));
    eq("API: the surviving expense was saved", (await txByNote("2026-10", "Fictional lunch")).kakeibo_envelope, "culture");
    await shot(p, "real-classify-partial-1280.png", false);
    await dlg(p).locator("[data-slot=dialog-footer] button:has-text('Close')").click(); await p.waitForTimeout(300);
    // Put the deleted fixture back so later totals stay predictable (a fresh id; same fictional values).
    const cats = await api("GET", "/categories");
    const bank = (await accountsByName())["QA Bank"];
    await api("POST", "/transactions", { account_id: bank.id, category_id: cats.find(c => c.name === "Groceries" && c.type === "expense").id, amount: "1250.00", transaction_date: "2026-10-05", note: "Fictional groceries", kakeibo_envelope: "needs" }, 201);

    const october1 = await ledger("2026-10");
    const strip = rows => JSON.stringify(rows.filter(r => r.note !== "Fictional groceries").map(({ id: _i, created_at: _c, ...r }) => r).sort((a, b) => a.note.localeCompare(b.note)));
    check("classification changed no amount, account, category, date or note", strip(october1) === strip(october0));

    // The incomplete-list warning: July holds 1,005 expenses.
    await month(p, "2026-07");
    await openClassify(p);
    check("July: 'Showing the latest 200 … More may exist' with Load more", /Showing the latest 200 entries of July 2026\. More may exist\./.test(await dText(p)));
    for (let i = 0; i < 4; i++) { await dlg(p).getByRole("button", { name: "Load more" }).click(); await p.waitForTimeout(1500); }
    const stop = await dText(p);
    check("after loading 1,000: the list says it stops there and older ones may still need an envelope", /This list stops at the latest 1,000 entries of July 2026\. Older ones may still need an envelope\./.test(stop) && !(await dlg(p).getByRole("button", { name: "Load more" }).count()));
    await shot(p, "real-classify-incomplete-1280.png", false);
    await dlg(p).locator("[data-slot=dialog-footer] button:has-text('Close')").click(); await p.waitForTimeout(300);
  });

  /* --------------------------------------------------------------- weekly reflections */
  group = "Weekly reflections (real API)";
  await safe(async () => {
    await month(p, "2026-10");
    const weeks = await p.locator("#kakeibo-week option").evaluateAll(o => o.map(x => x.value));
    eq("October's weeks, newest first, Monday starts (one runs into November, one starts in September)", weeks.join(","), "2026-10-26,2026-10-19,2026-10-12,2026-10-05,2026-09-28");
    await p.selectOption("#kakeibo-week", "2026-10-26"); await p.waitForTimeout(600);
    const wk = await api("GET", "/kakeibo/weeks/2026-10-26");
    check("API: Oct 26 – Nov 1 is Monday–Sunday", wk.week_start === "2026-10-26" && wk.week_end === "2026-11-01", `${wk.week_start}..${wk.week_end}`);
    check("UI shows the server's week total (payment and transfer excluded)", (await text(p, "kakeibo-week-title")).includes(peso(wk.total_expenses)) && wk.total_expenses === "2150.00", wk.total_expenses);
    await p.getByRole("button", { name: "Write notes" }).click(); await p.waitForTimeout(300);
    await p.fill("#kw-surprise", "Fictional: the internet bill went up");
    await p.fill("#kw-worthwhile", "Fictional: dinner with family");
    await p.fill("#kw-next", "Fictional: pack lunch twice");
    // A failed save keeps what was typed (the PUT is aborted in the browser; the server never sees it).
    const weekPut = r => (r.request ? r.request() : r).method() === "PUT" && (r.url ? r.url() : "").includes("/api/kakeibo/weeks/");
    expectedFailures.push(weekPut);
    await p.route("**/api/kakeibo/weeks/**", route => route.request().method() === "PUT" ? route.abort("connectionfailed") : route.continue());
    await submit(p);
    check("failed save: the dialog stays open with a notice and every answer kept", await dlg(p).count() === 1 && /Couldn't save/.test(await dText(p)) && await p.inputValue("#kw-surprise") === "Fictional: the internet bill went up" && await p.inputValue("#kw-next") === "Fictional: pack lunch twice");
    await p.unroute("**/api/kakeibo/weeks/**"); expectedFailures.splice(expectedFailures.indexOf(weekPut), 1);
    await submit(p);
    let saved = (await api("GET", "/kakeibo/weeks/2026-10-26")).review;
    check("API: all three notes saved together", saved && saved.surprise_note === "Fictional: the internet bill went up" && saved.worthwhile_note === "Fictional: dinner with family" && saved.next_week_intention === "Fictional: pack lunch twice", JSON.stringify(saved));
    await reload(p); await nav(p, "Kakeibo"); await month(p, "2026-10"); await p.selectOption("#kakeibo-week", "2026-10-26"); await p.waitForTimeout(600);
    check("after a reload the notes are shown", /pack lunch twice/.test(await text(p, "kakeibo-week-title")));
    await p.getByRole("button", { name: "Edit notes" }).click(); await p.waitForTimeout(300);
    eq("the form opens with the saved answers", await p.inputValue("#kw-worthwhile"), "Fictional: dinner with family");
    await p.fill("#kw-worthwhile", ""); await p.fill("#kw-next", "Fictional: pack lunch three times");
    await submit(p);
    saved = (await api("GET", "/kakeibo/weeks/2026-10-26")).review;
    check("API: the cleared answer is null, the edited one changed, the untouched one kept", saved.worthwhile_note === null && saved.next_week_intention === "Fictional: pack lunch three times" && saved.surprise_note === "Fictional: the internet bill went up", JSON.stringify(saved));
    await shot(p, "real-weekly-1280.png");

    await month(p, "2026-01");
    const janWeeks = await p.locator("#kakeibo-week option").evaluateAll(o => o.map(x => `${x.value}=${x.textContent}`));
    check("January 2026 includes the week that starts in December 2025", janWeeks.some(w => w.startsWith("2025-12-29=Dec 29, 2025 – Jan 4, 2026")), janWeeks.join(" | "));
    await p.selectOption("#kakeibo-week", "2025-12-29"); await p.waitForTimeout(600);
    const ny = await api("GET", "/kakeibo/weeks/2025-12-29");
    check("the year-crossing week totals both years' expenses (₱200.00 + ₱150.00)", ny.total_expenses === "350.00" && (await text(p, "kakeibo-week-title")).includes("₱350.00"), ny.total_expenses);
    await p.getByRole("button", { name: "Write notes" }).click(); await p.waitForTimeout(300);
    await p.fill("#kw-next", "Fictional: start the year slowly"); await submit(p);
    eq("API: the year-crossing week saved under its Monday", (await api("GET", "/kakeibo/weeks/2025-12-29")).review?.next_week_intention, "Fictional: start the year slowly");
  });

  /* --------------------------------------------------------------- monthly reflections */
  group = "Monthly reflections (real API)";
  await safe(async () => {
    await month(p, "2026-11");
    await p.getByRole("button", { name: "Write reflection" }).click(); await p.waitForTimeout(300);
    check("no plan: the form says the reflection is stored separately", /November 2026 has no saved plan\. The reflection and its totals will be stored separately/.test(await dText(p)));
    await p.fill("#kr-saved", "0"); await p.fill("#kr-lesson", "Fictional: zero is an honest answer");
    await submit(p);
    const nov = await report("2026-11");
    check("API: review saved, the month still has no plan (not_saved, plan null)", nov.plan_status === "not_saved" && nov.plan === null && nov.review !== null, JSON.stringify({ s: nov.plan_status, p: nov.plan }));
    check("API: zero self-reported savings is kept as 0.00 and blank answers are null", nov.review.actual_saved_declared === "0.00" && nov.review.review_change === null && nov.review.review_lesson === "Fictional: zero is an honest answer", JSON.stringify(nov.review));
    check("UI: still 'No plan for November 2026 yet' with Create plan", /No plan for November 2026 yet/.test(await text(p, "kakeibo-plan-title")) && await p.locator('main button:has-text("Create plan")').count() === 1);
    check("UI: ₱0.00 is shown as the person's own figure", /₱0\.00 \(your own figure, not an account balance\)/.test(await text(p, "kakeibo-month-review-title")));

    await month(p, "2026-10");
    await p.getByRole("button", { name: "Write reflection" }).click(); await p.waitForTimeout(300);
    await p.fill("#kr-saved", "4,000"); await p.fill("#kr-change", "Fictional: fewer takeaway dinners");
    // A failed save keeps the reflection (the PUT is aborted in the browser; nothing reaches the server).
    const reviewPut = r => (r.request ? r.request() : r).method() === "PUT" && (r.url ? r.url() : "").includes("/review");
    expectedFailures.push(reviewPut);
    await p.route("**/api/kakeibo/months/*/review", route => route.abort("connectionfailed"));
    await submit(p);
    check("failed save: the form stays open, says so, and keeps every answer", await dlg(p).count() === 1 && /Couldn't save\. Check your connection and try again\. What you wrote is still here\./.test(await dText(p)) && await p.inputValue("#kr-change") === "Fictional: fewer takeaway dinners" && (await p.inputValue("#kr-saved")).replace(/,/g, "").startsWith("4000"));
    eq("API: nothing was saved by the failed attempt", (await report("2026-10")).review, null);
    await p.unroute("**/api/kakeibo/months/*/review"); expectedFailures.splice(expectedFailures.indexOf(reviewPut), 1);
    await submit(p);
    const first = await report("2026-10");
    const snap = first.review.review_actuals_snapshot;
    check("API: the plan is untouched by the review (still saved, needs 7,500)", first.plan_status === "saved" && first.plan.needs_limit === "7500.00");
    check("API: the server stored a snapshot of October's totals", snap && snap.total_expenses === first.total_expenses, JSON.stringify(snap));
    const card = await text(p, "kakeibo-month-review-title");
    check("UI: 'Totals when you saved it' shows the server's snapshot", /Totals when you saved it/.test(card) && card.includes(peso(snap.total_expenses)), card.slice(0, 300));
    check("UI: no 'changed' warning yet", !/has changed since this reflection was saved/.test(card));
    await shot(p, "real-monthly-1280.png");

    // A ledger edit after the review: the snapshot must stay as it was until Save reflection is pressed again.
    await nav(p, "Activity");
    await p.selectOption("#month", "2026-10").catch(() => {}); await p.waitForTimeout(600);
    await p.locator('button[aria-label^="Edit Fictional dinner"]').first().click(); await p.waitForTimeout(300);
    eq("the dinner opens for editing at ₱350.00", await p.inputValue("#qa-amount"), "350.00");
    await p.fill("#qa-amount", "400"); await submit(p);
    eq("API: the dinner is now ₱400.00", (await txByNote("2026-10", "Fictional dinner")).amount, "400.00");
    eq("API: the dinner kept its envelope through the edit", (await txByNote("2026-10", "Fictional dinner")).kakeibo_envelope, "unexpected");
    await nav(p, "Kakeibo"); await month(p, "2026-10");
    const after = await report("2026-10");
    check("API: actuals_changed_since_review is true, snapshot unchanged", after.actuals_changed_since_review === true && JSON.stringify(after.review.review_actuals_snapshot) === JSON.stringify(snap));
    const warned = await text(p, "kakeibo-month-review-title");
    check("UI: the changed warning appears and the stored totals are the old ones", /has changed since this reflection was saved/.test(warned) && warned.includes(peso(snap.total_expenses)), warned.slice(0, 300));
    await shot(p, "real-monthly-changed-1280.png");
    await p.getByRole("button", { name: "Edit reflection" }).click(); await p.waitForTimeout(300);
    check("the form warns that saving replaces the stored totals", /Saving again replaces the totals stored on/.test(await dText(p)));
    eq("…and opens with the saved self-reported savings", await p.inputValue("#kr-saved"), "4000.00");
    await submit(p);
    const refreshed = await report("2026-10");
    check("API: only the explicit save refreshed the snapshot (+₱50.00), and the warning cleared", refreshed.actuals_changed_since_review === false && Number(refreshed.review.review_actuals_snapshot.total_expenses) === Number(snap.total_expenses) + 50, refreshed.review.review_actuals_snapshot.total_expenses);
    check("UI: no warning after saving again", !/has changed since this reflection was saved/.test(await text(p, "kakeibo-month-review-title")));
  });

  /* --------------------------------------------------------------- metadata never moves money */
  group = "Kakeibo metadata never changes balances (real API)";
  await safe(async () => {
    const now = await accountsByName();
    // Bank: the groceries row deleted and re-added cancel out. Wallet: the dinner edit (+₱50.00) is a ledger change, checked on its own.
    const pick = a => ({ balance: a.balance ?? null, owed: a.owed ?? null, credit: a.credit ?? null });
    check("API accounts are readable for the comparison", Object.keys(now).length === 3, Object.keys(now).join(","));
    check("QA Card debt is unchanged by plans, suggestions, classifications and reflections", JSON.stringify(pick(now["QA Card"])) === JSON.stringify(pick(positions0["QA Card"])), `${JSON.stringify(pick(positions0["QA Card"]))} → ${JSON.stringify(pick(now["QA Card"]))}`);
    check("QA Wallet changed only by the ₱50.00 dinner edit", Math.round((Number(positions0["QA Wallet"].balance) - Number(now["QA Wallet"].balance)) * 100) === 5000, `${positions0["QA Wallet"].balance} → ${now["QA Wallet"].balance}`);
    check("QA Bank is unchanged (the deleted and re-added groceries cancel out)", JSON.stringify(pick(now["QA Bank"])) === JSON.stringify(pick(positions0["QA Bank"])), `${JSON.stringify(pick(positions0["QA Bank"]))} → ${JSON.stringify(pick(now["QA Bank"]))}`);
  });

  /* --------------------------------------------------------------- Quick Add and the ledger */
  group = "Quick Add, editing and deleting (real API)";
  await safe(async () => {
    await nav(p, "Overview");
    const base = await accountsByName();
    const add = async (setup, label) => { await openAdd(p); await setup(); await submit(p); check(`${label}: dialog closed after saving`, await dlg(p).count() === 0, await dlg(p).count() ? await dText(p) : ""); };
    const fillCommon = async ({ amount, account, note, date = "2026-11-02" }) => {
      await p.fill("#qa-amount", amount);
      if (account) await p.selectOption("#qa-account", { label: account }).catch(async () => p.selectOption("#qa-account", String(base[account].id)));
      await p.fill("#qa-note", note); await p.fill("#qa-date", date);
    };
    const expense = (amount, account, category, envelopeLabel, note) => add(async () => {
      await kind(p, "expense"); await fillCommon({ amount, account, note }); await chip(p, category).click();
      if (envelopeLabel) await envelopeChoice(p, envelopeLabel);
    }, `expense ${note}`);

    await expense("120", "QA Wallet", "Transportation", "Needs", "QA jeepney fare");
    await expense("800", "QA Card", "Shopping", "Wants", "QA card purchase");
    await expense("250", "QA Wallet", "Shopping", "Culture", "QA museum ticket");
    await expense("900", "QA Bank", "Bills", "Unexpected", "QA phone repair");
    await expense("60", "QA Wallet", "Groceries", "Not sure yet", "QA snack");
    const env = async note => (await txByNote("2026-11", note))?.kakeibo_envelope;
    check("API: all five envelope choices were stored (needs, wants, culture, unexpected, null)",
      await env("QA jeepney fare") === "needs" && await env("QA card purchase") === "wants" && await env("QA museum ticket") === "culture" && await env("QA phone repair") === "unexpected" && await env("QA snack") === null,
      JSON.stringify(await Promise.all(["QA jeepney fare", "QA card purchase", "QA museum ticket", "QA phone repair", "QA snack"].map(env))));

    await openAdd(p); await kind(p, "income");
    check("income has no envelope control", await dlg(p).locator("input[name=qa-envelope]").count() === 0);
    await fillCommon({ amount: "1,500", account: "QA Bank", note: "QA freelance" }); await chip(p, "Freelance").click(); await submit(p);
    const inc = await txByNote("2026-11", "QA freelance");
    check("API: income saved without an envelope", inc && inc.kakeibo_envelope === null && inc.amount === "1500.00");

    await openAdd(p); await kind(p, "payment");
    check("a card payment has no envelope control", await dlg(p).locator("input[name=qa-envelope]").count() === 0);
    await p.fill("#qa-amount", "500"); await p.selectOption("#qa-account", String(base["QA Bank"].id)); await p.selectOption("#qa-card", String(base["QA Card"].id)); await p.fill("#qa-note", "QA card payment"); await p.fill("#qa-date", "2026-11-02");
    await submit(p);
    check("API: the payment exists and is not a transaction", (await api("GET", "/credit-card-payments?month=2026-11")).some(r => r.note === "QA card payment") && !(await txByNote("2026-11", "QA card payment")));

    await openAdd(p); await kind(p, "transfer");
    check("a transfer has no envelope control", await dlg(p).locator("input[name=qa-envelope]").count() === 0);
    await p.fill("#qa-amount", "300"); await p.selectOption("#qa-account", String(base["QA Bank"].id)); await p.selectOption("#qa-destination", String(base["QA Wallet"].id)); await p.fill("#qa-note", "QA transfer"); await p.fill("#qa-date", "2026-11-02");
    await submit(p);
    check("API: the transfer exists and is not a transaction", (await api("GET", "/account-transfers?month=2026-11")).some(r => r.note === "QA transfer") && !(await txByNote("2026-11", "QA transfer")));

    // Suggestion, then a deliberate override that a later category change must not overwrite.
    await openAdd(p); await kind(p, "expense"); await chip(p, "Food").click();
    eq("Food's new suggestion (Wants) is preselected", await checkedEnvelope(p), "wants");
    await envelopeChoice(p, "Culture"); await chip(p, "Groceries").click();
    eq("after a manual choice, changing the category keeps it", await checkedEnvelope(p), "culture");
    await fillCommon({ amount: "75", account: "QA Wallet", note: "QA override check" }); await submit(p);
    eq("API: the deliberate choice was saved", await env("QA override check"), "culture");

    const nowAcc = await accountsByName();
    const n = (a, k) => Number(a[k]);
    const balKey = "balance", debtKey = "owed";
    check("API: QA Wallet fell by 120 + 250 + 60 + 75 and rose by the 300 transfer", Math.round((n(base["QA Wallet"], balKey) - n(nowAcc["QA Wallet"], balKey)) * 100) === (120 + 250 + 60 + 75 - 300) * 100, `${balKey}: ${base["QA Wallet"][balKey]} → ${nowAcc["QA Wallet"][balKey]}`);
    check("API: QA Card debt rose by the 800 purchase and fell by the 500 payment", Math.round((n(nowAcc["QA Card"], debtKey) - n(base["QA Card"], debtKey)) * 100) === 300 * 100, `${debtKey}: ${base["QA Card"][debtKey]} → ${nowAcc["QA Card"][debtKey]}`);
    await nav(p, "Accounts"); await p.locator('[role=group][aria-label="Account display"] button:has-text("List")').click(); await p.waitForTimeout(300);
    const acc = await main(p);
    check("UI Accounts shows the server's balances", acc.includes(peso(nowAcc["QA Wallet"][balKey])) && acc.includes(peso(nowAcc["QA Card"][debtKey])), acc.slice(0, 300));
    await shot(p, "real-accounts-list-1280.png");

    await nav(p, "Activity"); await p.selectOption("#month", "2026-11"); await p.waitForTimeout(600); // the month picked earlier is shared
    await p.locator('button[aria-label^="Edit QA snack"]').first().click(); await p.waitForTimeout(300);
    await dlg(p).locator("#qa-delete").click(); await p.waitForTimeout(200);
    await dlg(p).locator("button:has-text('Delete expense')").click(); await p.waitForTimeout(700);
    check("API: the deleted expense is gone", !(await txByNote("2026-11", "QA snack")));
    await reload(p); await nav(p, "Activity");
    check("after a reload Activity no longer lists it, and the rest persisted", !/QA snack/.test(await main(p)) && /QA phone repair/.test(await main(p)));
  });
  await p.context().close(); current = null;

  /* --------------------------------------------------------------- phones, against the real API */
  group = "Phone widths against the real API";
  await safe(async () => {
    for (const w of [320, 375]) {
      const q = await open(w, { view: "Kakeibo" }); current = q;
      await month(q, "2026-10");
      eq(`${w}px Kakeibo: no horizontal scroll`, await overflow(q), 0);
      await shot(q, `real-kakeibo-october-${w}.png`);
      await q.getByRole("button", { name: "Edit reflection" }).click(); await q.waitForTimeout(300);
      const r = await q.evaluate(() => { const d = document.querySelector("[role=dialog]").getBoundingClientRect(); const f = document.querySelector("[role=dialog] [data-slot=dialog-footer]").getBoundingClientRect(); return { fits: d.width <= innerWidth && d.height <= innerHeight + 1, footer: f.bottom <= innerHeight + 1 && f.top >= 0 }; });
      check(`${w}px: the reflection dialog fits and Save/Cancel stay on screen`, r.fits && r.footer, JSON.stringify(r));
      await shot(q, `real-monthly-dialog-${w}.png`, false);
      await q.keyboard.press("Escape"); await q.waitForTimeout(200);
      await q.context().close();
    }
  });

  check("no request left the app's own origin", external.length === 0, external.slice(0, 3).join(", ") || "all same-origin");
  check("no unexpected HTTP errors or failed requests", failures.length === 0, failures.slice(0, 5).join(" || ") || "none");
  check("no console errors or warnings, no uncaught exceptions", errors.length === 0, errors.slice(0, 5).join(" || ") || "none");
  await browser.close();

  const pass = results.filter(r => r.ok).length; let g = "";
  console.log(`Browser: Chromium ${version}  Base: ${BASE}`);
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-real-api-verify.json"), JSON.stringify({ browser: version, base: BASE, results }, null, 1));
  process.exit(pass === results.length ? 0 : 1);
}

if (MODE === "seed") seed().catch(e => { console.error(e); process.exit(1); });
else if (MODE === "browser") browserRun().catch(e => { console.error(e); process.exit(1); });
else { console.error("Usage: verify-real-api.cjs seed|browser"); process.exit(2); }
