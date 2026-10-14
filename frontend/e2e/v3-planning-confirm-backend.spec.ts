import { expect, test, request as pwRequest, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'

// Stage 6B real-backend manual recurring-payment confirmation. Needs the API on :3000 (disposable DB) and Vite (VITE_FINANCE_BACKEND=true).
const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:5173'
const stateFile = path.resolve(process.cwd(), 'test-results/v3-planning-confirm-state.json')
const shotDir = path.resolve(process.cwd(), '../docs/remake/screenshots/stage6b')
const email = `v3-confirm-${Date.now()}@monikey.test`
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
const confirmBtn = (page: Page, name: string) => page.getByTestId(`v3-plan-confirm-${bills[name]}`)
const dialog = (page: Page) => page.getByTestId('v3-confirm-dialog')
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
const axe = async (page: Page, selector: string) => expect((await new AxeBuilder({ page }).include(selector).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])

test.beforeAll(async () => {
  const api = await pwRequest.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } })
  expect((await api.post('/api/v1/auth/register', { data: { email, password: 'v3-confirm-password', displayName: 'Confirm Tester' } })).status()).toBe(201)
  const mk = async (url: string, data: object) => { const r = await api.post(url, { data }); expect(r.status(), url + (await r.text())).toBe(201); return (await r.json()) as { id: string } }
  ids.bdo = (await mk('/api/v1/accounts', { name: 'BDO Checking', accountType: 'checking', institution: 'BDO', openingBalanceMinor: '10000000', lastFour: '4242' })).id
  ids.cash = (await mk('/api/v1/accounts', { name: 'Wallet Cash', accountType: 'cash', openingBalanceMinor: '500000' })).id
  const b = (await (await api.get('/api/v1/bootstrap')).json()) as Boot
  cats.push(...b.financeState.categories.filter((c) => c.allowsExpense).slice(0, 3))
  today = b.serverDate
  const bill = async (merchant: string, minor: string, due: string, category = cats[1].id) => { const r = await mk('/api/v1/recurring', { merchant, amountMinor: minor, frequency: 'monthly', nextDueDate: due, accountId: ids.bdo, categoryId: category }); bills[merchant] = r.id }
  await bill('Rent', '45000', addDays(today, -5), cats[0].id) // overdue
  await bill('Internet', '30000', today) // due today
  await bill('Meralco', '80000', addDays(today, -2)) // has a manual look-alike
  await bill('Water', '20000', addDays(today, -1))
  await bill('Cable', '15000', addDays(today, -1))
  await bill('Phone', '11100', addDays(today, -1))
  await bill('Gym', '9900', addDays(today, -3)) // paused
  await bill('Netflix', '55500', addDays(today, 20)) // upcoming
  expect((await api.patch(`/api/v1/recurring/${bills.Gym}/status`, { data: { status: 'paused' } })).status()).toBe(200)
  // A manual expense the user already entered for Meralco.
  const m = await api.post('/api/v1/transactions', { data: { type: 'expense', title: 'Meralco', categoryId: cats[1].id, fromAccountId: ids.bdo, occurredOn: addDays(today, -3), amountMinor: '80000', feeMinor: '0', source: 'manual', status: 'cleared' } })
  expect(m.status(), await m.text()).toBe(201)
  // A monthly budget so spending shows up in Planning.
  const p = await mk('/api/v1/budgets', { periodStart: `${today.slice(0, 8)}01`, periodEnd: (() => { const d = new Date(`${today.slice(0, 8)}01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10) })(), incomePoolMinor: '0' })
  const a = await api.post(`/api/v1/budgets/${p.id}/allocations`, { data: { categoryId: cats[0].id, allocatedMinor: '100000' } })
  expect(a.status(), await a.text()).toBeLessThan(300)
  await api.storageState({ path: stateFile })
  await api.dispose()
})

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('only due and overdue bills can be confirmed; overdue and paused bills are labelled, nothing is auto-recorded', async ({ page }) => {
    await openPlanning(page)
    await expect(page.getByTestId('v3-plan-bills-note')).toContainText('never records a bill by itself')
    await expect(confirmBtn(page, 'Rent')).toBeVisible()
    await expect(confirmBtn(page, 'Internet')).toBeVisible()
    await expect(confirmBtn(page, 'Gym')).toHaveCount(0)
    await expect(confirmBtn(page, 'Netflix')).toHaveCount(0)
    await expect(page.getByTestId(`v3-plan-bill-${bills.Rent}`)).toContainText('Overdue')
    await expect(page.getByTestId(`v3-plan-bill-${bills.Gym}`)).toContainText('Paused')
    expect(await recurringTx(page)).toHaveLength(0) // the worker/API never posted anything for the due bills
    await page.getByTestId('v3-plan-bills').scrollIntoViewIfNeeded()
    await shot(page, 'desktop-overdue-and-paused-bills')
  })

  test('confirming an overdue bill records one expense with the edited amount, account and date, then advances the schedule', async ({ page }) => {
    await openPlanning(page)
    const before = BigInt(await balance(page))
    await confirmBtn(page, 'Rent').click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByTestId('v3-confirm-explain')).toContainText('records a new expense')
    await shot(page, 'desktop-confirm-dialog')
    await axe(page, '[data-testid="v3-confirm-dialog"]')
    await dialog(page).getByLabel('Amount paid').fill('460.00')
    await dialog(page).getByLabel('Paid from').selectOption(ids.bdo)
    const paidOn = addDays(today, -1)
    await dialog(page).getByLabel('Payment date').fill(paidOn)
    await dialog(page).getByTestId('v3-confirm-submit').click()
    await expect(page.getByTestId('v3-confirm-success')).toContainText('recorded as paid')
    await shot(page, 'desktop-payment-success')
    const tx = await recurringTx(page, 'Rent')
    expect(tx).toHaveLength(1)
    expect(tx[0].amountMinor).toBe('46000'); expect(tx[0].occurredOn).toBe(paidOn)
    expect(BigInt(await balance(page))).toBe(before - 46000n)
    const r = await rec(page, 'Rent')
    expect(r.nextDueDate > addDays(today, -5)).toBe(true); expect(r.lastPaidDate).toBe(paidOn)
    await dialog(page).getByRole('button', { name: 'Done' }).click()
    await expect(confirmBtn(page, 'Rent')).toHaveCount(0) // no longer due
    await expect(page.getByTestId('v3-plan-spent')).toContainText('460.00') // budget spending refreshed without a reload
    await shot(page, 'desktop-planning-after-confirmation')
  })

  test('the new state survives reload and Back/Forward without creating another expense', async ({ page }) => {
    await openPlanning(page)
    await expect(confirmBtn(page, 'Rent')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('v3-plan-bills')).toBeVisible()
    await expect(confirmBtn(page, 'Rent')).toHaveCount(0)
    await expect(page.getByTestId('v3-plan-spent')).toContainText('460.00')
    await page.getByRole('link', { name: /Reports/ }).first().click()
    await page.goBack()
    await expect(page.getByTestId('v3-planning')).toBeVisible()
    await page.goForward(); await page.goBack()
    await expect(confirmBtn(page, 'Rent')).toHaveCount(0)
    expect(await recurringTx(page, 'Rent')).toHaveLength(1)
  })

  test('repeated clicks on Record payment create exactly one expense', async ({ page }) => {
    await openPlanning(page)
    await confirmBtn(page, 'Internet').click()
    const submit = dialog(page).getByTestId('v3-confirm-submit')
    await submit.dblclick()
    await expect(page.getByTestId('v3-confirm-success')).toBeVisible()
    expect(await recurringTx(page, 'Internet')).toHaveLength(1)
  })

  test('a look-alike manual expense triggers a warning; linking it uses that expense and posts nothing', async ({ page }) => {
    await openPlanning(page)
    const before = await balance(page)
    const count = (await recurringTx(page)).length
    await confirmBtn(page, 'Meralco').click()
    await dialog(page).getByTestId('v3-confirm-submit').click()
    const warn = page.getByTestId('v3-confirm-duplicate')
    await expect(warn).toContainText('may already be recorded')
    await expect(warn.getByTestId('v3-confirm-candidate')).toHaveCount(1)
    await expect(warn.getByRole('link', { name: /Inspect in Activity/ })).toBeVisible()
    await shot(page, 'desktop-duplicate-warning')
    expect(await balance(page)).toBe(before) // nothing recorded yet
    await warn.getByRole('button', { name: /link it/i }).click()
    await expect(page.getByTestId('v3-confirm-success')).toContainText('No new expense was created')
    expect(await balance(page)).toBe(before)
    expect((await recurringTx(page)).length).toBe(count)
    expect((await rec(page, 'Meralco')).nextDueDate > addDays(today, -2)).toBe(true)
  })

  test('a server validation refusal is explained and nothing is recorded', async ({ page }) => {
    await openPlanning(page)
    await confirmBtn(page, 'Phone').click()
    await dialog(page).getByLabel('Amount paid').fill('0')
    await dialog(page).getByTestId('v3-confirm-submit').click()
    await expect(dialog(page).getByRole('alert')).toContainText('greater than zero')
    await shot(page, 'desktop-validation-error')
    expect(await recurringTx(page, 'Phone')).toHaveLength(0)
    await dialog(page).getByLabel('Amount paid').fill('111.00')
    await page.route('**/api/v1/recurring/*/confirm-payment', (route) => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ACCOUNT_ARCHIVED', message: 'That account is archived. Choose another account.', field: 'accountId', requestId: 'x' } }) }))
    await dialog(page).getByTestId('v3-confirm-submit').click()
    await expect(dialog(page).getByRole('alert')).toContainText('archived')
    await expect(page.getByTestId('v3-confirm-success')).toHaveCount(0)
    await page.unroute('**/api/v1/recurring/*/confirm-payment')
    expect(await recurringTx(page, 'Phone')).toHaveLength(0)
  })

  test('a lost response is uncertain, never "paid", and Check again is safe: still exactly one expense', async ({ page }) => {
    await openPlanning(page)
    await confirmBtn(page, 'Water').click()
    await page.route('**/api/v1/recurring/*/confirm-payment', async (route) => { await route.fetch(); await route.abort('failed') }) // server commits, client never hears
    await dialog(page).getByTestId('v3-confirm-submit').click()
    await expect(page.getByTestId('v3-confirm-uncertain')).toBeVisible()
    await expect(page.getByTestId('v3-confirm-success')).toHaveCount(0)
    expect(await recurringTx(page, 'Water')).toHaveLength(1) // it did go through
    await page.unroute('**/api/v1/recurring/*/confirm-payment')
    await dialog(page).getByRole('button', { name: 'Check again' }).click()
    await expect(page.getByTestId('v3-confirm-success')).toContainText('already recorded')
    expect(await recurringTx(page, 'Water')).toHaveLength(1)
  })

  test('a posted payment whose refresh fails shows a confirmed state with a refresh-only retry', async ({ page }) => {
    await openPlanning(page)
    await confirmBtn(page, 'Cable').click()
    await page.route('**/api/v1/bootstrap', (route) => route.abort('failed'))
    await dialog(page).getByTestId('v3-confirm-submit').click()
    await expect(page.getByTestId('v3-confirm-stale')).toContainText('Do not pay again')
    await shot(page, 'desktop-payment-refresh-failed')
    await page.unroute('**/api/v1/bootstrap')
    await page.getByRole('button', { name: 'Retry refresh' }).click()
    await expect(page.getByTestId('v3-confirm-stale')).toHaveCount(0)
    expect(await recurringTx(page, 'Cable')).toHaveLength(1)
  })
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('mobile Planning shows the due bill; the confirmation sheet is usable and accessible', async ({ page }) => {
    // Create a fresh due bill so the mobile screens have a due item regardless of earlier tests.
    const r = await post(page, '/api/v1/recurring', { merchant: 'Mobile Loan', amountMinor: '77700', frequency: 'monthly', nextDueDate: today, accountId: ids.bdo, categoryId: cats[1].id })
    bills['Mobile Loan'] = ((await r.json()) as { id: string }).id
    await openPlanning(page)
    await expect(confirmBtn(page, 'Mobile Loan')).toBeVisible()
    await confirmBtn(page, 'Mobile Loan').scrollIntoViewIfNeeded()
    await shot(page, 'mobile-planning-due-bill')
    await noOverflow(page)
    await confirmBtn(page, 'Mobile Loan').click()
    await expect(dialog(page)).toBeVisible()
    await shot(page, 'mobile-confirm-dialog')
    await axe(page, '[data-testid="v3-confirm-dialog"]')
    for (const control of [dialog(page).getByLabel('Amount paid'), dialog(page).getByLabel('Paid from'), dialog(page).getByLabel('Payment date'), dialog(page).getByTestId('v3-confirm-submit')]) {
      const box = await control.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(43)
    }
    await noOverflow(page)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    expect(await recurringTx(page, 'Mobile Loan')).toHaveLength(0) // cancelling records nothing
  })
})
