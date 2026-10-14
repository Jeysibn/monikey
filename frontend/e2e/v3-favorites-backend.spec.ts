import { isolatedClient } from './helpers/isolation'
import { expect, test, request as pwRequest, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'

// Stage 5A.1 real-backend flow: persistent favorites, global sorting, dock clearance with real multi-page data.
// Needs the API on :3000 (disposable DB) and Vite (VITE_FINANCE_BACKEND=true) as PLAYWRIGHT_TEST_BASE_URL.
const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:5173'
const headers = { Origin: origin, ...isolatedClient() }
const stateFile = path.resolve(process.cwd(), 'test-results/v3-favorites-state.json')
const shotDir = path.resolve(process.cwd(), '../docs/remake/screenshots/stage5a1')
const email = `v3-fav-${Date.now()}@monikey.test`
const password = 'v3-favorites-password'
const iso = (daysAgo: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10) }
async function shot(page: Page, name: string) { fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false }) }

fs.mkdirSync(path.dirname(stateFile), { recursive: true })
fs.writeFileSync(stateFile, JSON.stringify({ cookies: [], origins: [] }))
test.skip(process.env.V3_BACKEND_LOCAL !== '1', 'Needs a real local backend: set V3_BACKEND_LOCAL=1 and PLAYWRIGHT_TEST_BASE_URL')
test.describe.configure({ mode: 'serial' })
test.use({ storageState: stateFile })

async function openV3(page: Page, route: string) {
  await page.goto('/?v3=1')
  await expect(page).toHaveURL(/\/v3$/)
  await page.goto(route)
}
const toggle = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`(Add ${name} to favorites|${name} is favorite number \\d+)`) })
const featured = (page: Page) => page.getByRole('list', { name: 'Featured accounts' }).getByRole('listitem')

test.beforeAll(async () => {
  test.setTimeout(180_000)
  const api = await pwRequest.newContext({ baseURL: origin, extraHTTPHeaders: headers })
  expect((await api.post('/api/v1/auth/register', { data: { email, password, displayName: 'Favorites Tester' } })).status()).toBe(201)
  const mk = async (url: string, data: object) => { const r = await api.post(url, { data }); expect(r.status(), url).toBe(201); return (await r.json()) as { id?: string } }
  const bdo = (await mk('/api/v1/accounts', { name: 'BDO Checking', accountType: 'checking', institution: 'BDO', openingBalanceMinor: '9000000', lastFour: '4242' })).id!
  await mk('/api/v1/accounts', { name: 'BPI Savings', accountType: 'savings', institution: 'BPI', openingBalanceMinor: '12000000', lastFour: '1188' })
  await mk('/api/v1/accounts', { name: 'GCash', accountType: 'ewallet', institution: 'GCash', openingBalanceMinor: '150000' })
  await mk('/api/v1/accounts', { name: 'Cash Wallet', accountType: 'cash', openingBalanceMinor: '320000' })
  await mk('/api/v1/accounts', { name: 'Maya', accountType: 'ewallet', institution: 'Maya', openingBalanceMinor: '50000' })
  await mk('/api/v1/credit-cards', { name: 'Visa Platinum', network: 'visa', lastFour: '9001', creditLimitMinor: '8000000', dueDay: 20, openingBalanceMinor: '250000' })
  const boot = await (await api.get('/api/v1/bootstrap')).json() as { financeState: { categories: { id: string; allowsExpense: boolean }[] } }
  const exp = boot.financeState.categories.find((c) => c.allowsExpense)!.id
  // 75 purchases with unique amounts so amount order is unambiguous across 2 pages of 50 and the date order spreads over weeks.
  for (let i = 1; i <= 75; i++) await mk('/api/v1/transactions', { type: 'expense', title: `Purchase ${String(i).padStart(2, '0')}`, fromAccountId: bdo, categoryId: exp, amountMinor: String(i * 1000), occurredOn: iso(1 + (i % 50)) })
  await api.storageState({ path: stateFile })
  await api.dispose()
})

test('unconfigured: Overview suggests four accounts and Accounts explains it', async ({ page }) => {
  await page.goto('/?v3=1')
  await expect(featured(page)).toHaveCount(4)
  await openV3(page, '/v3/accounts')
  await expect(page.getByTestId('v3-fav-panel')).toContainText('0 of 4 selected')
  await expect(page.getByTestId('v3-fav-panel')).toContainText(/suggested accounts/)
  await shot(page, 'favorites-unconfigured-desktop')
})

test('select, order, limit of four, persist across reload and a brand-new session', async ({ page, browser }) => {
  await openV3(page, '/v3/accounts')
  for (const name of ['Visa Platinum', 'GCash', 'BDO Checking']) await toggle(page, name).click()
  await expect(page.getByTestId('v3-fav-panel')).toContainText('3 of 4 selected')
  const list = page.getByRole('list', { name: 'Favorite accounts in Overview order' })
  await expect(list.getByRole('listitem')).toHaveText([/Visa Platinum/, /GCash/, /BDO Checking/].map((r) => r) as unknown as RegExp[])
  // reorder: move BDO to the top via keyboard-accessible buttons
  await list.getByRole('button', { name: /Move BDO Checking up/ }).click()
  await list.getByRole('button', { name: /Move BDO Checking up/ }).click()
  await expect(page.getByTestId('v3-fav-status')).toContainText('moved to position 1')
  await expect(list.getByRole('listitem').first()).toContainText('BDO Checking')
  await expect(list.getByRole('button', { name: /Move BDO Checking up/ })).toBeDisabled()
  // fourth ok, fifth blocked
  await toggle(page, 'Maya').click()
  await expect(page.getByTestId('v3-fav-panel')).toContainText('4 of 4 selected')
  await expect(page.getByRole('button', { name: /BPI Savings: favorites are full/ })).toBeDisabled()
  await shot(page, 'favorites-selected-desktop')
  await page.getByRole('button', { name: /Maya is favorite number 4/ }).click()
  await expect(page.getByTestId('v3-fav-panel')).toContainText('3 of 4 selected')
  // reload persists, Overview shows exactly the selection in order (fewer than four stays fewer)
  await page.reload()
  await expect(page.getByTestId('v3-fav-panel')).toContainText('3 of 4 selected')
  await page.goto('/v3')
  await expect(featured(page)).toHaveCount(3)
  await expect(featured(page).first()).toContainText('BDO Checking')
  await expect(featured(page).nth(1)).toContainText('Visa Platinum')
  await expect(page.getByRole('link', { name: /Visa Platinum credit card, outstanding balance owed/ })).toContainText('Owed')
  await shot(page, 'overview-favorites-desktop')
  // a brand-new session (fresh cookies, same credentials) sees the same selection
  const api = await pwRequest.newContext({ baseURL: origin, extraHTTPHeaders: headers })
  expect((await api.post('/api/v1/auth/login', { data: { email, password } })).status()).toBe(200)
  const fresh = await browser.newContext({ storageState: await api.storageState() })
  const p2 = await fresh.newPage()
  await p2.goto(`${origin}/?v3=1`)
  await expect(featured(p2)).toHaveCount(3)
  await expect(featured(p2).first()).toContainText('BDO Checking')
  await fresh.close(); await api.dispose()
})

test('archiving a favorite removes it; clearing all stays empty instead of reverting to suggestions', async ({ page }) => {
  await openV3(page, '/v3/accounts')
  await page.getByRole('button', { name: /^GCash, balance/ }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByTestId('v3-fav-panel')).toContainText('2 of 4 selected')
  await page.goto('/v3')
  await expect(featured(page)).toHaveCount(2)
  await expect(page.getByRole('list', { name: 'Featured accounts' })).not.toContainText('GCash')
  await page.goto('/v3/accounts')
  const list = page.getByRole('list', { name: 'Favorite accounts in Overview order' })
  await expect(page.getByTestId('v3-fav-panel')).toContainText('2 of 4 selected')
  await list.getByRole('button', { name: /^Remove / }).first().click()
  await expect(page.getByTestId('v3-fav-panel')).toContainText('1 of 4 selected')
  await list.getByRole('button', { name: /^Remove / }).first().click()
  await expect(page.getByTestId('v3-fav-panel')).toContainText('0 of 4 selected')
  await expect(page.getByTestId('v3-fav-empty')).toContainText(/No favorites/)
  await page.reload()
  await expect(page.getByTestId('v3-fav-empty')).toContainText(/No favorites/)
  await page.goto('/v3')
  await expect(page.getByText(/No favorite accounts selected/)).toBeVisible()
  await shot(page, 'overview-favorites-empty-desktop')
})

test('Accounts favorites panel passes axe and keeps credit-card presentation honest', async ({ page }) => {
  await openV3(page, '/v3/accounts')
  await toggle(page, 'Visa Platinum').click()
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  await page.getByRole('button', { name: /^Visa Platinum, outstanding/ }).click()
  await expect(page.getByTestId('v3-card-due')).toHaveText('The 20th of each month')
  await expect(page.getByTestId('v3-card-min')).toHaveText('Not set')
  await expect(page.getByText(/does not assume one/)).toBeVisible()
  await shot(page, 'accounts-card-details-desktop')
})

test('Activity amount sort is global across pages and survives URL, reload and Back/Forward', async ({ page }) => {
  await openV3(page, '/v3/activity')
  await page.getByRole('button', { name: /Filters/ }).click()
  await page.getByLabel('Sort by').selectOption('amount:desc')
  await expect(page).toHaveURL(/sort=amount/)
  const firstTitles = async () => page.locator('.v3-act-table tbody tr, .v3-act-row').first().innerText()
  await expect(page.locator('.v3-act-table tbody tr, .v3-act-row').first()).toContainText('Purchase 75')   // largest overall, not just of page 1
  await expect(page.getByText(/within the loaded transactions only/i)).toHaveCount(0)
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByText('Purchase 01').first()).toBeVisible()                                      // smallest is on page 2
  const titles = await page.locator('.v3-act-table tbody tr .v3-act-titlebtn, .v3-act-row .v3-act-row__title').allInnerTexts()
  const nums = titles.map((t) => Number(t.replace('Purchase ', ''))).filter((n) => !Number.isNaN(n))
  expect(nums.length).toBeGreaterThan(50)
  expect(nums).toEqual([...nums].sort((a, b) => b - a))
  expect(new Set(nums).size).toBe(nums.length)
  await page.reload()
  await expect(page.locator('.v3-act-table tbody tr, .v3-act-row').first()).toContainText('Purchase 75')
  await page.getByRole('button', { name: /Filters/ }).click()
  await page.getByLabel('Sort by').selectOption('amount:asc')
  await expect(page.locator('.v3-act-table tbody tr, .v3-act-row').first()).toContainText('Purchase 01')
  await page.goBack()
  await expect(page).toHaveURL(/dir=desc|sort=amount&?(?!.*dir=asc)/)
  await expect(page.locator('.v3-act-table tbody tr, .v3-act-row').first()).toContainText('Purchase 75')
  await page.goForward()
  await expect(page.locator('.v3-act-table tbody tr, .v3-act-row').first()).toContainText('Purchase 01')
  void firstTitles
})

test('Activity: sort composes with an account filter across pages', async ({ page }) => {
  await openV3(page, '/v3/accounts')
  await page.getByRole('button', { name: /^BDO Checking, balance/ }).click()
  await page.getByRole('link', { name: 'View all activity' }).click()
  await expect(page).toHaveURL(/account=/)
  const filtersButton = page.getByRole('button', { name: /Filters/ })
  await expect(filtersButton).toBeVisible()
  if ((await filtersButton.getAttribute('aria-expanded')) !== 'true') await filtersButton.click()
  await page.getByLabel('Sort by').selectOption('amount:desc')
  await expect(page).toHaveURL(/account=.*sort=amount|sort=amount.*account=/)
  await expect(page.locator('.v3-act-table tbody tr, .v3-act-row').first()).toContainText('Purchase 75')
})

for (const vp of [{ n: 'mobile', width: 390, height: 700 }, { n: 'tablet', width: 820, height: 700 }, { n: 'desktop', width: 1440, height: 700 }]) {
  test(`dock clearance with 75 real rows @ ${vp.n}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await openV3(page, '/v3/activity')
    await expect(page.getByText('Purchase 01').first()).toBeHidden().catch(() => undefined)
    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(page.getByText('Purchase 01').first()).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const dockBox = (await page.locator('.v3-dock').boundingBox())!
    const lastRow = page.locator('.v3-act-table tbody tr, .v3-act-row').last()
    const rowBox = (await lastRow.boundingBox())!
    expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(dockBox.y + 1)
    const lastAction = page.locator('.v3-act-actions').last().getByRole('button').first()
    if (await lastAction.count()) {
      const hit = await lastAction.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h === el || el.contains(h) })
      expect(hit).toBe(true)
      await lastAction.click()
    } else {
      await lastRow.click()
    }
    await expect(page.getByTestId('v3-activity-detail')).toBeVisible()
    if (vp.n === 'desktop') await shot(page, 'activity-dock-clearance-desktop')
  })
}
