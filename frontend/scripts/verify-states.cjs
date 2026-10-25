/* Milestone 4.9 browser verification of loading, error, slow and refused states (read-only).
 * Run (with `npx vite --port 4291` serving the app):  BASE_URL=http://localhost:4291/ node scripts/verify-states.cjs
 * Uses playwright-core and a Chromium that already exist on this machine (nothing is installed).
 * Prints one PASS/FAIL line per check; RESULTS_JSON receives a JSON copy; SHOTS_DIR receives screenshots.
 * Demos used: ?demo=load-error (the first read of each kind fails once), flaky (the second fails once),
 * offline (every read and write fails), slow (reads take 1.5s, writes 16s), invalid (the first write is refused, 422). */
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
  async function open(width, { query = "", height = 900, view = "Overview", wait = true } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}${query}: ${e.message}`));
    // A failed read is the point of these demos: the browser logs nothing for a rejected promise we handle, so any console output is a problem.
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}@${width}${query}: ${m.text().slice(0, 140)}`); });
    page.on("request", r => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith("data:")) external.push(u); });
    await page.goto(BASE + query); await page.evaluate(() => document.fonts.ready);
    page.W = width; page.big = width >= 768;
    if (wait) await page.waitForTimeout(300);
    if (view !== "Overview") await nav(page, view);
    return page;
  }
  const nav = async (p, name) => { await p.locator(`nav[aria-label="Main"] >> visible=true >> button:has-text("${name}")`).first().click(); await p.waitForTimeout(150); };
  const T = s => s.replace(/\s+/g, " ").trim();
  const mainText = p => p.evaluate(() => document.querySelector("main").innerText.replace(/\s+/g, " ").trim());
  const alerts = p => p.evaluate(() => [...document.querySelectorAll("main [role=alert]")].filter(e => e.getBoundingClientRect().width > 0).map(e => e.innerText.replace(/\s+/g, " ").trim()));
  const addBtn = p => p.big ? p.locator('main button:has-text("Add transaction"):visible').first() : p.locator('nav[aria-label="Main"] >> visible=true >> button[aria-label^="Add transaction"]').last();
  const dlg = p => p.locator('[role="dialog"]');
  const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name), fullPage: false }) : null;
  const retry = (p, what) => p.locator(`button[aria-label="Retry loading ${what}"]`);

  group = "?demo=load-error: the first read of each kind fails once (Overview)";
  await safe(async () => {
    const p = await open(375, { query: "?demo=load-error" });
    const a = await alerts(p);
    eq("four blocks failed on their own: summary, credit cards, recent activity, and the categories (a banner)", a.length, 4);
    check("the summary block says so, with no 'Last updated' (nothing ever loaded)", a.includes("Couldn't load your summary. Retry"), a.join(" | "));
    check("credit cards, recent activity and the categories say so too", a.includes("Couldn't load your credit cards. Retry") && a.includes("Couldn't load recent activity. Retry") && a.includes("Couldn't load the categories. Retry"));
    check("'This month' explains instead of showing zeros", /Not available until your summary loads\./.test(await mainText(p)) && !/₱0\.00/.test(await mainText(p)));
    check("Add transaction is disabled (the accounts have not loaded) and still reads 'Add transaction'", await addBtn(p).isDisabled() && /Add transaction/.test(await addBtn(p).getAttribute("aria-label")));
    check("each Retry has a specific name", await retry(p, "your summary").count() === 1 && await retry(p, "your credit cards").count() === 1 && await retry(p, "recent activity").count() === 1 && await retry(p, "the categories").count() === 1);
    await shot(p, "states-load-error-overview-375.png");
    await retry(p, "your summary").click(); await p.waitForTimeout(300);
    const after = await alerts(p);
    check("retrying the summary fixes only that block", after.length === 3 && /Net position/.test(await mainText(p)) && !/Couldn't load your summary/.test(after.join(" ")), after.join(" | "));
    await retry(p, "your credit cards").click(); await p.waitForTimeout(300);
    check("retrying the cards restores them; Add transaction waits for the categories too", /Blue Card/.test(await mainText(p)) && await addBtn(p).isDisabled());
    await retry(p, "recent activity").click(); await p.waitForTimeout(300);
    await retry(p, "the categories").click(); await p.waitForTimeout(300);
    check("then Add transaction is enabled", await addBtn(p).isEnabled());
    eq("no failed block is left", (await alerts(p)).length, 0);
    check("the screen is complete: Lunch with team in recent activity", /Lunch with team/.test(await mainText(p)));
  });

  group = "?demo=load-error: Activity and Accounts";
  await safe(async () => {
    const p = await open(375, { query: "?demo=load-error", view: "Activity" });
    const a = await alerts(p);
    check("Activity: 'Couldn't load activity.' with Retry", a.includes("Couldn't load activity. Retry"), a.join(" | "));
    check("the filters stay usable", await p.locator("#month").isEnabled() && await p.locator("#activity-account").isEnabled());
    await retry(p, "activity").click(); await p.waitForTimeout(300);
    check("Retry loads the list", /18 entries · October 2026/.test(await mainText(p)) && !(await alerts(p)).some(x => /activity/.test(x)));
    const q = await open(375, { query: "?demo=load-error", view: "Accounts" });
    const b = await alerts(q);
    const acc = b.filter(x => /accounts/.test(x));
    check("Accounts: the accounts failure is announced once (one live alert, the second section's copy is silent)", acc.length === 1 && acc[0] === "Couldn't load accounts. Retry", b.join(" | "));
    check("Accounts: both sections show it", ((await mainText(q)).match(/Couldn't load accounts\./g) || []).length === 2);
    await shot(q, "states-load-error-accounts-375.png");
    await q.locator('button[aria-label="Retry loading accounts"]').first().click(); await q.waitForTimeout(400);
    check("one Retry asks again for whatever failed, and both sections recover", !(await mainText(q)).includes("Couldn't load accounts") && /Cash on hand/.test(await mainText(q)) && /Blue Card/.test(await mainText(q)));
  });

  group = "Failures stay with the request that failed (review of 4.9)";
  await safe(async () => {
    const p = await open(375, { query: "?demo=load-error&failing=summary", view: "Accounts" });
    const t = await mainText(p);
    check("only the summary fails: the rows and cards still show", /Cash on hand/.test(t) && /Blue Card/.test(t) && /Main Savings/.test(t));
    check("only the totals say 'Couldn't load the totals.'", (t.match(/Couldn[’']t load the totals\./g) || []).length === 2 && !/Couldn[’']t load accounts/.test(t));
    check("and carry no 'Last updated' (the accounts request, which succeeded, must not lend its time)", !/Last updated/.test(t));
    eq("the same failure is announced once, not twice", await p.evaluate(() => [...document.querySelectorAll("main [role=alert]")].length), 1);
    check("(and no 'Last updated' even though the accounts loaded)", !/Last updated/.test(await mainText(p)));
    await shot(p, "states-summary-only-accounts-375.png");
    await p.locator('button[aria-label="Retry loading the totals"]').first().click(); await p.waitForTimeout(300);
    check("Retry restores the totals", /₱54,196\.25/.test(await mainText(p)) && !/Couldn[’']t load/.test(await mainText(p)));
    const q = await open(375, { query: "?demo=load-error&failing=accounts", view: "Accounts" });
    eq("both sections show the accounts failure but only one is a live alert", await q.evaluate(() => ({ blocks: [...document.querySelectorAll("main")].map(m => (m.innerText.match(/Couldn't load accounts\./g) || []).length)[0], alerts: document.querySelectorAll("main [role=alert]").length })).then(x => `${x.blocks}/${x.alerts}`), "2/1");
    const c = await open(375, { query: "?demo=load-error&failing=categories" });
    const ct = await mainText(c);
    check("categories fail alone: the figures and cards are NOT reported as failed", /Net position/.test(ct) && /Blue Card/.test(ct) && !/Couldn't load your credit cards/.test(ct) && !/Couldn't load your summary/.test(ct));
    check("a banner says the categories did not load, and Add transaction is off until they do", /Couldn't load the categories\./.test(ct) && await addBtn(c).isDisabled());
    await c.locator('button[aria-label="Retry loading the categories"]').click(); await c.waitForTimeout(300);
    check("Retry brings them back and enables Add transaction", !/Couldn't load the categories/.test(await mainText(c)) && await addBtn(c).isEnabled());
  });

  group = "Retry keeps keyboard focus (review of 4.9)";
  await safe(async () => {
    const focusInfo = p => p.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, id: a?.id || "", text: (a?.textContent || "").trim().slice(0, 30), inMain: !!a?.closest("main") }; });
    const p = await open(375, { query: "?demo=load-error" });
    await p.locator('button[aria-label="Retry loading recent activity"]').focus();
    await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    let f = await focusInfo(p);
    check("Retry on Recent activity (by keyboard): focus lands on that block's heading, not on nothing", f.id === "recent-activity-title" && f.tag === "H2", JSON.stringify(f));
    await p.locator('button[aria-label="Retry loading your credit cards"]').focus();
    await p.keyboard.press("Space"); await p.waitForTimeout(300);
    f = await focusInfo(p);
    check("Retry on Credit cards: focus lands on the Credit cards heading", f.id === "credit-cards-title", JSON.stringify(f));
    await p.locator('button[aria-label="Retry loading your summary"]').focus();
    await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    f = await focusInfo(p);
    check("Retry on the summary: focus lands on the page heading", f.tag === "H1" && f.text === "Overview", JSON.stringify(f));
    check("and one Tab from there reaches a real control (focus order is intact)", (await (async () => { await p.keyboard.press("Tab"); return focusInfo(p); })()).tag !== "BODY");
    const q = await open(375, { query: "?demo=load-error", view: "Accounts" });
    await q.locator('button[aria-label="Retry loading accounts"]').first().focus();
    await q.keyboard.press("Enter"); await q.waitForTimeout(300);
    f = await focusInfo(q);
    check("Accounts: focus lands on the Money you have heading", f.id === "money-you-have-title", JSON.stringify(f));
    const a = await open(375, { query: "?demo=load-error", view: "Activity" });
    await a.locator('button[aria-label="Retry loading activity"]').focus();
    await a.keyboard.press("Enter"); await a.waitForTimeout(300);
    f = await focusInfo(a);
    check("Activity: focus lands on the page heading", f.tag === "H1" && f.text === "Activity", JSON.stringify(f));
  });

  group = "?demo=flaky: a reload fails after data was shown";
  await safe(async () => {
    const p = await open(375, { query: "?demo=flaky" });
    check("the first load works", /Net position/.test(await mainText(p)) && (await alerts(p)).length === 0);
    const before = await p.evaluate(() => new Date().toString());
    await p.selectOption("#month", { label: "September 2026" }); await p.waitForTimeout(300);
    const a = await alerts(p);
    const m = /^Couldn't load your summary\. Last updated (\d\d):(\d\d)\. Retry$/.exec(a.find(x => /summary/.test(x)) || "");
    check("the summary block says when it last updated", !!m, a.join(" | "));
    if (m) { const now = new Date(await p.evaluate(() => new Date().toString())); const then = new Date(now); then.setHours(+m[1], +m[2], 0, 0); check("…and that time is the time the figures arrived (within two minutes)", Math.abs(now - then) < 120_000, `${m[1]}:${m[2]} vs ${now.toTimeString().slice(0, 5)}`); }
    await retry(p, "your summary").click(); await p.waitForTimeout(300);
    check("Retry restores the summary for September", (await alerts(p)).every(x => !/summary/.test(x)) && /September 2026/.test(await mainText(p)));
    void before;
  });

  group = "?demo=offline: nothing works, and the screen says so";
  await safe(async () => {
    const p = await open(375, { query: "?demo=offline" });
    eq("four blocks failed (the categories banner too)", (await alerts(p)).length, 4);
    await retry(p, "your summary").click(); await p.waitForTimeout(300);
    check("Retry fails again and the message stays (no spinner forever, no blank)", /Couldn't load your summary/.test((await alerts(p)).join(" ")) && await retry(p, "your summary").isVisible());
    check("Add transaction stays disabled (there are no accounts to add to)", await addBtn(p).isDisabled());
    check("the shell still works: navigating to Accounts shows its failure", (await (async () => { await nav(p, "Accounts"); return alerts(p); })()).length === 2);
  });

  group = "?demo=slow: reads take 1.5 seconds";
  await safe(async () => {
    const p = await open(375, { query: "?demo=slow", wait: false });
    await p.waitForTimeout(300);
    check("while loading: skeleton, busy, Add transaction disabled but not 'Add an account first'", await p.evaluate(() => document.querySelector("main [aria-busy]").getAttribute("aria-busy")) === "true" && await addBtn(p).isDisabled() && !/account first/.test(await addBtn(p).getAttribute("aria-label")));
    await p.waitForTimeout(2500);
    check("then the figures arrive and Add transaction is enabled", /Net position/.test(await mainText(p)) && await addBtn(p).isEnabled());
    await nav(p, "Activity"); await p.waitForTimeout(2200);
    const rowsBefore = await p.locator("main section ul li").count();
    await p.selectOption("#month", { label: "September 2026" });
    await p.waitForTimeout(150);
    check("no 'Updating…' for a very short wait (no flicker)", !/Updating/.test(await mainText(p)));
    await p.waitForTimeout(450);
    check("after a moment: a quiet 'Updating…' while the previous list stays visible", /Updating…/.test(await mainText(p)) && await p.locator("main section ul li").count() === rowsBefore, `${rowsBefore} rows`);
    await shot(p, "states-updating-activity-375.png");
    await p.waitForTimeout(1500);
    check("when the reply arrives the stamp goes and the new month shows", !/Updating/.test(await mainText(p)) && /No activity in September 2026\./.test(await mainText(p)));
  });

  group = "?demo=slow: a save that takes 16 seconds (the notice appears after 15)";
  await safe(async () => {
    const p = await open(375, { query: "?demo=slow", wait: false });
    await p.waitForTimeout(2500);
    await addBtn(p).click(); await p.waitForTimeout(200);
    await p.fill("#qa-amount", "75"); await p.selectOption("#qa-account", "1"); await dlg(p).locator("label:has(input[name=qa-category]):has-text('Food')").click();
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(500);
    check("saving: button says 'Saving…' and is disabled, fields disabled", /Saving…/.test(await dlg(p).locator("button[type=submit]").innerText()) && await dlg(p).locator("button[type=submit]").isDisabled() && await p.locator("#qa-amount").isDisabled());
    check("no 'taking longer' notice yet", !/taking longer/.test(await dlg(p).innerText()));
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    check("Escape does nothing while saving", await dlg(p).count() === 1);
    await p.waitForTimeout(15_000);
    check("after 15 seconds: 'This is taking longer than usual…' appears (and Save is still disabled)", /This is taking longer than usual\./.test(await dlg(p).innerText()) && await dlg(p).locator("button[type=submit]").isDisabled());
    await shot(p, "states-slow-save-375.png");
    await p.waitForTimeout(2000);
    check("then the save finishes: the dialog closes with the one confirmation", await dlg(p).count() === 0 && /Expense saved: −₱75\.00 from Cash on hand\./.test(await p.locator('[role=status][aria-live=polite]').first().innerText().then(T)));
  });

  group = "?demo=invalid: the first write is refused (422)";
  await safe(async () => {
    const p = await open(375, { query: "?demo=invalid" });
    await addBtn(p).click(); await p.waitForTimeout(200);
    await p.fill("#qa-amount", "120"); await p.selectOption("#qa-account", "1"); await dlg(p).locator("label:has(input[name=qa-category]):has-text('Food')").click();
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(300);
    const text = T(await dlg(p).innerText());
    check("the dialog stays open with the spec's message", /Some details aren't valid\. Check the highlighted fields\./.test(text));
    check("the refused field is highlighted, says so in words, and has focus", await p.evaluate(() => { const a = document.querySelector("#qa-amount"); return a.getAttribute("aria-invalid") === "true" && /Check this field\./.test(document.getElementById(a.getAttribute("aria-describedby")).innerText) && document.activeElement === a; }));
    check("everything typed is kept", await p.inputValue("#qa-amount") === "120" && await p.inputValue("#qa-account") === "1");
    await shot(p, "states-invalid-375.png");
    await p.fill("#qa-amount", "125");
    check("editing the field clears its mark", await p.evaluate(() => document.querySelector("#qa-amount").getAttribute("aria-invalid") === "false"));
    await dlg(p).locator("button[type=submit]").click(); await p.waitForTimeout(300);
    check("the next try goes through", await dlg(p).count() === 0);
    const q = await open(375, { query: "?demo=invalid", view: "Accounts" });
    await q.locator('main button:has-text("Add account"):visible').first().click(); await q.waitForTimeout(200);
    await q.fill("#aa-name", "Piggy"); await q.fill("#aa-balance", "250"); await dlg(q).locator("button[type=submit]").click(); await q.waitForTimeout(300);
    check("Add account: refused field highlighted under Name, with the message at the top", /Some details aren't valid\./.test(T(await dlg(q).innerText())) && await q.evaluate(() => document.querySelector("#aa-name").getAttribute("aria-invalid") === "true" && document.activeElement.id === "aa-name"));
  });

  group = "Layout of the failure blocks";
  await safe(async () => {
    for (const W of [320, 375, 768, 1280]) {
      const p = await open(W, { query: "?demo=offline" });
      for (const view of ["Overview", "Activity", "Accounts"]) {
        if (view !== "Overview") await nav(p, view);
        const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > document.documentElement.clientWidth, small: [...document.querySelectorAll("main [role=alert] button")].filter(b => b.getBoundingClientRect().height < 44 && b.getBoundingClientRect().width > 0).length, alerts: [...document.querySelectorAll("main [role=alert]")].length }));
        check(`${W}px ${view}: failure blocks fit, Retry buttons are 44px tall`, !r.over && r.small === 0 && r.alerts >= 1, JSON.stringify(r));
      }
      await p.context().close();
    }
  });

  check("no request left the page's own origin", external.length === 0, external.length ? external.slice(0, 3).join(", ") : "all requests same-origin");
  check("no console errors or warnings, no uncaught exceptions", errors.length === 0, errors.slice(0, 3).join(" || ") || "none");

  await browser.close();
  const pass = results.filter(r => r.ok).length; let g = "";
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-states-verify.json"), JSON.stringify(results, null, 1));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
