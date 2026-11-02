/* Milestone 4.3 browser verification of the Accounts screen (read-only).
 * Run (after `npm run build` and `npx vite preview --port 4173`):  node scripts/verify-accounts.cjs
 * Uses playwright-core and a Chromium that already exist on this machine (nothing is installed).
 * Prints one PASS/FAIL line per check; RESULTS_JSON receives a JSON copy; SHOTS_DIR receives screenshots. */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium, executablePath: CHROME } = require("./browser-runtime.cjs");
const BASE = process.env.BASE_URL || "http://localhost:4173/";
const MOCK = "file://" + path.resolve(__dirname, "../../docs/design/preview/app.html");
const SHOTS = process.env.SHOTS_DIR || "";

const results = []; let group = "";
const check = (name, ok, detail = "") => results.push({ group, name, ok: !!ok, detail: String(detail) });
const eq = (name, a, e) => check(name, a === e, `got ${JSON.stringify(a)}${a === e ? "" : ` expected ${JSON.stringify(e)}`}`);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-gpu"] });
  const errors = [], external = [];
  const safe = async fn => { try { await fn(); } catch (e) { check("section aborted: " + String(e.message).split("\n")[0].slice(0, 220), false); } };
  /* Opens the app and goes to Accounts through the real navigation. */
  async function open(width, { query = "", height = 900, stay = false, walletView = "list", maribankConcept = false, mayaConcept = false, generatedConcepts = false, bdoConcept = false, bdoDebitConcept = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    if (maribankConcept) await ctx.addInitScript(() => localStorage.setItem("monikey.walletPreferences", JSON.stringify({ version: 1, byAccountId: { "2": { artworkId: "concept-maribank-generated" } } })));
    if (mayaConcept) await ctx.addInitScript(() => localStorage.setItem("monikey.walletPreferences", JSON.stringify({ version: 1, byAccountId: { "4": { artworkId: "concept-maya-visa-platinum-generated" } } })));
    if (generatedConcepts) await ctx.addInitScript(() => localStorage.setItem("monikey.walletPreferences", JSON.stringify({ version: 1, byAccountId: {
      "2": { artworkId: "concept-gotyme-visa-generated" },
      "3": { artworkId: "concept-gcash-visa-debit-generated" },
      "4": { artworkId: "concept-unionbank-rewards-visa-platinum-generated" },
      "5": { artworkId: "concept-atome-credit-card-black-generated" },
    } })));
    if (bdoConcept) await ctx.addInitScript(() => localStorage.setItem("monikey.walletPreferences", JSON.stringify({ version: 1, byAccountId: { "5": { artworkId: "concept-bdo-visa-generated" } } })));
    if (bdoDebitConcept) await ctx.addInitScript(() => localStorage.setItem("monikey.walletPreferences", JSON.stringify({ version: 1, byAccountId: { "2": { artworkId: "concept-bdo-debit-mastercard-generated" } } })));
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`pageerror@${width}${query}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}@${width}${query}: ${m.text().slice(0, 140)}`); });
    page.on("request", r => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith("data:")) external.push(u); });
    await page.goto(BASE + query); await page.evaluate(() => document.fonts.ready);
    page.W = width; page.big = width >= 768;
    if (!stay) {
      await nav(page, "Accounts");
      await page.getByRole("group", { name: "Account display" }).getByRole("button", { name: walletView === "cards" ? "Cards" : "List" }).click();
    }
    return page;
  }
  const nav = async (p, name) => { await p.locator(`nav[aria-label="Main"] >> visible=true >> button:has-text("${name}")`).first().click(); await p.waitForTimeout(100); };
  // List view keeps the two sections; Cards view shows one grid (liquid accounts first, then credit cards).
  const R = { have: '[aria-labelledby="money-you-have-title"]', owe: '[aria-labelledby="money-you-owe-title"]', grid: '[aria-labelledby="all-accounts-title"]' };
  const read = async p => p.evaluate(() => {
    const t = e => e.innerText.trim().replace(/\s+/g, " "); // visible text, so adjacent blocks are separated
    const have = document.querySelector('[aria-labelledby="money-you-have-title"]');
    const owe = document.querySelector('[aria-labelledby="money-you-owe-title"]');
    return {
      title: document.querySelector("h1")?.textContent,
      haveHeading: have && t(have.querySelector("h2")), haveTotal: have && t(have.querySelector("h2").nextElementSibling),
      rows: have ? [...have.querySelectorAll("li")].map(t) : [],
      haveText: have ? t(have) : "",
      oweHeading: owe && t(owe.querySelector("h2")), oweTotal: owe && t(owe.querySelector("h2").parentElement),
      oweText: owe ? t(owe) : "",
      cardCards: owe ? [...owe.querySelectorAll('[role="img"]')].map(e => e.closest("[class*=rounded-card]") && t(e.closest("[class*=rounded-card]"))) : [],
      noNaN: !/NaN|undefined|Infinity/.test(document.body.innerText),
    };
  });
  const countVisible = (p, text) => p.evaluate(text => [...document.querySelectorAll("button")].filter(b => { const r = b.getBoundingClientRect(); const s = getComputedStyle(b); return new RegExp(text).test(b.textContent + (b.getAttribute("aria-label") || "")) && r.width > 0 && r.height > 0 && s.display !== "none"; }).length, text);

  /* ------------------------------------------------ wallet gallery */
  group = "Wallet gallery and list toggle";
  await safe(async () => {
    const p = await open(1280, { walletView: "cards" });
    const haveCards = p.locator(`${R.grid} ul > li:nth-child(-n+3)`);
    const oweCards = p.locator(`${R.grid} ul > li:nth-child(n+4)`);
    eq("Cards view keeps the same three liquid accounts", await haveCards.count(), 3);
    eq("Cards view keeps both credit cards", await oweCards.count(), 2);
    const faceSizes = await p.evaluate(({ grid }) => ["1", "4"].map(n => {
      const rect = document.querySelector(`${grid} ul > li:nth-child(${n}) button[aria-label^="View details for"]`).parentElement.getBoundingClientRect();
      return [Math.round(rect.width), Math.round(rect.height)];
    }), R);
    check("all card types use the same Maya-sized face", faceSizes[0][0] === faceSizes[1][0] && faceSizes[0][1] === faceSizes[1][1], JSON.stringify(faceSizes));
    const gridText = (await p.locator(R.grid).innerText()).replace(/\s+/g, " ");
    check("Cards view mixes every account in one grid, with no type captions under the cards", /Cash on hand/.test(gridText) && /Blue Card/.test(gridText) && !/Bank account|Credit card|E-wallet/.test(gridText), gridText);
    const faceText = await p.evaluate(({ grid }) => {
      const text = element => element?.innerText.replace(/\s+/g, " ") || "";
      return {
        cash: text(document.querySelector(`${grid} li:nth-child(1) button[aria-label^="View details for"]`)),
        card: text(document.querySelector(`${grid} li:nth-child(4) button[aria-label^="View details for"]`)),
      };
    }, R);
    check("the MoniKey card carries its account name and the balance bottom-left", /Cash on hand Balance ₱2,350\.00/i.test(faceText.cash), faceText.cash);
    check("credit-card face shows available credit, the limit line, and the share used", /Blue Card Available credit ₱35,750\.00 29% used/i.test(faceText.card), faceText.card);
    check("credit-card face names available credit, share used and limit for screen readers", await oweCards.nth(0).getByRole("button", { name: /Available credit ₱35,750\.00, 29% used, ₱50,000\.00 limit/ }).count() === 1);
    const banner = (await p.locator("#net-position-title").locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]").innerText()).replace(/\s+/g, " ");
    check("net-position banner shows net, money you have and money you owe", /Net position ₱[\d,.]+/.test(banner) && /Money you have ₱54,196\.25/.test(banner) && /Money you owe ₱21,050\.00 owed/.test(banner), banner);
    const lineRatio = await oweCards.nth(0).locator('button[aria-label^="View details for"] [aria-hidden="true"] > span').evaluate(fill => fill.getBoundingClientRect().width / fill.parentElement.getBoundingClientRect().width);
    check("credit-card limit line fills to the owed share of the limit (28.5%)", Math.abs(lineRatio - 0.285) < 0.02, lineRatio.toFixed(3));
    const menu = haveCards.nth(0).locator('summary[aria-label="Card actions for Cash on hand"]');
    await menu.click();
    check("three-dot card menu retains the existing edit action", await haveCards.nth(0).getByRole("button", { name: "Edit account" }).isVisible());
    await p.keyboard.press("Escape");
    const detailButton = haveCards.nth(1).getByRole("button", { name: /View details for Main Savings/ });
    await detailButton.click();
    const details = p.getByRole("dialog");
    check("clicking a card opens full account details", /Main Savings/.test(await details.innerText()) && /Bank account/.test(await details.innerText()) && /₱48,725\.50/.test(await details.innerText()));
    await p.keyboard.press("Escape");
    // Radix can move focus back one frame after the dialog closes, so wait for it instead of reading it instantly.
    const focusBack = await detailButton.evaluate(el => new Promise(done => { const end = Date.now() + 1000; const tick = () => document.activeElement === el ? done(true) : Date.now() > end ? done(false) : requestAnimationFrame(tick); tick(); }));
    check("Escape closes details and restores focus to the card", focusBack);
    await oweCards.nth(0).locator('summary[aria-label="Card actions for Blue Card"]').click();
    check("credit card menu retains its existing Pay card action", await p.getByRole("button", { name: "Pay card" }).isEnabled());
    await p.getByRole("group", { name: "Account display" }).getByRole("button", { name: "List" }).click();
    const listed = (await p.locator(R.have).innerText()).replace(/\s+/g, " ");
    check("List returns to the existing account rows without changing amounts", /Main Savings.*₱48,725\.50/.test(listed) && /GCash.*₱3,120\.75/.test(listed));
    await p.context().close();
  });

  group = "Maya Visa Platinum concept on a credit card";
  await safe(async () => {
    const p = await open(1280, { walletView: "cards", mayaConcept: true });
    const blueCard = p.locator(`${R.grid} ul > li`).nth(3);
    const face = blueCard.getByRole("button", { name: /View details for Blue Card/ });
    const faceText = (await face.innerText()).replace(/\s+/g, " ");
    check("Maya card face shows available credit and share used, not the account name", /Available credit ₱35,750\.00 29% used/i.test(faceText) && !/Blue Card/.test(faceText), faceText);
    const dimensions = await face.locator("xpath=..").locator("img").evaluate(img => ({ complete: img.complete, width: img.naturalWidth, height: img.naturalHeight }));
    check("generated Maya asset loads without cropping the card frame", dimensions.complete && dimensions.width >= 1000 && dimensions.height >= 600, JSON.stringify(dimensions));
    check("a card with artwork shows no name caption (the name is in its details)", !/Blue Card/.test(await blueCard.innerText()));
    await face.click();
    const dialog = p.getByRole("dialog");
    check("Maya card details show name, type, available credit and limit", /Blue Card/.test(await dialog.innerText()) && /Credit card/.test(await dialog.innerText()) && /₱35,750\.00/.test(await dialog.innerText()) && /₱50,000\.00/.test(await dialog.innerText()));
    await p.keyboard.press("Escape");
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "accounts-maya-card-face.png"), fullPage: true });
    await p.context().close();
  });

  group = "Concept account details on the card face";
  await safe(async () => {
    const p = await open(1280, { walletView: "cards", maribankConcept: true });
    const mainSavings = p.locator(`${R.grid} ul > li`).nth(1);
    const face = mainSavings.getByRole("button", { name: /View details for Main Savings/ });
    const faceText = (await face.innerText()).replace(/\s+/g, " ");
    check("MariBank card face shows the balance at bottom-left without the account name", /Balance ₱48,725\.50/i.test(faceText) && !/Main Savings/.test(faceText), faceText);
    check("a card with artwork shows no name or type caption", !/Main Savings|Bank account/.test(await mainSavings.innerText()));
    await face.click();
    check("MariBank details appear in the popup", /Main Savings/.test(await p.getByRole("dialog").innerText()) && /Bank account/.test(await p.getByRole("dialog").innerText()) && /₱48,725\.50/.test(await p.getByRole("dialog").innerText()));
    await p.keyboard.press("Escape");
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "accounts-maribank-card-face.png"), fullPage: true });
    await p.context().close();
  });

  group = "Generated bank and credit-card concepts";
  await safe(async () => {
    const p = await open(1280, { walletView: "cards", generatedConcepts: true });
    const checks = [
      { index: 1, name: "Main Savings", amount: "₱48,725.50", src: "/card-art/generated/gotyme-visa-debit.webp" },
      { index: 2, name: "GCash", amount: "₱3,120.75", src: "/card-art/generated/gcash-visa.webp" },
      { index: 3, name: "Blue Card", amount: "₱35,750.00", src: "/card-art/generated/unionbank-rewards-visa-platinum.webp" },
      { index: 4, name: "Everyday Card", amount: "₱23,200.00", src: "/card-art/generated/atome-credit-black.webp" },
    ];
    for (const item of checks) {
      const account = p.locator(`${R.grid} ul > li`).nth(item.index);
      const face = account.getByRole("button", { name: new RegExp(`View details for ${item.name}`) });
      const img = face.locator("xpath=..").locator("img");
      const dimensions = await img.evaluate(image => ({ src: new URL(image.src).pathname, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }));
      check(`${item.name} uses its local generated concept`, dimensions.src === item.src && dimensions.complete && dimensions.width >= 1000 && dimensions.height >= 600, JSON.stringify(dimensions));
      const faceText = (await face.innerText()).replace(/\s+/g, " ");
      check(`${item.name} face keeps the current amount visible without its account name`, faceText.includes(item.amount) && !faceText.includes(item.name), faceText);
      check(`${item.name} shows no name caption under its artwork`, !new RegExp(item.name).test(await account.innerText()));
    }
    const values = await p.evaluate(() => [...document.querySelectorAll('[aria-labelledby="all-accounts-title"] li')].map(item => item.innerText.replace(/\s+/g, " ")));
    check("concept selection preserves account amounts and credit details", /₱48,725\.50/.test(values[1]) && /₱3,120\.75/.test(values[2]) && /₱35,750\.00 29% used/i.test(values[3]) && /₱23,200\.00 23% used/i.test(values[4]), values.join(" | "));
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "accounts-generated-concepts.png"), fullPage: true });
    await p.context().close();

    const bdo = await open(1280, { walletView: "cards", bdoConcept: true });
    const everyday = bdo.locator(`${R.grid} ul > li`).nth(4);
    const bdoImage = await everyday.getByRole("button", { name: /View details for Everyday Card/ }).locator("xpath=..").locator("img").evaluate(image => ({ src: new URL(image.src).pathname, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }));
    check("Everyday Card can use the local BDO concept and preserves its balance", bdoImage.src === "/card-art/generated/bdo-visa-classic.webp" && bdoImage.complete && bdoImage.width >= 1000 && /₱23,200\.00/.test(await everyday.innerText()), JSON.stringify(bdoImage));
    if (SHOTS) await bdo.screenshot({ path: path.join(SHOTS, "accounts-bdo-concept.png"), fullPage: true });
    await bdo.context().close();

    const debit = await open(1280, { walletView: "cards", bdoDebitConcept: true });
    const main = debit.locator(`${R.grid} ul > li`).nth(1);
    const debitImage = await main.getByRole("button", { name: /View details for Main Savings/ }).locator("xpath=..").locator("img").evaluate(image => ({ src: new URL(image.src).pathname, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }));
    check("Main Savings can use the local BDO debit concept and preserves its balance", debitImage.src === "/card-art/generated/bdo-debit-mastercard.webp" && debitImage.complete && debitImage.width >= 1000 && /₱48,725\.50/.test(await main.innerText()), JSON.stringify(debitImage));
    if (SHOTS) await debit.screenshot({ path: path.join(SHOTS, "accounts-bdo-debit-concept.png"), fullPage: true });
    await debit.context().close();
  });

  /* ------------------------------------------------ values */
  group = "Accounts values (default ledger)";
  await safe(async () => {
    const p = await open(1280); const f = await read(p);
    eq("page title is a single h1 'Accounts'", f.title, "Accounts");
    eq("section 1 heading", f.haveHeading, "Money you have"); eq("section 1 subtotal", f.haveTotal, "₱54,196.25");
    check("rows in order Cash → Bank → E-wallet", f.rows.length === 3 && /^Cash on hand Cash/.test(f.rows[0]) && /^Main Savings Bank account/.test(f.rows[1]) && /^GCash E-wallet/.test(f.rows[2]), f.rows.join(" | "));
    check("balances: ₱2,350.00 / ₱48,725.50 / ₱3,120.75", /₱2,350\.00$/.test(f.rows[0]) && /₱48,725\.50$/.test(f.rows[1]) && /₱3,120\.75$/.test(f.rows[2]));
    check("rows add up to the subtotal (₱2,350.00 + ₱48,725.50 + ₱3,120.75 = ₱54,196.25)", 235000 + 4872550 + 312075 === 5419625);
    check("no credit card appears in 'Money you have'", !/Card/.test(f.haveText.replace("Cash, bank and e-wallet balances", "")), f.haveText.slice(0, 120));
    eq("section 2 heading", f.oweHeading, "Money you owe");
    check("section 2 subtotal is '₱21,050.00 owed'", /₱21,050\.00 owed/.test(f.oweTotal), f.oweTotal);
    check("caption: available credit isn't cash and isn't part of your total money", /Available credit isn.t cash and isn.t part of your total money\./.test(f.oweText));
    check("Blue Card ₱14,250.00 owed · ₱35,750.00 available · Limit ₱50,000.00", /Blue Card ₱14,250\.00 owed .*₱35,750\.00 available Limit ₱50,000\.00/.test(f.oweText), f.oweText.slice(0, 260));
    check("Everyday Card ₱6,800.00 owed · ₱23,200.00 available · Limit ₱30,000.00", /Everyday Card ₱6,800\.00 owed .*₱23,200\.00 available Limit ₱30,000\.00/.test(f.oweText));
    check("a dashed '+ Add credit card' slot ends the section", await p.locator(`${R.owe} button:has-text("Add credit card")`).isVisible());
    check("the two sections use different headings, icons and the word 'owed' (separation without colour alone)", /owed/.test(f.oweTotal) && !/owed/.test(f.haveTotal) && (await p.locator(`${R.have} svg`).count()) >= 3 && (await p.locator(`${R.owe} [role=img]`).count()) === 2);
    check("no NaN / undefined anywhere", f.noNaN);
    // consistent with Overview
    await nav(p, "Overview");
    const o = await p.evaluate(() => [...document.querySelectorAll('section[aria-labelledby="net-position-label"] span.block')].map(e => e.textContent.trim()));
    check("Overview 'Money you have' and 'Card debt' equal the Accounts subtotals", o[1] === "₱54,196.25" && o[2] === "₱21,050.00", o.join(" / "));
    await p.context().close();
  });

  for (const W of [320, 360, 375, 768, 1024, 1280, 1440]) {
    group = `Wallet gallery layout ${W}px`;
    await safe(async () => {
      const p = await open(W, { walletView: "cards", height: W < 768 ? 800 : 900 });
      const metrics = await p.evaluate(() => {
        const visible = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== "none"; };
        const images = [...document.querySelectorAll('[aria-labelledby="all-accounts-title"] img')];
        const smallControls = [...document.querySelectorAll('[aria-label="Account display"] button, [aria-labelledby="all-accounts-title"] li button, [aria-labelledby="all-accounts-title"] li summary')]
          .filter(visible)
          .filter(e => e.getBoundingClientRect().height < 43.5)
          .map(e => e.textContent.trim().slice(0, 20));
        return {
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          imageCount: images.length,
          imagesHaveSize: images.every(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
          smallControls,
        };
      });
      check("no horizontal overflow", metrics.scrollWidth <= metrics.viewportWidth, `${metrics.scrollWidth} / ${metrics.viewportWidth}`);
      eq("all five fictional accounts render artwork", metrics.imageCount, 5);
      check("card artwork has visible dimensions", metrics.imagesHaveSize);
      check("phone controls meet 44px targets", W >= 768 || metrics.smallControls.length === 0, metrics.smallControls.join(", ") || "ok");
      await p.context().close();
    });
  }

  group = "Add account card picker";
  await safe(async () => {
    const p = await open(390, { walletView: "cards" });
    await p.getByRole("button", { name: "Add account" }).first().click();
    const dialog = p.getByRole("dialog");
    await dialog.locator("label", { hasText: /^Card$/ }).click();
    eq("credit cards offer each issuer plus Other", await dialog.locator('input[name="aa-issuer"]').count(), 6);
    await dialog.locator("label", { hasText: /^BDO$/ }).click();
    eq("BDO lists all four of its credit cards", await dialog.locator('input[name="aa-card-product"]').count(), 4);
    await dialog.locator("label", { hasText: "BDO Visa Classic" }).click();
    eq("picking a card fills an empty name", await p.locator("#aa-name").inputValue(), "BDO Visa Classic");
    check("card designs are labeled as demo images", /demo images, not official issuer artwork/.test(await dialog.innerText()));
    await dialog.locator("label", { hasText: /^Bank$/ }).first().click();
    eq("changing type clears the filled-in name", await p.locator("#aa-name").inputValue(), "");
    await dialog.locator("label", { hasText: /^MariBank$/ }).click();
    eq("a provider with one card selects it straight away", await dialog.locator('input[name="aa-card-product"]:checked').getAttribute("value"), "maribank-debit");
    await p.locator("#aa-balance").fill("1500.00");
    await dialog.locator('button[type="submit"]').click();
    await p.waitForFunction(() => document.querySelector("#aa-balance") === null);
    const added = p.locator(`${R.grid} ul > li`, { has: p.locator('summary[aria-label="Card actions for MariBank Debit Card"]') });
    const src = await added.locator("img").first().evaluate(img => new URL(img.src).pathname);
    eq("the new account shows the chosen card design", src, "/card-art/generated/maribank-debit.webp");
    await added.locator('summary[aria-label^="Card actions for"]').click();
    await added.getByRole("button", { name: "Edit account" }).click();
    await p.locator("#aa-name").waitFor();
    const editText = await p.getByRole("dialog").innerText();
    check("Edit preselects the account's provider and card", await p.locator('input[name="aa-issuer"]:checked').getAttribute("value") === "MariBank" && await p.locator('input[name="aa-card-product"]:checked').getAttribute("value") === "maribank-debit", editText.slice(0, 200));
    await p.getByRole("dialog").locator("label", { hasText: /^GoTyme$/ }).click();
    eq("changing the provider in Edit keeps the typed name", await p.locator("#aa-name").inputValue(), "MariBank Debit Card");
    await p.getByRole("button", { name: "Save changes" }).click();
    await p.waitForFunction(() => document.querySelector("#aa-name") === null);
    const changed = await added.locator("img").first().evaluate(img => new URL(img.src).pathname);
    eq("an existing account's card can be changed in Edit", changed, "/card-art/generated/gotyme-visa-debit.webp");
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "accounts-add-card-picker.png"), fullPage: true });
    await p.context().close();
  });

  /* ------------------------------------------------ layout */
  for (const W of [360, 375, 768, 1280]) {
    group = `Accounts layout ${W}px`;
    await safe(async () => {
      const p = await open(W, { height: W >= 768 ? 900 : 800, walletView: "cards" });
      const m = await p.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== "none"; };
        const rect = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right) }; };
        const banner = rect(document.querySelector("#net-position-title").closest("[class*=rounded-card]"));
        const grid = rect(document.querySelector('[aria-labelledby="all-accounts-title"]'));
        const h1 = rect(document.querySelector("h1"));
        const addAcct = [...document.querySelectorAll("button")].filter(b => /^Add account$/.test(b.textContent.trim()) && vis(b)).map(rect);
        const bad = []; document.querySelectorAll("main li *, main section *, main [role=region] *").forEach(e => { if (!vis(e) || e.children.length || !/₱/.test(e.textContent)) return; const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3, r = e.getBoundingClientRect(), box = (e.closest("[class*=rounded-card]") || e.closest("li")).getBoundingClientRect(); if (e.tagName === "SPAN" || e.tagName === "DIV") { if (r.height > lh * 1.6 && /^₱|^−₱/.test(e.textContent.trim()) && e.textContent.trim().length < 16) bad.push("wraps: " + e.textContent.trim()); if (r.right > box.right + 0.5) bad.push("overflows: " + e.textContent.trim()); } });
        const small = [...document.querySelectorAll("main button, nav button")].filter(e => vis(e) && e.getBoundingClientRect().height < 43.5).map(e => e.textContent.trim().slice(0, 16));
        const mainSavings = document.querySelector('[aria-labelledby="all-accounts-title"] ul > li:nth-child(2)');
        const mainSavingsArt = mainSavings?.querySelector('button[aria-label^="View details for"]')?.parentElement;
        return { sw: document.documentElement.scrollWidth, iw: innerWidth, banner, grid, h1, addAcct, bad, small, mainRight: Math.round(document.querySelector("main > div").getBoundingClientRect().right), mainW: Math.round(document.querySelector("main > div").getBoundingClientRect().width), artW: mainSavingsArt ? Math.round(mainSavingsArt.getBoundingClientRect().width) : 0, primaries: [...document.querySelectorAll("button")].filter(b => vis(b) && getComputedStyle(b).backgroundColor === "rgb(29, 95, 214)").length };
      });
      check("no horizontal overflow", m.sw <= m.iw, `scrollWidth ${m.sw} / viewport ${m.iw}`);
      eq("exactly one visible 'Add account' button (no duplicate)", m.addAcct.length, 1);
      if (W < 768) {
        eq("only the bottom-bar Add shows (no header Add transaction)", await countVisible(p, "Add transaction"), 1);
        check("Add account sits on its own row under the title, right-aligned", m.addAcct[0].y > m.h1.y + m.h1.h && Math.abs(m.addAcct[0].r - m.mainRight) <= 1, `button y ${m.addAcct[0].y} vs title bottom ${m.h1.y + m.h1.h}; right ${m.addAcct[0].r} vs ${m.mainRight}`);
      } else {
        eq("exactly one header 'Add transaction' button", await countVisible(p, "Add transaction"), 1);
        check("Add account is in the header on the same row as the title", Math.abs(m.addAcct[0].y + m.addAcct[0].h / 2 - (m.h1.y + m.h1.h / 2)) < 30, `button y ${m.addAcct[0].y}, title y ${m.h1.y}`);
      }
      eq("one filled primary action visible", m.primaries, 1);
      check("peso amounts stay on one line and inside their card", m.bad.length === 0, m.bad.join("; ") || "ok");
      check("touch targets ≥44px high below 768px", W >= 768 || m.small.length === 0, m.small.join(", ") || "ok");
      check("net-position banner sits above the full-width card grid", m.banner.y < m.grid.y && Math.abs(m.banner.w - m.mainW) <= 1 && Math.abs(m.grid.w - m.mainW) <= 1, JSON.stringify({ banner: m.banner, grid: m.grid, mainW: m.mainW }));
      check("card size suits the column count (4 at 1280, 2 at 768, 1 on phones)", m.artW >= (W >= 1280 ? 200 : W >= 768 ? 250 : 280), `artwork width ${m.artW}px at ${W}px viewport`);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `accounts-${W}.png`), fullPage: true });
      await p.context().close();
    });
  }

  /* ------------------------------------------------ card states */
  group = "Card states (demo scenarios)";
  await safe(async () => {
    let p = await open(1280, { query: "?demo=paid-off" }); let f = await read(p);
    check("paid off: 'nothing owed' with ₱0.00 and the whole limit available", /Blue Card ₱0\.00 nothing owed/.test(f.oweText) && /₱50,000\.00 available Limit ₱50,000\.00/.test(f.oweText), f.oweText.slice(0, 200));
    check("paid off: Pay card is disabled and says 'Nothing to pay'", await p.getByRole("button", { name: "Pay card, Blue Card" }).isDisabled() && /Nothing to pay/.test(f.oweText));
    check("paid off: the owed subtotal drops to ₱6,800.00", /₱6,800\.00 owed/.test(f.oweTotal), f.oweTotal);
    await p.context().close();
    p = await open(1280, { query: "?demo=overpaid" }); f = await read(p);
    check("overpaid: 'card credit ₱13,200.00', not 'owed'", /Everyday Card ₱13,200\.00 card credit/.test(f.oweText), f.oweText.slice(0, 260));
    check("overpaid: Pay card disabled with 'No debt to pay'", await p.getByRole("button", { name: "Pay card, Everyday Card" }).isDisabled() && /No debt to pay/.test(f.oweText));
    check("overpaid: subtotal counts only what is still owed (₱14,250.00 owed)", /₱14,250\.00 owed/.test(f.oweTotal), f.oweTotal);
    check("overpaid: the track is empty and its text says ₱0.00 used", await p.locator(`${R.owe} [role=img]`).nth(1).getAttribute("aria-label") === "₱0.00 of ₱30,000.00 limit used");
    check("overpaid: Main Savings fell by the payment (₱28,725.50) and money you have is ₱34,196.25", /Main Savings Bank account ₱28,725\.50/.test(f.haveText) && f.haveTotal === "₱34,196.25", f.haveTotal);
    await p.context().close();
    p = await open(1280, { query: "?demo=over-limit" }); f = await read(p);
    check("over limit: 'No credit available' and 'Over your limit'", /Everyday Card ₱36,800\.00 owed No credit available Limit ₱30,000\.00 · Over your limit/.test(f.oweText), f.oweText.slice(f.oweText.indexOf("Everyday")).slice(0, 200));
    check("over limit: the track is full (100%)", await p.locator(`${R.owe} [role=img] > div`).nth(1).evaluate(e => e.style.width) === "100%");
    check("over limit: Pay card is still enabled (there is debt to pay)", await p.getByRole("button", { name: "Pay card, Everyday Card" }).isEnabled());
    await p.getByRole("group", { name: "Account display" }).getByRole("button", { name: "Cards" }).click();
    const everydayCard = p.locator(`${R.grid} ul > li`).nth(4);
    const everydayFaceButton = everydayCard.getByRole("button", { name: /View details for Everyday Card/ });
    const everydayFace = everydayFaceButton;
    let everydayFaceText = (await everydayFace.innerText()).replace(/\s+/g, " ");
    let everydayCardText = (await everydayCard.innerText()).replace(/\s+/g, " ");
    check("over-limit face says how far over the limit it is and the share used", /Everyday Card Over limit by ₱6,800\.00 123% used/i.test(everydayFaceText), everydayFaceText);
    await everydayCard.locator('summary[aria-label="Card actions for Everyday Card"]').click();
    await everydayCard.getByRole("button", { name: "Edit account" }).click();
    await p.locator("#aa-owed").waitFor();
    await p.locator("#aa-owed").fill("30000.00");
    await p.getByRole("button", { name: "Save changes" }).click();
    await p.waitForFunction(() => document.querySelector("#aa-owed") === null);
    await p.waitForTimeout(150);
    everydayFaceText = (await everydayFace.innerText()).replace(/\s+/g, " ");
    everydayCardText = (await everydayCard.innerText()).replace(/\s+/g, " ");
    check("a card at its limit shows ₱0.00 available and 100% used", /Available credit ₱0\.00 100% used/i.test(everydayFaceText), everydayFaceText);
    check("a card at its limit is not called over the limit", !/Over limit/i.test(everydayCardText), everydayCardText);
    await p.context().close();
    p = await open(1280, { query: "?demo=negative" }); f = await read(p);
    check("negative: GCash shows −₱879.25 with a 'Below zero' flag", /^GCash E-wallet Below zero −₱879\.25$/.test(f.rows[2]), f.rows[2]);
    check("negative: money you have is ₱50,196.25 and the other rows are unflagged", f.haveTotal === "₱50,196.25" && f.rows.filter(r => /Below zero/.test(r)).length === 1, f.haveTotal);
    await p.context().close();
  });

  /* ------------------------------------------------ first run + loading */
  for (const W of [375, 1280]) {
    group = `First run and loading at ${W}px`;
    await safe(async () => {
      let p = await open(W, { query: "?demo=no-accounts" }); const f = await read(p);
      check("no accounts: dashed 'Add your first cash, bank or e-wallet account.' with an Add account button", /Add your first cash, bank or e-wallet account\./.test(f.haveText) && await p.locator(`${R.have} button:has-text("Add account")`).isVisible());
      check("no accounts: 'No credit cards yet.' with an Add credit card button and no dashed slot below", /No credit cards yet\./.test(f.oweText) && (await p.locator(`${R.owe} button:has-text("Add credit card")`).count()) === 1);
      check("no accounts: subtotals are ₱0.00 and ₱0.00 owed", f.haveTotal === "₱0.00" && /₱0\.00 owed/.test(f.oweTotal), `${f.haveTotal} / ${f.oweTotal}`);
      const hdr = W < 768 ? p.getByRole("button", { name: "Add transaction (add an account first)" }) : p.locator("main").getByRole("button", { name: "Add an account first" });
      check("no accounts: Add transaction is disabled with a visible reason", await hdr.isDisabled());
      eq("no accounts: Add account is the only filled primary action", await p.evaluate(() => [...document.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0 && getComputedStyle(b).backgroundColor === "rgb(29, 95, 214)").length), 1);
      check("no accounts: no horizontal overflow", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (SHOTS && W === 375) await p.screenshot({ path: path.join(SHOTS, `accounts-firstrun-${W}.png`), fullPage: true });
      await p.context().close();
      p = await open(W, { query: "?demo=loading" });
      eq("loading: region is busy", await p.locator("main div[aria-busy]").first().getAttribute("aria-busy"), "true");
      check("loading: screen readers are told", /Loading your accounts/.test(await p.locator("p[role=status]").innerText()));
      const t = await p.locator("main").innerText();
      check("loading: headings and captions show at once, no amounts", ["Money you have", "Money you owe", "Cash, bank and e-wallet balances"].every(s => t.includes(s)) && !/₱\d/.test(t), t.match(/₱[\d,.]+/g)?.join(" ") || "no amounts");
      check("loading: no horizontal overflow", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (SHOTS && W === 375) await p.screenshot({ path: path.join(SHOTS, `accounts-loading-${W}.png`), fullPage: true });
      await p.context().close();
    });
  }

  /* ------------------------------------------------ dialogs, keyboard, semantics */
  group = "Dialogs and keyboard";
  for (const W of [375, 1280]) await safe(async () => {
    const p = await open(W, { height: 800 });
    const opens = async (name, title, regex) => {
      const btn = p.getByRole("button", { name }).first(); const h = await btn.elementHandle(); await btn.focus(); await p.keyboard.press("Enter"); await p.waitForSelector('[role="dialog"]');
      const ok = (await p.locator('[role="dialog"] h2').innerText()) === title && regex.test(await p.locator('[role="dialog"]').innerText());
      await p.keyboard.press("Escape"); await p.waitForTimeout(100);
      check(`${W}px: '${name}' opens '${title}'; Escape returns focus to that exact button`, ok && await p.evaluate(el => document.activeElement === el, h));
    };
    await opens("Pay card, Blue Card", "Pay credit card", /Blue Card/);
    await opens("Pay card, Everyday Card", "Pay credit card", /Everyday Card/);
    await opens("Add credit card", "Add account", /Credit limit/);
    await opens(W < 768 ? "Add account" : "Add account", "Add account", /Current balance/);
    await p.context().close();
  });
  await safe(async () => {
    const p = await open(1280, { stay: true });
    await p.locator('nav[aria-label="Main"] >> visible=true >> button:has-text("Accounts")').first().focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    eq("keyboard: Enter on 'Accounts' moves focus to the h1", await p.evaluate(() => document.activeElement === document.querySelector("h1") && document.querySelector("h1").textContent), "Accounts");
    const seq = []; for (let i = 0; i < 7; i++) { await p.keyboard.press("Tab"); seq.push(await p.evaluate(() => { const e = document.activeElement; return (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().replace(/\s+/g, " ").slice(0, 22); })); }
    check("(info) Tab order from the page title", true, seq.join(" → "));
    const ring = await p.evaluate(() => { const c = getComputedStyle(document.activeElement); return `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor}`; });
    check("focused controls show the 2px focus ring", ring === "2px solid rgb(29, 95, 214)", ring);
    await p.context().close();
  });
  group = "Accounts semantics";
  await safe(async () => {
    const p = await open(1280);
    const s = await p.evaluate(() => ({
      h1: document.querySelectorAll("h1").length, unnamed: [...document.querySelectorAll("button, select")].filter(e => e.getBoundingClientRect().width > 0 && !((e.getAttribute("aria-label") || e.textContent || "").trim())).length,
      regions: [...document.querySelectorAll("main [role=region], main section[aria-labelledby]")].map(e => document.getElementById(e.getAttribute("aria-labelledby"))?.textContent),
      tracks: [...document.querySelectorAll("[role=img]")].map(e => e.getAttribute("aria-label")),
      lists: document.querySelectorAll("main ul").length, bad: [...document.querySelectorAll("*")].filter(e => /gradient/.test(getComputedStyle(e).backgroundImage.replace(/url\([^)]*\)/g, "")) || getComputedStyle(e).backdropFilter !== "none").length,
      mutedAvail: getComputedStyle([...document.querySelectorAll("main *")].find(e => /available$/.test(e.textContent.trim()) && e.children.length === 0)).color,
    }));
    eq("one h1", s.h1, 1); eq("every visible button has an accessible name", s.unnamed, 0);
    check("each section is a labelled region", s.regions.join() === "Money you have,Money you owe", s.regions.join());
    check("limit tracks have text equivalents", s.tracks.join() === "₱14,250.00 of ₱50,000.00 limit used,₱6,800.00 of ₱30,000.00 limit used", s.tracks.join(" | "));
    eq("account rows are a real list", s.lists, 1); eq("no gradients or backdrop blur", s.bad, 0);
    check("'available' credit is plain ink text, not a positive/income colour", s.mutedAvail === "rgb(27, 29, 31)", s.mutedAvail);
    await p.context().close();
  });

  /* ------------------------------------------------ comparison with the approved mock */
  group = "Comparison with the approved HTML mock (measured, not pass/fail)";
  await safe(async () => {
    for (const W of [375, 1280]) {
      const p = await open(W, { height: 900 }); const mock = await (await browser.newContext({ viewport: { width: W, height: 900 } })).newPage();
      await mock.goto(MOCK); await mock.evaluate(() => document.fonts.ready); await mock.evaluate(() => document.querySelector('[data-view="accounts"]:not([style*="none"])') && 0);
      await mock.locator('[data-view="accounts"]:visible').first().click(); await mock.waitForTimeout(100);
      const react = await p.evaluate(() => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }; return { have: r('[aria-labelledby="money-you-have-title"]'), owe: r('[aria-labelledby="money-you-owe-title"]'), cards: [...document.querySelectorAll('[aria-labelledby="money-you-owe-title"] [role=img]')].map(e => { const b = e.closest("[class*=rounded-card]").getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }) }; });
      const mk = await mock.evaluate(() => { const r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }; const sec = [...document.querySelectorAll("#v-accounts .acc > section")]; return { have: r(sec[0].querySelector(".card")), owe: r(sec[1]), cards: [...sec[1].querySelectorAll(".track")].map(t => r(t.closest(".card"))) }; });
      check(`${W}px Money you have card (w×h), React vs mock`, true, `React ${react.have.join("×")} · mock ${mk.have.join("×")} · Δ ${react.have[0] - mk.have[0]}×${react.have[1] - mk.have[1]}`);
      check(`${W}px Money you owe section (w×h), React vs mock`, true, `React ${react.owe.join("×")} · mock ${mk.owe.join("×")} · Δ ${react.owe[0] - mk.owe[0]}×${react.owe[1] - mk.owe[1]}`);
      check(`${W}px credit card tiles (w×h), React vs mock`, true, `React ${react.cards.map(c => c.join("×")).join(", ")} · mock ${mk.cards.map(c => c.join("×")).join(", ")}`);
      await p.context().close(); await mock.context().close();
    }
  });

  check("no request left the page's own origin", external.length === 0, external.length ? external.slice(0, 3).join(", ") : "all requests same-origin");
  check("no console errors or warnings, no uncaught exceptions", errors.length === 0, errors.slice(0, 3).join(" || ") || "none");

  await browser.close();
  const pass = results.filter(r => r.ok).length; let g = "";
  for (const r of results) { if (r.group !== g) { g = r.group; console.log(`\n## ${g}`); } console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  —  " + r.detail : ""}`); }
  console.log(`\nTOTAL ${pass}/${results.length} passed, ${results.length - pass} failed`);
  fs.writeFileSync(process.env.RESULTS_JSON || path.join(os.tmpdir(), "monikey-accounts-verify.json"), JSON.stringify(results, null, 1));
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
