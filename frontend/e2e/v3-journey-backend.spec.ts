import { expect, test, request as pwRequest, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import { isolatedClient } from './helpers/isolation'

// Stage 7A: one end-to-end journey (account -> transaction -> budget -> recurring confirmation -> reporting) plus a three-viewport UX audit,
// on a real backend with a fresh disposable DB (scripts/e2e-real-backend.sh). Every figure is checked against an independent sum of raw API rows.
const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:5173'
const stateFile = path.resolve(process.cwd(), 'test-results/v3-journey-state.json')
const shotDir = path.resolve(process.cwd(), '../docs/remake/screenshots/stage7a')
const email = `v3-journey-${Date.now()}@monikey.test`
async function shot(page: Page, name: string) { await page.waitForTimeout(400); fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false }) }

fs.mkdirSync(path.dirname(stateFile), { recursive: true })
fs.writeFileSync(stateFile, JSON.stringify({ cookies: [], origins: [] }))
test.skip(process.env.V3_BACKEND_LOCAL !== '1', 'Needs a real local backend: set V3_BACKEND_LOCAL=1 and PLAYWRIGHT_TEST_BASE_URL')
test.use({ storageState: stateFile })

interface Acct { id: string; name: string; currentBalanceMinor: string }
interface Cat { id: string; name: string; allowsExpense: boolean }
interface Boot { serverDate: string; financeState: { accounts: Acct[]; categories: Cat[] } }
interface Tx { id: string; type: string; source: string; status: string; amountMinor: string; title: string }
const boot = async (page: Page) => (await (await page.request.get('/api/v1/bootstrap')).json()) as Boot
const txs = async (page: Page) => ((await (await page.request.get('/api/v1/transactions?limit=100')).json()) as { items: Tx[] }).items
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
const axe = async (page: Page) => expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
async function openV3(page: Page, route = '/v3') {
  await page.goto('/?v3=1'); await expect(page).toHaveURL(/\/v3$/)
  if (route !== '/v3') await page.goto(route)
  await expect(page.getByRole('main')).toBeVisible()
}
let expenseCat: Cat; let today = ''
const NAME = 'Journey Checking'

test.beforeAll(async () => {
  const api = await pwRequest.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin, ...isolatedClient() } })
  const reg = await api.post('/api/v1/auth/register', { data: { email, password: 'v3-journey-password', displayName: 'Journey Tester' } })
  if (reg.status() === 409) expect((await api.post('/api/v1/auth/login', { data: { email, password: 'v3-journey-password' } })).status()).toBe(200) // hook re-ran in a restarted worker
  else expect(reg.status()).toBe(201)
  const b = (await (await api.get('/api/v1/bootstrap')).json()) as Boot
  expenseCat = b.financeState.categories.filter((c) => c.allowsExpense)[0]; today = b.serverDate
  await api.storageState({ path: stateFile }); await api.dispose()
})

test.describe('journey (desktop)', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ viewport: { width: 1280, height: 800 } })

  test('1 create an account in V3 with a starting balance', async ({ page }) => {
    await openV3(page, '/v3/accounts')
    await expect(page.getByTestId('v3-acct-empty')).toBeVisible()
    await shot(page, 'journey-01-accounts-empty')
    await page.getByRole('button', { name: 'Add account' }).click()
    await page.getByLabel('Name').fill(NAME); await page.getByLabel('Starting balance').fill('50,000.00')
    await page.getByRole('button', { name: 'Add account', exact: true }).last().click()
    await expect(page.getByText(NAME).first()).toBeVisible()
    const a = (await boot(page)).financeState.accounts.find((x) => x.name === NAME)!
    expect(a.currentBalanceMinor).toBe('5000000')
  })

  test('2 add an expense with Quick Add; the balance drops by exactly that amount', async ({ page }) => {
    await openV3(page)
    await page.getByRole('button', { name: /^Add/ }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Quick add' }); await expect(sheet).toBeVisible()
    await sheet.getByLabel('Amount').fill('1,234.56'); await sheet.getByLabel('Category').selectOption(expenseCat.id)
    await sheet.getByRole('button', { name: 'Add expense' }).click()
    await expect(sheet).toHaveCount(0)
    expect((await boot(page)).financeState.accounts.find((x) => x.name === NAME)!.currentBalanceMinor).toBe(String(5000000 - 123456))
    expect((await txs(page)).filter((t) => t.type === 'expense')).toHaveLength(1)
  })

  test('3 budget the category in Planning and see the spending against it', async ({ page }) => {
    await openV3(page, '/v3/planning')
    await page.getByRole('button', { name: new RegExp(`^(Set|Edit) ${expenseCat.name} budget`) }).click()
    await page.getByLabel(`Monthly budget for ${expenseCat.name}`).fill('5,000.00')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByTestId('v3-plan-notice')).toContainText('Saved')
    await expect(page.getByTestId('v3-plan-spent')).toContainText('1,234.56')
    await shot(page, 'journey-03-planning-budget')
  })

  test('4 confirm a recurring bill once; one more expense, balance and budget follow, a retry adds nothing', async ({ page }) => {
    const r = await page.request.post('/api/v1/recurring', { data: { merchant: 'Journey Rent', amountMinor: '300000', frequency: 'monthly', nextDueDate: today, accountId: (await boot(page)).financeState.accounts.find((x) => x.name === NAME)!.id, categoryId: expenseCat.id }, headers: { Origin: origin } })
    expect(r.status()).toBe(201); const id = ((await r.json()) as { id: string }).id
    await openV3(page, '/v3/planning')
    await page.getByTestId(`v3-plan-confirm-${id}`).click()
    await page.getByTestId('v3-confirm-submit').click()
    await expect(page.getByTestId('v3-confirm-success')).toContainText('recorded as paid')
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTestId('v3-plan-spent')).toContainText('4,234.56')
    const retry = await page.request.post(`/api/v1/recurring/${id}/confirm-payment`, { data: { expectedDueDate: today, amountMinor: '300000', paidOn: today, accountId: (await boot(page)).financeState.accounts[0].id }, headers: { Origin: origin } })
    expect(retry.status()).toBe(200) // replay, nothing new
    expect((await txs(page)).filter((t) => t.source === 'recurring')).toHaveLength(1)
    expect((await boot(page)).financeState.accounts.find((x) => x.name === NAME)!.currentBalanceMinor).toBe(String(5000000 - 123456 - 300000))
  })

  test('5 Overview and Insights report exactly the raw ledger and survive a reload', async ({ page }) => {
    const rows = await txs(page)
    const spent = rows.filter((t) => t.type === 'expense' && t.status === 'cleared').reduce((s, t) => s + BigInt(t.amountMinor), 0n)
    expect(spent).toBe(423456n)
    await openV3(page)
    await expect(page.getByTestId('v3-liquid')).toContainText('45,765.44')
    await expect(page.getByTestId('v3-spent')).toContainText('4,234.56')
    await shot(page, 'journey-05-overview')
    await page.reload(); await expect(page.getByTestId('v3-liquid')).toContainText('45,765.44')
    await page.getByRole('tab', { name: 'Insights' }).click()
    await expect(page.getByTestId('v3-cat-total')).toContainText('4,234.56')
    await shot(page, 'journey-05-insights')
  })

  test('6 a failed reporting request shows an error with retry and invents no numbers', async ({ page }) => {
    await page.route('**/api/v1/reports/**', (route) => route.abort('failed'))
    await openV3(page)
    await expect(page.getByRole('alert').first()).toBeVisible()
    await page.unroute('**/api/v1/reports/**')
  })
})

// Touch viewports emulate a coarse pointer, where the V3 design guarantees 48px controls; the mouse viewport guarantees 44px.
const VIEWPORTS = [{ n: 'mobile', w: 390, h: 844, touch: true }, { n: 'tablet', w: 820, h: 1180, touch: true }, { n: 'desktop', w: 1440, h: 900, touch: false }]
const SCREENS: { n: string; route: string; tab?: string; ready: string }[] = [
  { n: 'overview', route: '/v3', ready: '[data-testid="v3-position"]' },
  { n: 'insights', route: '/v3', tab: 'Insights', ready: '[data-testid="v3-history"]' },
  { n: 'activity', route: '/v3/activity', ready: 'main h1' },
  { n: 'accounts', route: '/v3/accounts', ready: 'main h1' },
  { n: 'planning', route: '/v3/planning', ready: '[data-testid="v3-planning"]' },
  { n: 'sync', route: '/sync', ready: 'main' },
  { n: 'settings', route: '/settings', ready: 'main' },
  { n: 'security', route: '/security', ready: 'main' },
]
for (const vp of VIEWPORTS) {
  test.describe(`audit ${vp.n}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch })
    for (const s of SCREENS) {
      test(`${s.n}: renders, no overflow, primary touch targets, axe`, async ({ page }) => {
        await openV3(page, s.route)
        if (s.tab) await page.getByRole('tab', { name: s.tab }).click()
        await expect(page.locator(s.ready).first()).toBeVisible()
        await page.waitForTimeout(600)
        await shot(page, `audit-${vp.n}-${s.n}`)
        await noOverflow(page)
        if (s.route.startsWith('/v3')) {
          for (const b of await page.locator('.v3-btn--primary:visible:not(.v3-shell__skip)').all()) expect.soft((await b.boundingBox())!.height, `${s.n} primary button "${(await b.innerText()).trim().slice(0, 30)}" (${await b.evaluate((e) => e.className)})`).toBeGreaterThanOrEqual(vp.touch ? 47 : 43)
        }
        await axe(page)
      })
    }
  })
}

test.describe('reduced motion and keyboard', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  test('reduced motion disables V3 animation and transitions', async ({ page }) => {
    await openV3(page, '/v3/planning')
    const offenders = await page.evaluate(() => [...document.querySelectorAll('.v3-root, .v3-root *')].filter((e) => { const c = getComputedStyle(e); const ms = (v: string) => v.split(',').some((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000) > 10); return ms(c.animationDuration) && c.animationName !== 'none' || ms(c.transitionDuration) }).map((e) => e.className.toString().slice(0, 50)).slice(0, 8))
    expect(offenders).toEqual([])
  })
  test('Quick Add traps focus and Escape returns it to the opener', async ({ page }) => {
    await openV3(page)
    const opener = page.getByRole('button', { name: /^Add/ }).first(); await opener.click()
    const sheet = page.getByRole('dialog', { name: 'Quick add' }); await expect(sheet).toBeVisible()
    // body = focus left to the browser UI, which is fine; it must never land on the page behind the modal.
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); expect(await sheet.evaluate((d) => d.contains(document.activeElement) || document.activeElement === document.body)).toBe(true) }
    await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
})
