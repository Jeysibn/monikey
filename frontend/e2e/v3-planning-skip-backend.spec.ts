import { isolatedClient } from './helpers/isolation'
import { expect, test, request as pwRequest, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'

// Stage 7A real-backend Skip Cycle. Needs the API on :3000 (disposable DB) and Vite (VITE_FINANCE_BACKEND=true).
const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:5173'
const stateFile = path.resolve(process.cwd(), 'test-results/v3-planning-skip-state.json')
const shotDir = path.resolve(process.cwd(), '../docs/remake/screenshots/stage7a')
const email = `v3-skip-${Date.now()}@monikey.test`
async function shot(page: Page, name: string) { await page.waitForTimeout(500); fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false }) }

fs.mkdirSync(path.dirname(stateFile), { recursive: true })
fs.writeFileSync(stateFile, JSON.stringify({ cookies: [], origins: [] }))
test.skip(process.env.V3_BACKEND_LOCAL !== '1', 'Needs a real local backend: set V3_BACKEND_LOCAL=1 and PLAYWRIGHT_TEST_BASE_URL')
test.describe.configure({ mode: 'serial' })
test.use({ storageState: stateFile })

interface Cat { id: string; name: string; allowsExpense: boolean }
interface Boot { serverDate: string; financeState: { accounts: { id: string; name: string; currentBalanceMinor: string }[]; categories: Cat[] } }
interface Rec { id: string; merchant: string; nextDueDate: string; lastPaidDate: string | null }
const ids: Record<string, string> = {}
const bills: Record<string, string> = {}
const cats: Cat[] = []
let today = ''
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const boot = async (page: Page) => (await (await page.request.get('/api/v1/bootstrap')).json()) as Boot
const balance = async (page: Page) => (await boot(page)).financeState.accounts.find((a) => a.id === ids.bdo)!.currentBalanceMinor
const recs = async (page: Page) => ((await (await page.request.get('/api/v1/recurring')).json()) as { items: Rec[] }).items
const rec = async (page: Page, name: string) => (await recs(page)).find((r) => r.id === bills[name])!
const recurringTx = async (page: Page, merchant?: string) => {
  const r = await page.request.get('/api/v1/transactions?limit=100')
  const body = await r.json() as { items?: { title: string; source: string; amountMinor: string; occurredOn: string }[] }
  return (body.items ?? []).filter((t) => t.source === 'recurring' && (!merchant || t.title === merchant))
}
const post = (page: Page, url: string, data: object) => page.request.post(url, { data, headers: { Origin: origin } })
async function openPlanning(page: Page) {
  await page.goto('/?v3=1')
  await expect(page).toHaveURL(/\/v3$/)
  await page.goto('/v3/planning')
  await expect(page.getByTestId('v3-planning')).toBeVisible()
  await expect(page.getByTestId('v3-plan-bills')).toBeVisible()
}
const skipBtn = (page: Page, name: string) => page.getByTestId(`v3-plan-skip-${bills[name]}`)
const dialog = (page: Page) => page.getByTestId('v3-skip-dialog')
const allTx = async (page: Page) => ((await (await page.request.get('/api/v1/transactions?limit=100')).json()) as { items: unknown[] }).items.length
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
const axe = async (page: Page, selector: string) => expect((await new AxeBuilder({ page }).include(selector).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])

test.beforeAll(async () => {
  const api = await pwRequest.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin, ...isolatedClient() } })
  expect((await api.post('/api/v1/auth/register', { data: { email, password: 'v3-skip-password', displayName: 'Skip Tester' } })).status()).toBe(201)
  const mk = async (url: string, data: object) => { const r = await api.post(url, { data }); expect(r.status(), url + (await r.text())).toBe(201); return (await r.json()) as { id: string } }
  ids.bdo = (await mk('/api/v1/accounts', { name: 'BDO Checking', accountType: 'checking', institution: 'BDO', openingBalanceMinor: '10000000', lastFour: '4242' })).id
  ids.cash = (await mk('/api/v1/accounts', { name: 'Wallet Cash', accountType: 'cash', openingBalanceMinor: '500000' })).id
  const b = (await (await api.get('/api/v1/bootstrap')).json()) as Boot
  cats.push(...b.financeState.categories.filter((c) => c.allowsExpense).slice(0, 3))
  today = b.serverDate
  const bill = async (merchant: string, minor: string, due: string, category = cats[1].id) => { const r = await mk('/api/v1/recurring', { merchant, amountMinor: minor, frequency: 'monthly', nextDueDate: due, accountId: ids.bdo, categoryId: category }); bills[merchant] = r.id }
  await bill('Rent', '45000', addDays(today, -5), cats[0].id) // overdue
  await bill('Internet', '30000', today) // due today
  await bill('Water', '20000', addDays(today, -1))
  await bill('Cable', '15000', addDays(today, -1))
  await bill('Phone', '11100', addDays(today, -1))
  await bill('Gym', '9900', addDays(today, -3)) // paused
  await bill('Netflix', '55500', addDays(today, 20)) // upcoming
  expect((await api.patch(`/api/v1/recurring/${bills.Gym}/status`, { data: { status: 'paused' } })).status()).toBe(200)
  // A monthly budget so spending shows up in Planning.
  const p = await mk('/api/v1/budgets', { periodStart: `${today.slice(0, 8)}01`, periodEnd: (() => { const d = new Date(`${today.slice(0, 8)}01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10) })(), incomePoolMinor: '0' })
  const a = await api.post(`/api/v1/budgets/${p.id}/allocations`, { data: { categoryId: cats[0].id, allocatedMinor: '100000' } })
  expect(a.status(), await a.text()).toBeLessThan(300)
  await api.storageState({ path: stateFile })
  await api.dispose()
})

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Skip is offered only for due and overdue active bills', async ({ page }) => {
    await openPlanning(page)
    await expect(skipBtn(page, 'Rent')).toBeVisible()
    await expect(skipBtn(page, 'Internet')).toBeVisible()
    for (const n of ['Netflix', 'Gym']) await expect(skipBtn(page, n)).toHaveCount(0)
  })

  test('skipping needs explicit confirmation and then records no expense and changes no balance', async ({ page }) => {
    await openPlanning(page)
    const before = BigInt(await balance(page)); const txBefore = await allTx(page); const dueBefore = (await rec(page, 'Rent')).nextDueDate
    await skipBtn(page, 'Rent').click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByTestId('v3-skip-explain')).toContainText('does not record a payment')
    await shot(page, 'desktop-skip-dialog')
    await axe(page, '[data-testid="v3-skip-dialog"]')
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    expect((await rec(page, 'Rent')).nextDueDate).toBe(dueBefore) // cancelling does nothing
    await skipBtn(page, 'Rent').click()
    await dialog(page).getByTestId('v3-skip-submit').click()
    await expect(page.getByTestId('v3-skip-success')).toContainText('skipped, not paid')
    await shot(page, 'desktop-skip-success')
    await dialog(page).getByRole('button', { name: 'Done' }).click()
    expect((await rec(page, 'Rent')).nextDueDate > dueBefore).toBe(true)
    expect(BigInt(await balance(page))).toBe(before)
    expect(await allTx(page)).toBe(txBefore)
    expect(await recurringTx(page, 'Rent')).toHaveLength(0)
    await expect(skipBtn(page, 'Rent')).toHaveCount(0) // refreshed without reload
    await page.reload(); await expect(page.getByTestId('v3-plan-bills')).toBeVisible()
    await expect(skipBtn(page, 'Rent')).toHaveCount(0)
    await shot(page, 'desktop-planning-after-skip')
  })

  test('repeated clicks and a duplicate API request skip exactly one cycle', async ({ page }) => {
    await openPlanning(page)
    const dueBefore = (await rec(page, 'Internet')).nextDueDate
    await skipBtn(page, 'Internet').click()
    const btn = dialog(page).getByTestId('v3-skip-submit')
    await btn.dblclick()
    await expect(page.getByTestId('v3-skip-success')).toBeVisible()
    const after = (await rec(page, 'Internet')).nextDueDate
    expect(after > dueBefore).toBe(true)
    const again = await post(page, `/api/v1/recurring/${bills.Internet}/skip-cycle`, { expectedDueDate: dueBefore })
    expect(again.status()).toBe(200) // replay of the same cycle
    expect((await rec(page, 'Internet')).nextDueDate).toBe(after) // never skips the next one
    expect(await recurringTx(page, 'Internet')).toHaveLength(0)
  })

  test('a lost response is uncertain, never "skipped", and Check again is safe', async ({ page }) => {
    await openPlanning(page)
    const dueBefore = (await rec(page, 'Water')).nextDueDate
    await skipBtn(page, 'Water').click()
    await page.route('**/api/v1/recurring/*/skip-cycle', async (route) => { await route.fetch(); await route.abort('failed') })
    await dialog(page).getByTestId('v3-skip-submit').click()
    await expect(page.getByTestId('v3-skip-uncertain')).toBeVisible()
    await expect(page.getByTestId('v3-skip-success')).toHaveCount(0)
    const committed = (await rec(page, 'Water')).nextDueDate
    expect(committed > dueBefore).toBe(true)
    await page.unroute('**/api/v1/recurring/*/skip-cycle')
    await dialog(page).getByRole('button', { name: 'Check again' }).click()
    await expect(page.getByTestId('v3-skip-success')).toContainText('already skipped')
    expect((await rec(page, 'Water')).nextDueDate).toBe(committed)
  })

  test('a timeout/5xx is uncertain and a server refusal is explained', async ({ page }) => {
    await openPlanning(page)
    await skipBtn(page, 'Cable').click()
    await page.route('**/api/v1/recurring/*/skip-cycle', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'UNAVAILABLE', message: 'down' }) }))
    await dialog(page).getByTestId('v3-skip-submit').click()
    await expect(page.getByTestId('v3-skip-uncertain')).toBeVisible()
    await page.unroute('**/api/v1/recurring/*/skip-cycle')
    await page.route('**/api/v1/recurring/*/skip-cycle', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DUE_DATE_MISMATCH', message: 'This bill moved to a different due date.' } }) }))
    await dialog(page).getByRole('button', { name: 'Check again' }).click()
    await expect(page.getByTestId('v3-skip-error')).toContainText('different due date')
    await page.unroute('**/api/v1/recurring/*/skip-cycle')
    expect((await rec(page, 'Cable')).nextDueDate).toBe(addDays(today, -1)) // nothing changed
  })

  test('a skip whose refresh fails shows a saved state with a refresh-only retry', async ({ page }) => {
    await openPlanning(page)
    const txBefore = await allTx(page)
    await skipBtn(page, 'Phone').click()
    await page.route('**/api/v1/bootstrap', (route) => route.abort('failed'))
    await dialog(page).getByTestId('v3-skip-submit').click()
    await expect(page.getByTestId('v3-skip-stale')).toContainText('skip is saved')
    await shot(page, 'desktop-skip-refresh-failed')
    await page.unroute('**/api/v1/bootstrap')
    await page.getByRole('button', { name: 'Retry refresh' }).click()
    await expect(page.getByTestId('v3-skip-stale')).toHaveCount(0)
    expect(await allTx(page)).toBe(txBefore)
  })
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('mobile skip sheet is usable, accessible and has 48px actions', async ({ page }) => {
    const r = await post(page, '/api/v1/recurring', { merchant: 'Mobile Loan', amountMinor: '77700', frequency: 'monthly', nextDueDate: today, accountId: ids.bdo, categoryId: cats[1].id })
    bills['Mobile Loan'] = ((await r.json()) as { id: string }).id
    await openPlanning(page)
    await skipBtn(page, 'Mobile Loan').scrollIntoViewIfNeeded()
    await shot(page, 'mobile-planning-skip-button')
    await noOverflow(page)
    await skipBtn(page, 'Mobile Loan').click()
    await expect(dialog(page)).toBeVisible()
    await shot(page, 'mobile-skip-dialog')
    await axe(page, '[data-testid="v3-skip-dialog"]')
    for (const c of [dialog(page).getByRole('button', { name: 'Cancel' }), dialog(page).getByTestId('v3-skip-submit')]) expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(47)
    await noOverflow(page)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    expect((await rec(page, 'Mobile Loan')).nextDueDate).toBe(today)
  })
})
