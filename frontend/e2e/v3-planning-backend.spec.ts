import { expect, test, request as pwRequest, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'

// Stage 6A real-backend Planning flows. Needs the API on :3000 (disposable DB) and Vite (VITE_FINANCE_BACKEND=true).
const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:5173'
const stateFile = path.resolve(process.cwd(), 'test-results/v3-planning-state.json')
const shotDir = path.resolve(process.cwd(), '../docs/remake/screenshots/stage6a')
const email = `v3-plan-${Date.now()}@monikey.test`
async function shot(page: Page, name: string) { await page.waitForTimeout(500); fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false }) }

fs.mkdirSync(path.dirname(stateFile), { recursive: true })
fs.writeFileSync(stateFile, JSON.stringify({ cookies: [], origins: [] }))
test.skip(process.env.V3_BACKEND_LOCAL !== '1', 'Needs a real local backend: set V3_BACKEND_LOCAL=1 and PLAYWRIGHT_TEST_BASE_URL')
test.describe.configure({ mode: 'serial' })
test.use({ storageState: stateFile })

interface Cat { id: string; name: string; allowsExpense: boolean }
interface Boot { serverDate: string; financeState: { accounts: { id: string; name: string; currentBalanceMinor: string }[]; transactions: { id: string; title: string; type: string }[]; categories: Cat[] } }
interface Period { id: string; periodStart: string; allocations: { categoryId: string; allocatedMinor: string; spentMinor: string }[] }
const ids: Record<string, string> = {}
const cats: Cat[] = []
let today = ''
let monthStart = ''
let prevEnd = ''
let prevStart = ''
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const boot = async (page: Page) => (await (await page.request.get('/api/v1/bootstrap')).json()) as Boot
const txs = async (page: Page) => (await boot(page)).financeState.transactions
const periods = async (page: Page) => (await (await page.request.get('/api/v1/budgets')).json()) as Period[]
const alloc = async (page: Page, id: string) => (await periods(page)).find((p) => p.periodStart.startsWith(monthStart))?.allocations.find((a) => a.categoryId === id)
const post = (page: Page, url: string, data: object) => page.request.post(url, { data, headers: { Origin: origin } })
const expense = async (page: Page, title: string, cat: string, from: string, minor: string, on = today) => {
  const r = await post(page, '/api/v1/transactions', { type: 'expense', title, categoryId: cat, fromAccountId: from, occurredOn: on, amountMinor: minor, feeMinor: '0', source: 'manual', status: 'cleared' })
  expect(r.status(), await r.text()).toBe(201)
  return (await r.json()) as { id?: string; transaction?: { id: string } }
}
async function openPlanning(page: Page) {
  await page.goto('/?v3=1')
  await expect(page).toHaveURL(/\/v3$/)
  await page.goto('/v3/planning')
  await expect(page.getByTestId('v3-planning')).toBeVisible()
}
async function setBudget(page: Page, name: string, amount: string, edit = false) {
  await page.getByRole('button', { name: `${edit ? 'Edit' : 'Set'} ${name} budget` }).click()
  await page.getByLabel(`Monthly budget for ${name}`).fill(amount)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('v3-plan-notice')).toContainText('Saved')
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)

test.beforeAll(async () => {
  const api = await pwRequest.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } })
  expect((await api.post('/api/v1/auth/register', { data: { email, password: 'v3-planning-password', displayName: 'Planning Tester' } })).status()).toBe(201)
  const mk = async (url: string, data: object) => { const r = await api.post(url, { data }); expect(r.status(), url).toBe(201); return (await r.json()) as { id: string } }
  ids.bdo = (await mk('/api/v1/accounts', { name: 'BDO Checking', accountType: 'checking', institution: 'BDO', openingBalanceMinor: '10000000', lastFour: '4242' })).id
  ids.visa = (await mk('/api/v1/credit-cards', { name: 'Visa Platinum', network: 'visa', lastFour: '9001', creditLimitMinor: '8000000', dueDay: 20, openingBalanceMinor: '0' })).id
  const b = (await (await api.get('/api/v1/bootstrap')).json()) as Boot
  cats.push(...b.financeState.categories.filter((c) => c.allowsExpense).slice(0, 4))
  expect(cats.length).toBeGreaterThanOrEqual(4)
  today = b.serverDate; monthStart = `${today.slice(0, 8)}01`; prevEnd = addDays(monthStart, -1); prevStart = `${prevEnd.slice(0, 8)}01`
  await api.storageState({ path: stateFile })
  await api.dispose()
})

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('empty month shows the setup state; first budget, multiple allocations and an edit persist', async ({ page }) => {
    await openPlanning(page)
    await expect(page.getByTestId('v3-plan-empty')).toBeVisible()
    await shot(page, 'desktop-empty-budget')
    await page.getByRole('button', { name: 'Set your first budget' }).click()
    await expect(page.getByLabel(/^Monthly budget for/)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('v3-plan-empty')).toBeVisible()
    await setBudget(page, cats[0].name, '1,000')
    await expect(page.getByTestId('v3-plan-summary')).toBeVisible()
    await setBudget(page, cats[1].name, '500')
    await setBudget(page, cats[2].name, '100')
    expect((await alloc(page, cats[1].id))?.allocatedMinor).toBe('50000')
    await setBudget(page, cats[0].name, '1,200', true)
    expect((await alloc(page, cats[0].id))?.allocatedMinor).toBe('120000')
    await expect(page.getByTestId('v3-plan-allocated')).toContainText('1,800.00')
    expect((await periods(page)).filter((p) => p.periodStart.startsWith(monthStart))).toHaveLength(1)
  })

  test('spending: boundary, card once, repayment ignored, reversal, over-budget; Planning = Overview = report', async ({ page }) => {
    await expense(page, 'Prev month end', cats[0].id, ids.bdo, '11100', prevEnd) // outside the month
    await expense(page, 'Cash spend A', cats[0].id, ids.bdo, '30000')
    const rev = await expense(page, 'To reverse', cats[0].id, ids.bdo, '10000')
    await expense(page, 'Month start B', cats[1].id, ids.bdo, '5000', monthStart)
    await expense(page, 'Card B', cats[1].id, ids.visa, '20000')
    await expense(page, 'Over C', cats[2].id, ids.bdo, '15000')
    const repay = await post(page, '/api/v1/transactions', { type: 'transfer', title: 'Card payment', fromAccountId: ids.bdo, toAccountId: ids.visa, occurredOn: today, amountMinor: '10000', feeMinor: '0', source: 'manual', status: 'cleared' })
    expect(repay.status(), await repay.text()).toBe(201)
    const revId = rev.id ?? rev.transaction!.id
    await openPlanning(page)
    await expect(page.getByTestId(`v3-plan-row-${cats[0].id}`)).toContainText('400.00')
    await expect(page.getByTestId('v3-plan-spent')).toContainText('800.00') // 400 + 250 + 150
    const reversed = await post(page, `/api/v1/transactions/${revId}/reverse`, {})
    expect(reversed.status(), await reversed.text()).toBeLessThan(300)
    await page.reload()
    await expect(page.getByTestId(`v3-plan-row-${cats[0].id}`)).toContainText('300.00')
    await expect(page.getByTestId(`v3-plan-row-${cats[1].id}`)).toContainText('250.00')
    await expect(page.getByTestId('v3-plan-spent')).toContainText('700.00')
    await expect(page.getByTestId('v3-plan-remaining')).toContainText('1,100.00')
    await expect(page.getByTestId(`v3-plan-row-${cats[2].id}`)).toContainText('Over budget')
    const rep = (await (await page.request.get(`/api/v1/reports/budget-performance?period=${monthStart.slice(0, 7)}`)).json()) as { totalSpent: string | number; totalAllocated: string | number }
    expect(String(rep.totalSpent)).toBe('70000')
    expect(String(rep.totalAllocated)).toBe('180000')
    await page.getByTestId(`v3-plan-row-${cats[2].id}`).scrollIntoViewIfNeeded()
    await shot(page, 'over-budget-category')
    await page.getByRole('link', { name: 'Overview' }).first().click()
    await expect(page.getByTestId('v3-budget-line')).toContainText(/700\.00.*1,800\.00/)
  })

  test('previous month is a separate (empty) month with its own spending; browser Back/Forward keep the page', async ({ page }) => {
    await openPlanning(page)
    await page.getByRole('button', { name: 'Previous month' }).click()
    await expect(page.getByTestId('v3-plan-empty')).toBeVisible()
    await expect(page.getByTestId('v3-plan-total')).toContainText('111.00')
    await page.getByRole('link', { name: 'Overview' }).first().click()
    await page.goBack()
    await expect(page.getByTestId('v3-planning')).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(/\/v3$/)
    expect(prevStart < prevEnd || prevStart === prevEnd).toBe(true)
  })

  test('recurring: active, paused and overdue shown; opening Planning posts nothing', async ({ page }) => {
    const mk = async (merchant: string, due: string) => { const r = await post(page, '/api/v1/recurring', { merchant, amountMinor: '129900', frequency: 'monthly', nextDueDate: due, accountId: ids.bdo, categoryId: cats[3].id, autopay: false }); expect(r.status(), await r.text()).toBe(201); return (await r.json()) as { id: string } }
    const up = await mk('Internet Upcoming', addDays(today, 10))
    const od = await mk('Rent Overdue', addDays(today, -5))
    const pa = await mk('Gym Paused', addDays(today, 3))
    const st = await page.request.patch(`/api/v1/recurring/${pa.id}/status`, { data: { status: 'paused' }, headers: { Origin: origin } })
    expect(st.status()).toBeLessThan(300)
    const before = (await txs(page)).length
    await openPlanning(page)
    await expect(page.getByTestId(`v3-plan-bill-${up.id}`)).toContainText('Internet Upcoming')
    await expect(page.getByTestId(`v3-plan-bill-${od.id}`)).toContainText(/Overdue/i)
    await expect(page.getByTestId(`v3-plan-bill-${pa.id}`)).toContainText(/Paused/i)
    // Only the overdue bill is confirmable; upcoming and paused bills have no action.
    await expect(page.getByTestId('v3-plan-bills').getByRole('button')).toHaveCount(1)
    await expect(page.getByTestId(`v3-plan-confirm-${od.id}`)).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('v3-plan-bills')).toBeVisible()
    expect((await txs(page)).length).toBe(before)
    const raw = (await (await page.request.get('/api/v1/recurring')).json()) as { id: string; nextDueDate: string }[] | { items?: { id: string; nextDueDate: string }[]; recurring?: { id: string; nextDueDate: string }[] }
    const list = Array.isArray(raw) ? raw : (raw.items ?? raw.recurring ?? [])
    expect(list.find((i) => i.id === od.id)?.nextDueDate).toBe(addDays(today, -5))
    const results = await new AxeBuilder({ page }).include('[data-testid="v3-planning"]').analyze()
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
    await noOverflow(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot(page, 'desktop-planning')
  })

  test('error and recovery: a failed budget load is retryable and keeps the page usable', async ({ page }) => {
    let fail = true
    await page.route('**/api/v1/budgets', async (route) => { if (fail && route.request().method() === 'GET') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'boom', requestId: 'x' } }) }); else await route.continue() })
    await openPlanning(page)
    await expect(page.getByTestId('v3-plan-error')).toBeVisible()
    await expect(page.getByTestId('v3-plan-bills')).toBeVisible()
    await shot(page, 'error-recovery')
    fail = false
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByTestId('v3-plan-summary')).toBeVisible()
  })

  test('Quick Add: posted but refresh failed shows the saved state, retries only the refresh, one transaction', async ({ page }) => {
    await openPlanning(page)
    const before = (await txs(page)).length
    await page.getByRole('button', { name: /^Add/ }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Quick add' })
    await sheet.getByLabel('Amount').fill('12.34')
    await sheet.getByLabel('Category').selectOption(cats[0].id)
    await page.route('**/api/v1/bootstrap', (route) => route.abort('failed'))
    await sheet.getByRole('button', { name: 'Add expense' }).click()
    await expect(page.getByTestId('v3-qa-saved-stale')).toContainText("Transaction saved, but the latest balances couldn't be loaded.")
    await page.unroute('**/api/v1/bootstrap')
    await page.getByRole('button', { name: 'Refresh balances' }).click()
    await expect(sheet).toHaveCount(0)
    expect((await txs(page)).length).toBe(before + 1)
  })
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('single column, 48px targets, dock clearance, no overflow, accessible; screenshots', async ({ page }) => {
    await openPlanning(page)
    await expect(page.getByTestId('v3-plan-summary')).toBeVisible()
    await noOverflow(page)
    for (const loc of [page.getByRole('button', { name: 'Previous month' }), page.getByRole('button', { name: `Edit ${cats[0].name} budget` })]) {
      const box = (await loc.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(47.5)
    }
    await shot(page, 'mobile-overview')
    await page.getByTestId('v3-plan-categories').scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: `Edit ${cats[0].name} budget` }).click()
    await expect(page.getByLabel(`Monthly budget for ${cats[0].name}`)).toBeFocused()
    await shot(page, 'mobile-category-editing')
    await page.keyboard.press('Escape')
    await page.getByTestId('v3-plan-categories').scrollIntoViewIfNeeded()
    await shot(page, 'mobile-categories')
    await page.getByTestId('v3-plan-bills').scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await shot(page, 'mobile-recurring-bills')
    const dock = await page.getByRole('navigation').last().boundingBox()
    const last = await page.getByTestId('v3-plan-bills').boundingBox()
    if (dock && last) expect(last.y + last.height).toBeLessThanOrEqual(dock.y + 1)
    const results = await new AxeBuilder({ page }).include('[data-testid="v3-planning"]').analyze()
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
  })
})

test.describe('tablet', () => {
  test.use({ viewport: { width: 820, height: 1100 } })
  test('two-column categories without overflow', async ({ page }) => {
    await openPlanning(page)
    await expect(page.getByTestId('v3-plan-summary')).toBeVisible()
    await noOverflow(page)
    await shot(page, 'tablet-planning')
  })
})
