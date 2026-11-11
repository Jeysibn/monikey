import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

import { hasRealApi } from './fixtures'

const screenshots = process.env.MONIKEY_DASHBOARD_API_FIXTURE === '1'
  ? '../docs/design/screenshots/ui-modernization/phase-c-dashboard-api'
  : '../docs/design/screenshots/ui-modernization/phase-c-dashboard'

async function openDashboard(page: import('@playwright/test').Page) {
  await page.goto('/')
  const navigation = page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first()
  await navigation.click()
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeFocused()
  await expect(page.getByText('Income and expenses by month')).toBeVisible()
}

async function seedAnalyticsApi(baseURL: string, request: import('@playwright/test').APIRequestContext) {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${baseURL}${path}`, { data })
    expect(response.status(), `${path}: ${await response.text()}`).toBe(201)
    return response.json()
  }
  const account = async (name: string, type: string) => post('/api/accounts', { name, type, opening_balance: '0.00', opening_debt: '0.00', credit_limit: type === 'credit_card' ? '50000.00' : null })
  await account('Cash on hand', 'cash')
  await account('Main Savings', 'bank')
  await account('GCash', 'ewallet')
  await account('Blue Card', 'credit_card')
  await account('Everyday Card', 'credit_card')
  const transactions = [
    [1, '32000.00', '2026-10-02', null], [2, '4500.00', '2026-10-08', null],
    [7, '8500.00', '2026-10-02', 'needs'], [6, '1420.25', '2026-10-03', 'needs'],
    [7, '1865.40', '2026-10-05', 'needs'], [7, '1499.00', '2026-10-06', 'needs'],
    [4, '215.00', '2026-10-07', 'wants'], [6, '3180.75', '2026-10-14', 'needs'],
    [8, '2399.00', '2026-10-12', 'wants'], [7, '300.00', '2026-10-16', 'needs'],
    [9, '640.00', '2026-10-19', null], [7, '1800.00', '2026-10-18', 'culture'],
    [4, '1250.00', '2026-10-11', 'wants'], [9, '486.50', '2026-10-21', 'unexpected'],
    [6, '2846.50', '2026-10-23', 'needs'], [5, '340.00', '2026-10-09', 'needs'],
    [4, '385.00', '2026-10-24', null],
  ] as const
  for (const [categoryId, amount, transactionDate, envelope] of transactions) {
    await post('/api/transactions', { account_id: 2, category_id: categoryId, amount, transaction_date: transactionDate, kakeibo_envelope: envelope })
  }
  const plan = await request.put(`${baseURL}/api/kakeibo/months/2026-10`, { data: {
    planned_income: '36000.00', allocated_starting_funds: '2000.00', savings_target: '5000.00', prior_period_debt_reserve: '3000.00',
    needs_limit: '18000.00', wants_limit: '5000.00', culture_limit: '2000.00', unexpected_limit: '3000.00', monthly_intention: null,
  } })
  expect(plan.status(), await plan.text()).toBe(200)
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (name: string) => parts.find((item) => item.type === name)!.value
  const currentDate = `${part('year')}-${part('month')}-${part('day')}`
  const currentMonth = currentDate.slice(0, 7)
  const currentPlan = await request.put(`${baseURL}/api/kakeibo/months/${currentMonth}`, { data: {
    planned_income: '36000.00', allocated_starting_funds: '2000.00', savings_target: '5000.00', prior_period_debt_reserve: '3000.00',
    needs_limit: '100.00', wants_limit: '50.00', culture_limit: '25.00', unexpected_limit: '10.00', monthly_intention: null,
  } })
  expect(currentPlan.status(), await currentPlan.text()).toBe(200)
  return { currentDate, currentMonth }
}

test('Dashboard uses synthetic ledger records, supports date and account filters, and keeps navigation responsive', async ({ page, request, baseURL }) => {
  const fixture = process.env.MONIKEY_DASHBOARD_API_FIXTURE === '1' ? await seedAnalyticsApi(baseURL!, request) : null
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 })
    await openDashboard(page)
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
    expect(dimensions.scroll, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.width)
    await expect(page.getByRole('combobox', { name: 'Date range' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Filter analytics by account' })).toBeVisible()
    if (width === 390) {
      await mkdir(screenshots, { recursive: true })
      await page.screenshot({ path: `${screenshots}/dashboard-mobile-390.png` })
    }
    if (width === 1440) await page.screenshot({ path: `${screenshots}/dashboard-desktop-1440.png`, fullPage: true })
  }

  await page.getByLabel('Date range').selectOption('custom')
  await page.getByLabel('Start date').fill('2026-10-01')
  await page.getByLabel('End date').fill('2026-10-25')
  const summary = page.getByRole('region', { name: 'Financial summary' })
  // With nothing in the previous period the "Up ₱X vs previous period" line repeats the figure, so match the headline (first) one.
  await expect(summary.getByText('₱36,500.00').first()).toBeVisible()
  await expect(summary.getByText('₱27,127.40').first()).toBeVisible()
  await expect(page.getByText('Cash flow excludes transfers and card repayments. Card purchases count once.')).toBeVisible()
  await page.getByLabel('Filter analytics by account').selectOption('2')
  await expect(page.getByText('Kakeibo limits cover all accounts. Clear the account filter to compare saved plans with actual spending.')).toBeVisible()
  await expect(page.getByText('Actual expense classifications in this period for the selected account.')).toBeVisible()
  if (fixture) {
    await page.getByLabel('Filter analytics by account').selectOption('')
    await page.getByLabel('Date range').selectOption('custom')
    await page.getByLabel('Start date').fill(fixture.currentDate)
    await page.getByLabel('End date').fill(fixture.currentDate)
    await expect(page.getByText('Full-month plan comparisons are hidden for partial date ranges. Actual spending for those dates remains included in the other charts.')).toBeVisible()
    await expect(page.getByRole('region', { name: `Kakeibo ${fixture.currentMonth}` })).toHaveCount(0)
  }
})

test('Dashboard reports no saved plan honestly for the no-plan fixture', async ({ page, request }) => {
  test.skip(await hasRealApi(request), 'Uses the mock data source\'s ?demo= scenarios; it has no effect against the real API.')
  await page.goto('/?demo=no-plan')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first().click()
  await expect(page.getByText('No saved Kakeibo plans in this period.')).toBeVisible()
  await expect(page.getByText('Actual expense classifications in this period.')).toBeVisible()
})

test('a Dashboard analytics failure leaves other views usable', async ({ page, request }) => {
  test.skip(await hasRealApi(request), 'Uses the mock data source\'s ?demo= failure scenario; it has no effect against the real API.')
  await page.goto('/?demo=load-error&failing=analytics')
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first().click()
  await expect(page.getByRole('alert')).toContainText("Couldn't load Dashboard analytics.")
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Overview' }).first().click()
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeFocused()
  await expect(page.getByText('Net position', { exact: true })).toBeVisible()
})

test('Dashboard has no automated WCAG A/AA violations at phone and desktop widths', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openDashboard(page)
    const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description })), `axe violations at ${width}px`).toEqual([])
  }
})

test('Dashboard account filter stays inside a 320px screen when account names are long', async ({ page, request, baseURL }) => {
  test.skip(process.env.MONIKEY_DASHBOARD_API_FIXTURE !== '1', 'Needs the API-backed stack; the mock ledger has short account names.')
  const name = `Long wallet name for narrow screens ${Date.now() % 1_000_000}`
  const created = await request.post(`${baseURL}/api/accounts`, { data: { name, type: 'cash', opening_balance: '0.00', opening_debt: '0.00', credit_limit: null } })
  expect(created.status(), await created.text()).toBe(201)
  await page.setViewportSize({ width: 320, height: 844 })
  await openDashboard(page)
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
  expect(dimensions.scroll, 'horizontal overflow at 320px with a long account name').toBeLessThanOrEqual(dimensions.width)
  const filter = await page.getByRole('combobox', { name: 'Filter analytics by account' }).boundingBox()
  expect((filter?.x ?? 0) + (filter?.width ?? 999)).toBeLessThanOrEqual(dimensions.width)
})
