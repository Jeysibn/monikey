/* Verification script for the THROWAWAY design mock (docs/design/preview/app.html). Not production code.
 * Run:  node docs/design/preview/verify.cjs
 * Uses playwright-core + a cached Chromium that already exist on this machine (nothing is installed).
 * Writes results as JSON to stdout (last line) and a readable table before it. */
const path = require("path");
const fs = require("fs");
const os = require("os");
const PW = process.env.PW_CORE || path.join(os.homedir(), ".agent-reach/tools/node/lib/node_modules/@playwright/cli/node_modules/playwright-core");
const { chromium } = require(PW);
const CHROME = process.env.CHROME_BIN || fs.readdirSync(path.join(os.homedir(), ".cache/ms-playwright")).filter(d => d.startsWith("chromium-")).sort().reverse().map(d => path.join(os.homedir(), ".cache/ms-playwright", d, "chrome-linux64/chrome")).find(p => fs.existsSync(p));
const URL = "file://" + path.resolve(__dirname, "app.html");
const SHOTS = process.env.SHOTS_DIR || "";

const results = [];
let group = "";
const check = (name, ok, detail = "") => { results.push({ group, name, ok: !!ok, detail: String(detail) }); };
const eq = (name, actual, expected) => check(name, actual === expected, `got ${JSON.stringify(actual)}${actual === expected ? "" : ` expected ${JSON.stringify(expected)}`}`);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-gpu"] });
  const errors = [];
  async function open(width, height = 900, hash = "") {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error") errors.push(`console.error@${width}: ${m.text()}`); });
    await page.goto(URL + (hash ? "#" + hash : ""));
    await page.evaluate(() => document.fonts.ready);
    page.W = width; page.desktop = width >= 768;
    return page;
  }
  const pickOpt = async (p, sel, sub) => { const v = await p.evaluate(([s, t]) => { const o = [...document.querySelector(s).options].find(o => o.textContent.includes(t)); return o && o.value; }, [sel, sub]); if (v == null) throw new Error('no option containing ' + sub); await p.selectOption(sel, v); };
  const safe = async fn => { try { await fn(); } catch (e) { check('flow aborted: ' + String(e.message).split('\n')[0].slice(0, 200), false); } };
  const nav = (p, v) => p.locator(`[data-view="${v}"]:visible`).first().click();
  const snap = p => p.evaluate(() => {
    const t = s => (document.querySelector(s)?.textContent || "").trim();
    const all = (s, f) => [...document.querySelectorAll(s)].map(f);
    return {
      net: t("#v-overview .hc-amount"),
      have: all("#v-overview .hc-part b", e => e.textContent.trim())[0],
      debt: all("#v-overview .hc-part b", e => e.textContent.trim())[1],
      income: all("#v-overview .kv .v", e => e.textContent.trim())[0],
      expenses: all("#v-overview .kv .v", e => e.textContent.trim())[1],
      heroNotes: all("#v-overview .hc-note", e => e.textContent.trim()),
      eqLabel: document.querySelector("#v-overview .hc-eq")?.getAttribute("aria-label") || "",
      accounts: all("#v-accounts .acct-row", r => [r.querySelector(".n").textContent.trim(), r.querySelector(".amt2").textContent.trim(), r.querySelector(".cap").textContent.trim()]),
      cards: all("#v-accounts .cc", c => [c.querySelector(".cc-name").textContent.trim(), c.querySelector(".cc-amt").textContent.trim(), c.querySelector(".cc-sub").textContent.trim(), c.querySelector("[data-pay]").disabled]),
      count: t("#v-activity .countline"),
      noNaN: !/NaN|undefined/.test(document.body.innerText),
    };
  });
  const openAdd = async p => { if (p.desktop) await p.locator("[data-add]:visible").first().click(); else await p.click("#bottomAdd"); await p.waitForSelector("#qa[open]"); };
  const save = async p => { await p.click("#qaSave"); await p.waitForSelector("#qa", { state: "hidden" }); };
  const toast = p => p.locator("#toast .notice").first().innerText();
  const preview = p => p.locator("#preview").innerText().catch(() => "");

  /* ---------------- 1. font ---------------- */
  group = "Font (Manrope, self-hosted)";
  {
    const p = await open(1280, 900, "view=overview");
    const info = await p.evaluate(async () => {
      await document.fonts.ready;
      const faces = [...document.fonts].map(f => `${f.family}:${f.status}`);
      const mk = (txt, tab, w) => { const s = document.createElement("span"); s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${w} 32px Manrope,sans-serif;font-variant-numeric:${tab ? "tabular-nums" : "normal"}`; s.textContent = txt; document.body.appendChild(s); const r = s.getBoundingClientRect().width; s.remove(); return +r.toFixed(2); };
      const out = {};
      for (const w of [400, 600]) { out["tab" + w] = ["1111", "0000", "8888"].map(t => mk(t, true, w)); out["prop" + w] = ["1111", "0000", "8888"].map(t => mk(t, false, w)); }
      return { faces, ...out, check16: document.fonts.check("16px Manrope"), checkPeso: document.fonts.check("16px Manrope", "₱") };
    });
    check("Manrope faces loaded (latin + latin-ext)", info.faces.length >= 2 && info.faces.every(f => f.endsWith(":loaded") || f.endsWith(":unloaded")) && info.check16, info.faces.join(", "));
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const doc = await cdp.send("DOM.getDocument", { depth: 1 });
    const fontsFor = async sel => { const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: sel }); const r = await cdp.send("CSS.getPlatformFontsForNode", { nodeId }); return r.fonts.map(f => `${f.familyName}(${f.glyphCount})`); };
    const heroFonts = await fontsFor("#v-overview .hc-amount");
    check("₱ glyph is drawn by Manrope (hero amount)", heroFonts.length === 1 && heroFonts[0].startsWith("Manrope"), heroFonts.join(" | "));
    const rowFonts = await fontsFor("#v-overview .row-main .a");
    check("U+2212 minus and ₱ in a row amount drawn by Manrope", rowFonts.every(f => f.startsWith("Manrope")), rowFonts.join(" | "));
    check("tabular-nums makes 1111 / 0000 / 8888 equal width (weight 600)", new Set(info.tab600).size === 1, `tabular ${info.tab600} vs proportional ${info.prop600}`);
    check("tabular-nums equal width at weight 400", new Set(info.tab400).size === 1, `tabular ${info.tab400} vs proportional ${info.prop400}`);
    check("(info) default digits already tabular?", true, new Set(info.prop600).size === 1 ? "yes — default digits are already equal width" : `no — proportional by default (${info.prop600}); tabular-nums fixes it`);
    await p.context().close();
  }

  /* ---------------- 2. layout at 360 / 375 / 768 / 1280 ---------------- */
  for (const W of [360, 375, 768, 1280]) {
    for (const view of ["overview", "activity", "accounts"]) {
      group = `Layout ${W}px / ${view}`;
      const p = await open(W, W >= 768 ? 900 : 800, `view=${view}`);
      const m = await p.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
        const addBtns = [...document.querySelectorAll("button")].filter(b => /Add transaction/.test(b.textContent) && vis(b)).length;
        const bottomAdd = vis(document.getElementById("bottomAdd"));
        const primaries = [...document.querySelectorAll(".btn.primary, .bottom .add")].filter(vis).length;
        const bad = [];
        document.querySelectorAll(".v,.hc-amount,.hc-part b,.cc-amt,.amt2,.row-main .a,.fig").forEach(e => {
          if (!vis(e)) return;
          const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3, r = e.getBoundingClientRect();
          const box = e.closest(".card,.hero-card").getBoundingClientRect();
          const lines = Math.round(r.height / lh);
          if (lines > 1) bad.push(`wraps(${lines}): ${e.textContent.trim()}`);
          if (r.right > box.right - 1 || r.left < box.left) bad.push(`overflows card: ${e.textContent.trim()}`);
        });
        const tr = []; document.querySelectorAll(".row-main .t,.row-main .m .mt,.acct-row .n").forEach(e => { if (vis(e) && e.scrollWidth > e.clientWidth + 1) tr.push(e.textContent.trim().slice(0, 28)); });
        const small = [...document.querySelectorAll("button:not(.icon-btn),select,input[type=text]")].filter(e => vis(e) && !e.closest("dialog") && e.getBoundingClientRect().height < 43.5).map(e => e.textContent.trim().slice(0, 20) || e.id);
        return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, addBtns, bottomAdd, primaries, bad, truncated: tr.length, small };
      });
      check("no horizontal page overflow", m.sw <= m.iw, `scrollWidth ${m.sw} / viewport ${m.iw}`);
      if (W < 768) { eq("duplicate 'Add transaction' buttons hidden below 768px (count)", m.addBtns, 0); check("bottom-bar Add visible", m.bottomAdd); }
      else { eq("exactly one visible 'Add transaction' button ≥768px", m.addBtns, 1); check("bottom bar hidden ≥768px", !m.bottomAdd); }
      eq("one filled primary action per screen", m.primaries, 1);
      check("financial amounts stay on one line and inside their card", m.bad.length === 0, m.bad.join("; ") || "all amounts single-line");
      check("touch targets ≥44px for buttons/selects (outside dialogs)", W >= 768 || m.small.length === 0, m.small.join(", ") || "ok");
      check("(info) text truncated with ellipsis", true, `${m.truncated} labels truncated`);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `final-${view}-${W}.png`), fullPage: true });
      await p.context().close();
    }
  }

  /* ---------------- 3. flows ---------------- */
  for (const W of [375, 1280]) {
    const tag = `${W}px`;

    group = `Flow ${tag}: expense on a credit card`;
    await safe(async () => {
      const p = await open(W, 900, "view=overview"); const before = await snap(p);
      eq("start: net position", before.net, "₱33,146.25"); eq("start: monthly expenses", before.expenses, "₱27,127.40");
      await openAdd(p);
      eq("amount field focused on open", await p.evaluate(() => document.activeElement.id), "f-amt");
      await p.keyboard.type("2500");
      await pickOpt(p, "#f-acct", "Blue Card");
      check("helper says it adds to card debt", /adds to the card's debt/.test(await p.locator("#h-acct").innerText()));
      const pv = await preview(p);
      check("before/after estimate: Blue Card owed ₱14,250.00 → ₱16,750.00", /Blue Card owed: ₱14,250\.00 → ₱16,750\.00/.test(pv), pv.replace(/\n/g, " | "));
      check("double-count hint visible on Expense", await p.locator("#dcHint").isVisible());
      await p.click('#f-cat label:has-text("Shopping")'); await save(p);
      const msg = await toast(p);
      check("confirmation states the card's new owed figure", /Blue Card now owes ₱16,750\.00/.test(msg), msg);
      await nav(p, "overview"); const a = await snap(p);
      eq("monthly expenses +₱2,500.00", a.expenses, "₱29,627.40"); eq("net position −₱2,500.00", a.net, "₱30,646.25"); eq("card debt total", a.debt, "₱23,550.00");
      await nav(p, "accounts"); const ac = await snap(p);
      check("Blue Card shows ₱16,750.00 owed", ac.cards[0][1] === "₱16,750.00", ac.cards[0].join(" | "));
      // remembered account (category must NOT be remembered)
      await openAdd(p);
      eq("last-used account remembered for next entry", await p.locator("#f-acct option:checked").innerText().then(t => t.split(" — ")[0]), "Blue Card");
      eq("category NOT pre-selected", await p.locator("#f-cat input:checked").count(), 0);
      await p.keyboard.press("Escape"); await p.context().close();
    });

    group = `Flow ${tag}: card payment, Pay full, estimates`;
    await safe(async () => {
      const p = await open(W, 900, "view=accounts"); const before = await snap(p);
      await p.locator('#v-accounts [data-pay="4"]').first().click(); await p.waitForSelector("#qa[open]");
      eq("opens on Pay card with the card preselected", await p.locator("#f-card option:checked").innerText(), "Blue Card");
      eq("Pay full button label shows owed amount", (await p.locator("#payFull").innerText()).trim(), "Pay full ₱14,250.00");
      await p.keyboard.press("Tab"); // leave amount, empty submit first to test validation
      await p.click("#qaSave");
      const sumFocused = await p.evaluate(() => document.activeElement.id);
      eq("empty submit moves focus to the error summary", sumFocused, "qaSummary");
      const sumText = await p.locator("#qaSummary").innerText();
      check("error summary lists amount + source", /Enter an amount\./.test(sumText) && /paying from/.test(sumText), sumText.replace(/\n/g, " | "));
      check("amount marked aria-invalid", (await p.getAttribute("#f-amt", "aria-invalid")) === "true");
      await p.click("#payFull");
      eq("Pay full fills the server's owed figure", await p.inputValue("#f-amt"), "14250.00");
      await pickOpt(p, "#f-acct", "Main Savings");
      const pv = await preview(p);
      check("estimate: Main Savings ₱48,725.50 → ₱34,475.50", /Main Savings: ₱48,725\.50 → ₱34,475\.50/.test(pv), pv.replace(/\n/g, " | "));
      check("estimate: Blue Card owed ₱14,250.00 → ₱0.00", /Blue Card owed: ₱14,250\.00 → ₱0\.00/.test(pv), pv.replace(/\n/g, " | "));
      check("estimate says Expenses: no change", /Expenses: no change/.test(pv));
      check("no category field on Pay card", !(await p.locator("#cat-field").isVisible()));
      check("source list contains no credit card", !(await p.locator("#f-acct option").allInnerTexts()).some(t => /Blue Card|Everyday/.test(t)));
      await save(p); const msg = await toast(p);
      check("confirmation: new owed figure + payments aren't expenses", /Blue Card now owes ₱0\.00/.test(msg) && /don't count as expenses/.test(msg), msg);
      await nav(p, "overview"); const a = await snap(p);
      eq("NET POSITION unchanged after payment", a.net, before.net); eq("MONTHLY EXPENSES unchanged after payment", a.expenses, "₱27,127.40");
      eq("money you have fell by the payment", a.have, "₱39,946.25"); eq("card debt fell by the payment", a.debt, "₱6,800.00");
      await nav(p, "accounts"); const ac = await snap(p);
      check("estimate matched saved result (Main Savings)", ac.accounts.find(x => x[0] === "Main Savings")[1] === "₱34,475.50", ac.accounts.find(x => x[0] === "Main Savings").join(" | "));
      check("Pay card disabled when nothing is owed", ac.cards[0][3] === true && /nothing owed/.test(ac.cards[0][2]), ac.cards[0].join(" | "));
      await nav(p, "activity");
      const rowTxt = await p.locator("#v-activity .row").first().innerText();
      check("payment row shows no sign and is not styled as expense", /Card payment/.test(rowTxt) && !/[−+]₱14,250/.test(rowTxt) && /₱14,250\.00/.test(rowTxt), rowTxt.replace(/\n/g, " | "));
      await p.context().close();
    });

    group = `Flow ${tag}: partial payment keeps expenses and net unchanged`;
    await safe(async () => {
      const p = await open(W, 900, "view=overview"); const b = await snap(p);
      await openAdd(p); await p.locator('#seg label', { hasText: 'Pay card' }).click(); await p.keyboard.press("Tab").catch(() => {});
      await p.fill("#f-amt", "5,000.00"); await pickOpt(p, "#f-acct", "Main Savings"); await pickOpt(p, "#f-card", "Blue Card");
      const pv = await preview(p);
      check("estimate: Blue Card owed ₱14,250.00 → ₱9,250.00", /Blue Card owed: ₱14,250\.00 → ₱9,250\.00/.test(pv), pv.replace(/\n/g, " | "));
      await save(p); await nav(p, "overview"); const a = await snap(p);
      eq("net position unchanged", a.net, b.net); eq("expenses unchanged", a.expenses, b.expenses); eq("income unchanged", a.income, b.income);
      await p.context().close();
    });

    group = `Flow ${tag}: edit and delete`;
    await safe(async () => {
      const p = await open(W, 900, "view=activity");
      const openEdit = async id => { if (p.desktop) await p.locator(`[data-edit="${id}"]`).click(); else await p.locator(`#v-activity [data-open="${id}"]`).click(); await p.waitForSelector("#qa[open]"); };
      await openEdit(1);
      eq("edit sheet is titled for the entry kind", await p.locator("#qaTitle").innerText(), "Edit expense");
      check("type switch hidden while editing; double-count hint hidden", !(await p.locator("#seg").isVisible()) && !(await p.locator("#dcHint").isVisible()));
      eq("amount prefilled", await p.inputValue("#f-amt"), "385.00");
      await p.fill("#f-amt", "485"); await save(p);
      await nav(p, "overview"); let a = await snap(p); eq("expenses +₱100.00 after edit", a.expenses, "₱27,227.40");
      await nav(p, "accounts"); a = await snap(p); eq("GCash −₱100.00 after edit", a.accounts.find(x => x[0] === "GCash")[1], "₱3,020.75");
      await nav(p, "activity");
      // delete: cancel keeps data, confirm removes
      if (p.desktop) await p.locator('[data-del="1"]').click(); else { await p.locator('#v-activity [data-open="1"]').click(); await p.waitForSelector("#qa[open]"); await p.click("#qaDelete"); }
      await p.waitForSelector("#qaConfirm:not(.hide)");
      const body = await p.locator("#qaConfirmBody").innerText();
      check("confirmation names the entry and its effect", /Lunch with team/.test(body) && /GCash goes up by ₱485\.00/.test(body) && /can't be undone/.test(body), body.replace(/\n/g, " | "));
      eq("Cancel is focused first in the confirmation", await p.evaluate(() => document.activeElement.id), "cfCancel");
      await p.click("#cfCancel"); await p.waitForTimeout(100);
      if (!p.desktop) { check("Cancel returns to the edit form on mobile", await p.locator("#qaForm").isVisible()); await p.keyboard.press("Escape"); }
      await nav(p, "activity"); eq("entry still there after Cancel", (await snap(p)).count, "18 entries · October 2026");
      if (p.desktop) await p.locator('[data-del="1"]').click(); else { await p.locator('#v-activity [data-open="1"]').click(); await p.waitForSelector("#qa[open]"); await p.click("#qaDelete"); }
      await p.waitForSelector("#qaConfirm:not(.hide)"); await p.click("#cfDelete"); await p.waitForSelector("#qa", { state: "hidden" });
      eq("status message after delete", (await toast(p)).trim(), "Expense deleted.");
      await nav(p, "activity"); eq("entry count after delete", (await snap(p)).count, "17 entries · October 2026");
      await nav(p, "overview"); a = await snap(p); eq("expenses after delete (₱27,127.40 − ₱385.00)", a.expenses, "₱26,742.40");
      // delete the card payment: both balances move, expenses/net untouched
      const net0 = a.net, exp0 = a.expenses;
      await nav(p, "activity");
      if (p.desktop) await p.locator('[data-del="4"]').click(); else { await p.locator('#v-activity [data-open="4"]').click(); await p.waitForSelector("#qa[open]"); await p.click("#qaDelete"); }
      await p.waitForSelector("#qaConfirm:not(.hide)");
      const pbody = await p.locator("#qaConfirmBody").innerText();
      check("payment delete copy: both balances move, expenses don't", /Main Savings goes up by ₱5,000\.00/.test(pbody) && /Blue Card owed goes up by ₱5,000\.00/.test(pbody) && /expenses don't change/.test(pbody), pbody.replace(/\n/g, " | "));
      await p.click("#cfDelete"); await p.waitForSelector("#qa", { state: "hidden" });
      await nav(p, "overview"); a = await snap(p); eq("net unchanged after deleting a payment", a.net, net0); eq("expenses unchanged after deleting a payment", a.expenses, exp0);
      await p.context().close();
    });

    group = `Flow ${tag}: negative balance and overpaid card`;
    await safe(async () => {
      const p = await open(W, 900, "view=overview");
      await openAdd(p); await p.locator('#seg label', { hasText: 'Pay card' }).click();
      await p.fill("#f-amt", "4000"); await pickOpt(p, "#f-acct", "GCash"); await pickOpt(p, "#f-card", "Blue Card");
      const w = await p.locator("#warn").innerText();
      check("below-zero warning appears (non-blocking)", /GCash has ₱3,120\.75, less than this payment\. Its balance will go below zero\./.test(w), w);
      const before = (await snap(p)).net; await save(p);
      await nav(p, "accounts"); let s = await snap(p);
      const g = s.accounts.find(x => x[0] === "GCash");
      check("GCash shown as negative with a 'Below zero' flag", g[1] === "−₱879.25" && /Below zero/.test(g[2]), g.join(" | "));
      await nav(p, "overview"); s = await snap(p);
      check("hero says an account is below zero", s.heroNotes.some(n => /An account is below zero/.test(n)), s.heroNotes.join(" | ")); eq("net unchanged", s.net, before);
      await p.context().close();

      const q = await open(W, 900, "view=overview"); const net0 = (await snap(q)).net;
      await openAdd(q); await q.locator('#seg label', { hasText: 'Pay card' }).click();
      await q.fill("#f-amt", "20000"); await pickOpt(q, "#f-acct", "Main Savings"); await pickOpt(q, "#f-card", "Everyday Card");
      const w2 = await q.locator("#warn").innerText();
      check("overpay warning appears (non-blocking)", /more than the ₱6,800\.00 currently owed\. The extra becomes credit on the card\./.test(w2), w2);
      const pv = await preview(q); check("estimate shows credit, not a negative debt", /Everyday Card owed: ₱6,800\.00 → credit ₱13,200\.00/.test(pv), pv.replace(/\n/g, " | "));
      await save(q); const msg = await toast(q); check("confirmation says the card has credit", /Everyday Card now has ₱13,200\.00 credit/.test(msg), msg);
      await nav(q, "accounts"); s = await snap(q); const ec = s.cards.find(c => c[0] === "Everyday Card");
      check("card shows 'card credit ₱13,200.00' and Pay card is disabled", ec[1] === "₱13,200.00" && /card credit/.test(ec[2]) && ec[3] === true, ec.join(" | "));
      await nav(q, "overview"); s = await snap(q);
      check("hero shows the card-credit line", s.heroNotes.some(n => /Plus ₱13,200\.00 card credit/.test(n)), s.heroNotes.join(" | "));
      check("equation label includes card credit", /plus card credit/.test(s.eqLabel), s.eqLabel); eq("net unchanged after overpayment", s.net, net0);
      await q.context().close();
    });

    group = `Flow ${tag}: add account and zero values`;
    await safe(async () => {
      const p = await open(W, 900, "view=accounts");
      let n = 0;
      for (const v of ["0", "00", "0.00", "0.0", "0.", "000.00", "0,000.00"]) {
        n++; await p.locator("[data-addacct]").first().click(); await p.waitForSelector("#aa[open]");
        await p.fill("#a-name", `Zero ${n}`); await p.fill("#a-bal", v); await p.click('#aaForm button[type=submit]');
        const closed = await p.locator("#aa").evaluate(d => !d.open);
        const s = await snap(p); const row = s.accounts.find(x => x[0] === `Zero ${n}`);
        check(`cash account with opening balance "${v}" is accepted as ₱0.00`, closed && row && row[1] === "₱0.00" && s.noNaN, row ? row.join(" | ") : "not added");
      }
      for (const [limit, owe] of [["10000", "0"], ["10000", "00"], ["10,000.00", "0.00"]]) {
        n++; await p.locator("[data-addacct]").first().click(); await p.waitForSelector("#aa[open]");
        await p.locator('#aa .seg label', { hasText: 'Card' }).click(); await p.fill("#a-name", `Card ${n}`); await p.fill("#a-lim", limit); await p.fill("#a-owe", owe); await p.click('#aaForm button[type=submit]');
        const s = await snap(p); const c = s.cards.find(x => x[0] === `Card ${n}`);
        check(`card with limit "${limit}" and owed "${owe}" is accepted`, c && /nothing owed/.test(c[2]) && s.noNaN, c ? c.join(" | ") : "not added");
      }
      const reject = async (type, fields, want) => {
        await p.locator("[data-addacct]").first().click(); await p.waitForSelector("#aa[open]");
        if (type === "card") await p.locator('#aa .seg label', { hasText: 'Card' }).click();
        await p.fill("#a-name", `Bad ${Math.random().toString(36).slice(2, 7)}`);
        for (const [id, v] of Object.entries(fields)) await p.fill(id, v);
        await p.click('#aaForm button[type=submit]');
        const stillOpen = await p.locator("#aa").evaluate(d => d.open); const txt = await p.locator("#aa .dlg-b").innerText(); const ok = stillOpen && want.test(txt) && !/NaN/.test(txt);
        await p.keyboard.press("Escape"); return [ok, txt.replace(/\n/g, " | ").slice(0, 160)];
      };
      let r = await reject("cash", { "#a-bal": "" }, /Enter an amount, or 0\.00\./); check("empty opening balance is rejected with a clear message", r[0], r[1]);
      r = await reject("cash", { "#a-bal": "-5" }, /Use numbers only/); check("negative opening balance rejected", r[0], r[1]);
      r = await reject("cash", { "#a-bal": "abc" }, /Use numbers only/); check("letters rejected (no NaN)", r[0], r[1]);
      r = await reject("cash", { "#a-bal": "1.234" }, /at most 2 decimal places/); check("3 decimals rejected", r[0], r[1]);
      r = await reject("card", { "#a-lim": "0", "#a-owe": "0" }, /Credit limit must be more than ₱0\.00/); check("credit limit of 0 rejected", r[0], r[1]);
      r = await reject("card", { "#a-lim": "5000", "#a-owe": "" }, /Enter an amount, or 0\.00\./); check("empty 'owe today' rejected", r[0], r[1]);
      await p.context().close();
    });

    group = `Flow ${tag}: keyboard accessibility and validation`;
    await safe(async () => {
      const p = await open(W, 900, "view=overview");
      await p.focus(p.desktop ? "[data-add]" : "#bottomAdd"); const openerId = await p.evaluate(() => document.activeElement.id || document.activeElement.className);
      await p.keyboard.press("Enter"); await p.waitForSelector("#qa[open]");
      eq("Enter on the Add control opens the dialog with Amount focused", await p.evaluate(() => document.activeElement.id), "f-amt");
      const order = []; for (let i = 0; i < 9; i++) { await p.keyboard.press("Tab"); order.push(await p.evaluate(() => { const e = document.activeElement; return e.id || (e.name ? `${e.name}:${e.value}` : e.tagName + ":" + e.textContent.trim().slice(0, 12)); })); }
      check("(info) Tab order after Amount", true, order.join(" → "));
      check("focus stays inside the dialog while tabbing", await p.evaluate(() => document.activeElement.closest("dialog")?.id === "qa"), order.join(" → "));
      await p.focus('input[name=kind][value=expense]'); await p.keyboard.press("ArrowRight");
      eq("ArrowRight on the type switch selects Income", await p.evaluate(() => document.querySelector("input[name=kind]:checked").value), "income");
      check("Income hides the double-count hint and lists no credit cards", !(await p.locator("#dcHint").isVisible()) && !(await p.locator("#f-acct option").allInnerTexts()).some(t => /Blue Card/.test(t)));
      await p.focus('input[name=kind][value=income]'); await p.keyboard.press("ArrowLeft");
      await p.focus("#f-amt"); await p.keyboard.type("12.345"); await p.keyboard.press("Tab");
      check("inline error on blur for 3 decimals", /at most 2 decimal places/.test(await p.locator("#e-amt").innerText()), await p.locator("#e-amt").innerText());
      await p.fill("#f-amt", "350"); await p.focus("#f-amt"); await p.keyboard.press("Enter");
      eq("Enter submits; invalid form → error summary focused", await p.evaluate(() => document.activeElement.id), "qaSummary");
      const sum = await p.locator("#qaSummary").innerText();
      check("summary names the missing account and category", /Choose an account\./.test(sum) && /Choose a category\./.test(sum), sum.replace(/\n/g, " | "));
      check("fields carry aria-invalid", (await p.getAttribute("#f-acct", "aria-invalid")) === "true" && (await p.getAttribute("#f-cat", "aria-invalid")) === "true");
      await p.click('#qaSummary a[data-jump="f-acct"]');
      eq("summary link moves focus to the field", await p.evaluate(() => document.activeElement.id), "f-acct");
      await p.keyboard.press("Escape"); await p.waitForTimeout(150);
      check("Escape closes the dialog", !(await p.locator("#qa").evaluate(d => d.open)));
      check("focus returns to the control that opened it", await p.evaluate(id => (document.activeElement.id || document.activeElement.className) === id, openerId), `opener=${openerId}`);
      await p.context().close();
    });

    group = `Flow ${tag}: double-count guard`;
    await safe(async () => {
      const p = await open(W, 900, "view=overview");
      await openAdd(p); await p.fill("#f-amt", "5000"); await p.click("#dcLink");
      eq("'Use Pay card' switches the type", await p.evaluate(() => document.querySelector("input[name=kind]:checked").value), "payment");
      eq("amount is kept when switching", await p.inputValue("#f-amt"), "5000");
      await p.context().close();
    });
  }

  /* ---------------- summary ---------------- */
  check("(info) page/console errors during all runs", errors.length === 0, errors.slice(0, 5).join(" || ") || "none");
  await browser.close();
  const pass = results.filter(r => r.ok).length;
  let g = "";
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-verify.json"), JSON.stringify(results, null, 1));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
