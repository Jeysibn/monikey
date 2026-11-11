import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

import { hasRealApi } from './fixtures'

// Evidence screenshots stay in test-results (ignored by git); the tests never write into docs/.
const screenshots = 'test-results/browser'

async function openDashboard(page: import('@playwright/test').Page) {
  await page.goto('/')
  const navigation = page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first()
  await navigation.click()
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Monthly financial summary' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Spending analysis' })).toBeVisible()
}

async function seedAnalyticsApi(baseURL: string, request: import('@playwright/test').APIRequestContext) {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${baseURL}${path}`, { data })
    expect(response.status(), `${path}: ${await response.text()}`).toBe(201)
    return response.json()
  }
  const account = async (name: string, type: string) => post('/api/accounts', { name, type, opening_balance: '0.00', opening_debt: '0.00', credit_limit: type === 'credit_card' ? '50000.00' : null })
  // Several tests share this ledger, so post it once: the fixed account names would otherwise collide on a second call.
  const accountsNow = await (await request.get(`${baseURL}/api/accounts`)).json() as { name: string }[]
  if (!accountsNow.some((a) => a.name === 'Cash on hand')) {
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


const FIXTURE = process.env.MONIKEY_DASHBOARD_API_FIXTURE === '1'

/** The synthetic October 2026 ledger: the mock's built-in data, or the same records posted to the real API. */
async function useOctoberLedger(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext, baseURL: string | undefined) {
  if (FIXTURE) await seedAnalyticsApi(baseURL!, request)
  await openDashboard(page)
  await page.getByLabel('Month', { exact: true }).selectOption({ label: 'October 2026' })
  await page.getByLabel('Analysis date range').selectOption('custom')
  await page.getByLabel('Analysis start date').fill('2026-10-01')
  await page.getByLabel('Analysis end date').fill('2026-10-25')
}
const kpi = (page: import('@playwright/test').Page, label: string) => page.locator('section[aria-labelledby="dashboard-reporting-title"]').getByText(label, { exact: true }).locator('xpath=..')

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // axe and screenshots see settled colors, not a half-finished fade
})

test('Dashboard fits every supported width, with both date controls, and keeps navigation responsive', async ({ page }) => {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 })
    await openDashboard(page)
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
    expect(dimensions.scroll, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.width)
    await expect(page.getByLabel('Month', { exact: true })).toBeVisible() // Reporting Month
    await expect(page.getByRole('combobox', { name: 'Analysis date range' })).toBeVisible() // Analysis range
    await expect(page.getByRole('combobox', { name: 'Filter the analysis by account' })).toBeVisible()
    if ([320, 390, 1440].includes(width)) await page.screenshot({ path: `${screenshots}/dashboard-${width}.png`, fullPage: true })
  }
})

test('monthly KPIs show the reporting month and are never changed by the analysis range, the account filter or sorting', async ({ page, request, baseURL }) => {
  await useOctoberLedger(page, request, baseURL)
  const kpis = page.locator('section[aria-labelledby="dashboard-reporting-title"]')
  await expect(kpi(page, 'Total income')).toContainText('₱36,500.00')
  await expect(kpi(page, 'Total expenses')).toContainText('₱27,127.40')
  await expect(kpi(page, 'Period surplus')).toContainText('₱9,372.60')
  await expect(kpi(page, 'Expense-to-income ratio')).toContainText('74.3%')
  await expect(kpis.locator('[data-scope="all-accounts"]')).toHaveText('All accounts') // the monthly section says what it covers
  const before = await kpis.innerText()

  // Move the analysis range around, filter by account, sort: the monthly section must not change at all.
  for (const preset of ['7-days', 'last-month', '3-months', 'this-year']) {
    await page.getByLabel('Analysis date range').selectOption(preset)
    await expect(page.getByText('Spending analysis')).toBeVisible()
  }
  await page.getByLabel('Analysis date range').selectOption('custom')
  await page.getByLabel('Analysis start date').fill('2026-10-18')
  await page.getByLabel('Analysis end date').fill('2026-10-22')
  await page.getByLabel('Filter the analysis by account').selectOption('2')
  await expect(page.getByText(/Main Savings only/)).toBeVisible() // the analysis says it is filtered ...
  await expect(kpis.locator('[data-scope="all-accounts"]')).toHaveText('All accounts') // ... the monthly section does not change
  await page.getByLabel('Sort categories by').selectOption('az')
  await expect(page.getByText('Thu, Oct 1, 2026')).toHaveCount(0) // the analysis really did move to 5 days
  expect(await kpis.innerText()).toBe(before)

  // And the other way round: a different reporting month leaves the analysis description alone.
  const analysisText = await page.locator('section[aria-labelledby="dashboard-analysis-title"] p').filter({ hasText: 'days (Manila dates' }).innerText()
  await page.getByLabel('Month', { exact: true }).selectOption({ label: 'September 2026' })
  await expect(kpi(page, 'Total income')).toContainText('₱0.00')
  await expect(kpi(page, 'Expense-to-income ratio')).toContainText('Not available') // no income: not infinity, not zero
  await expect(page.getByText(/No income recorded in September 2026, so there is no ratio/)).toBeVisible()
  expect(await page.locator('section[aria-labelledby="dashboard-analysis-title"] p').filter({ hasText: 'days (Manila dates' }).innerText()).toBe(analysisText)
})

test('analysis figures cover every day: zero-spend days, weekday occurrences, highest day and insights', async ({ page, request, baseURL }) => {
  await useOctoberLedger(page, request, baseURL)
  await expect(page.getByText('Thu, Oct 1, 2026 to Sun, Oct 25, 2026 · 25 days')).toBeVisible()
  const insights = page.locator('section[aria-labelledby="dashboard-insights-title"]')
  await expect(insights).toContainText('₱1,085.10') // 27,127.40 / 25 days, rounded half up
  await expect(insights).toContainText('Expense transactions')
  await expect(insights.getByText('15', { exact: true })).toBeVisible()
  await expect(insights).toContainText('₱8,500.00')
  await expect(insights).toContainText('Fri, Oct 2, 2026')
  await expect(insights).toContainText('10 of 25')
  await expect(page.getByText(/Top category:/)).toContainText('Bills')

  // The daily table has one row per date, zero days included; the weekday table counts occurrences.
  const daily = page.getByRole('region', { name: 'Daily spending' })
  await daily.getByRole('button', { name: 'Show data table' }).click()
  await expect(daily.getByRole('table').getByRole('row')).toHaveCount(26) // header + 25 days
  await expect(daily.getByRole('row', { name: /Thu, Oct 1, 2026.*₱0\.00/ })).toBeVisible()
  const weekday = page.getByRole('region', { name: 'Spending by weekday' })
  await weekday.getByRole('button', { name: 'Show data table' }).click()
  const rows = await weekday.getByRole('table').getByRole('row').allInnerTexts()
  expect(rows).toHaveLength(8)
  const occurrences = rows.slice(1).map((row) => Number(row.trim().split(/\s+/).at(-1)))
  expect(occurrences).toEqual([3, 3, 3, 4, 4, 4, 4]) // Mon..Sun in Oct 1-25, 2026 (starts on a Thursday)
  expect(occurrences.reduce((a, b) => a + b, 0)).toBe(25)
})

test('category sorting, the Kakeibo plan versus actual and the daily envelope table agree with the ledger', async ({ page, request, baseURL }) => {
  await useOctoberLedger(page, request, baseURL)
  const categories = page.getByRole('region', { name: 'Spending by category' })
  const names = async () => (await categories.getByRole('list', { name: 'Categories' }).locator('li').allInnerTexts()).map((t) => t.split('\n')[0]!.trim())
  await expect(categories.getByRole('list', { name: 'Categories' }).locator('li').first()).toBeVisible() // wait for the real API to answer
  expect((await names())[0]).toBe('Bills') // highest first
  await page.getByLabel('Sort categories by').selectOption('low')
  expect((await names())[0]).toBe('Transportation')
  await page.getByLabel('Sort categories by').selectOption('az')
  expect((await names()).slice(0, 3)).toEqual(['Bills', 'Food', 'Groceries'])
  await expect(categories).toContainText('Total spent')

  const plan = page.getByRole('region', { name: /Kakeibo: plan vs actual/ })
  await expect(plan).toContainText('₱19,951.90')
  await expect(plan).toContainText('of ₱18,000.00')
  await expect(plan).toContainText('Over by ₱1,951.90') // over the limit in words, not only color
  await expect(plan).toContainText('Remaining ₱1,136.00') // wants
  await expect(plan).toContainText('Not classified')
  await expect(plan).toContainText('Savings targets are goals, not spending')

  const kakeiboDaily = page.getByRole('region', { name: 'Daily Kakeibo spending' })
  await kakeiboDaily.getByRole('button', { name: 'Show data table' }).click()
  await expect(kakeiboDaily.getByRole('columnheader')).toHaveText(['Date', 'Needs', 'Wants', 'Culture', 'Unexpected', 'Not classified', 'Total'])
  await expect(kakeiboDaily).toContainText('This is spending, not a daily budget')
})

test('charts can be read with the keyboard and announce the value', async ({ page, request, baseURL }) => {
  await useOctoberLedger(page, request, baseURL)
  const chart = page.getByRole('group', { name: /Spending for each of the 25 days/ })
  await chart.focus()
  await page.keyboard.press('Home')
  await expect(page.getByText('Thu, Oct 1, 2026: Spent ₱0.00')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('Fri, Oct 2, 2026: Spent ₱8,500.00')).toBeVisible()
  await page.keyboard.press('End')
  await expect(page.getByText(/Sun, Oct 25, 2026: Spent/)).toBeVisible()
  const monthly = page.getByRole('group', { name: /Income and expenses for each of the 6 months up to October 2026/ })
  await monthly.focus()
  await expect(page.getByText(/October 2026.*Income ₱36,500\.00 · Expenses ₱27,127\.40/)).toBeVisible()
})

test('a bad analysis range is explained and never requested', async ({ page, request, baseURL }) => {
  await useOctoberLedger(page, request, baseURL)
  const analytics: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/analytics')) analytics.push(r.url()) })
  await page.getByLabel('Analysis start date').fill('2026-10-20')
  await page.getByLabel('Analysis end date').fill('2026-10-10')
  await expect(page.getByRole('alert').filter({ hasText: 'on or before the end date' })).toBeVisible()
  await page.getByLabel('Analysis end date').fill('2026-10-25')
  await expect(page.getByRole('alert').filter({ hasText: 'on or before' })).toHaveCount(0)
  // A range longer than 366 days is refused in words too.
  await page.getByLabel('Analysis start date').fill('2025-01-01')
  await expect(page.getByRole('alert').filter({ hasText: '366 days' })).toBeVisible()
  // Only a range that cannot be valid must never reach the server: 20 Oct to 25 Oct (typed first) is fine to request.
  if (FIXTURE) expect(analytics.filter((url) => url.includes('start_date=2025-01-01') || url.includes('end_date=2026-10-10'))).toEqual([])
})

test('Dashboard reports no saved plan honestly for the no-plan fixture', async ({ page, request }) => {
  test.skip(await hasRealApi(request), 'Uses the mock data source\'s ?demo= scenarios; it has no effect against the real API.')
  await page.goto('/?demo=no-plan')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first().click()
  await expect(page.getByText('No plan was saved for October 2026. Actual spending by envelope is shown without limits.')).toBeVisible()
  await expect(page.getByRole('region', { name: /Kakeibo: plan vs actual/ })).toContainText('no limit')
})

test('an analytics failure shows a retry in each section and leaves other views usable', async ({ page, request }) => {
  test.skip(await hasRealApi(request), 'Uses the mock data source\'s ?demo= failure scenario; it has no effect against the real API.')
  await page.goto('/?demo=load-error&failing=analytics')
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first().click()
  await expect(page.getByRole('alert').filter({ hasText: /load the monthly summary/ })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: /load the spending analysis/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(2)
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Overview' }).first().click()
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeFocused()
  await expect(page.getByText('Net position', { exact: true })).toBeVisible()
})

test('a Dashboard chunk that cannot load shows an error boundary with Try again and the rest of the app keeps working', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/DashboardView*', (route) => route.abort())
  await page.goto('/')
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first().click()
  const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load the Dashboard.' })
  await expect(alert).toBeVisible()
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Overview' }).first().click() // navigation still works
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
  await expect(alert).toHaveCount(0)
  // React caches a failed lazy import, so going back in without a reload fails the same way: that is why Try again reloads the page.
  await page.unroute('**/DashboardView*')
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first().click()
  await expect(alert).toBeVisible()
  await Promise.all([page.waitForNavigation(), alert.getByRole('button', { name: 'Try again' }).click()])
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first().click()
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible() // recovered once the file is reachable
})

test('Dashboard has no automated WCAG A/AA violations, tables open or closed, at phone and desktop widths', async ({ page, request, baseURL }) => {
  await useOctoberLedger(page, request, baseURL)
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const open of [false, true]) {
      const closed = page.getByRole('button', { name: 'Show data table' })
      if (open) while ((await closed.count()) > 0) await closed.first().click() // each click renames its button, so always take the first one left
      const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations.map(({ id, impact, description, nodes }) => ({ id, impact, description, where: nodes.map((n) => n.target.join(' ')).slice(0, 2) })), `axe at ${width}px, tables ${open ? 'open' : 'closed'}`).toEqual([])
    }
  }
})

test('Dashboard account filter stays inside a 320px screen when account names are long', async ({ page, request, baseURL }) => {
  test.skip(!FIXTURE, 'Needs the API-backed stack; the mock ledger has short account names.')
  const name = `Long wallet name for narrow screens ${Date.now() % 1_000_000}`
  const created = await request.post(`${baseURL}/api/accounts`, { data: { name, type: 'cash', opening_balance: '0.00', opening_debt: '0.00', credit_limit: null } })
  expect(created.status(), await created.text()).toBe(201)
  await page.setViewportSize({ width: 320, height: 844 })
  await openDashboard(page)
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
  expect(dimensions.scroll, 'horizontal overflow at 320px with a long account name').toBeLessThanOrEqual(dimensions.width)
  const filter = await page.getByRole('combobox', { name: 'Filter the analysis by account' }).boundingBox()
  expect((filter?.x ?? 0) + (filter?.width ?? 999)).toBeLessThanOrEqual(dimensions.width)
})
