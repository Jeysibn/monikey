const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5175/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const links = await page.$$eval('a, button, [role="tab"], nav *', els =>
    els.filter(e => e.offsetParent !== null).map(e => ({
      tag: e.tagName, text: (e.textContent||'').trim().slice(0,40), href: e.getAttribute('href')
    })).filter(x => x.text)
  );
  console.log(JSON.stringify(links, null, 2));
  console.log('---CONSOLE---');
  console.log(logs.join('\n'));
  await browser.close();
})();
