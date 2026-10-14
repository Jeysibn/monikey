import { expect, test, request as pwRequest, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'

// Real-backend V3 flow. Needs the API on :3000 (disposable DB) and the Vite dev server
// (VITE_FINANCE_BACKEND=true) as PLAYWRIGHT_TEST_BASE_URL. Not part of the mock suite.
const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:5173'
const headers = { Origin: origin }
const stateFile = path.resolve(process.cwd(), 'test-results/v3-backend-state.json')
const shotDir = path.resolve(process.cwd(), '../docs/remake/screenshots/stage5a')
const VIEWPORTS = { mobile: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } } as const

const iso = (daysAgo: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10) }
async function shot(page: Page, name: string) { await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false }) }
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

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

test.beforeAll(async () => {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  const api = await pwRequest.newContext({ baseURL: origin, extraHTTPHeaders: headers })
  const email = `v3-backend-${Date.now()}@monikey.test`
  const reg = await api.post('/api/v1/auth/register', { data: { email, password: 'v3-backend-password', displayName: 'V3 Backend Tester' } })
  expect(reg.status()).toBe(201)
  const mk = async (url: string, data: object) => { const r = await api.post(url, { data }); expect(r.status(), url).toBe(201); return (await r.json()) as { id?: string; transaction?: { id: string } } }
  const bdo = (await mk('/api/v1/accounts', { name: 'BDO Checking', accountType: 'checking', institution: 'BDO', openingBalanceMinor: '5000000', lastFour: '4242' })).id!
  await mk('/api/v1/accounts', { name: 'BPI Savings', accountType: 'savings', institution: 'BPI', openingBalanceMinor: '12000000', lastFour: '1188' })
  const gcash = (await mk('/api/v1/accounts', { name: 'GCash', accountType: 'ewallet', institution: 'GCash', openingBalanceMinor: '150000' })).id!
  await mk('/api/v1/accounts', { name: 'Cash Wallet', accountType: 'cash', openingBalanceMinor: '320000' })
  const card = (await mk('/api/v1/credit-cards', { name: 'Visa Platinum', network: 'visa', lastFour: '9001', creditLimitMinor: '8000000', dueDay: 20, openingBalanceMinor: '0', minimumPaymentMinor: '50000' })).id!
  const boot = await (await api.get('/api/v1/bootstrap')).json() as { financeState: { categories: { id: string; allowsExpense: boolean; allowsIncome: boolean }[] } }
  const exp = boot.financeState.categories.find((c) => c.allowsExpense)!.id
  const inc = boot.financeState.categories.find((c) => c.allowsIncome)?.id ?? null
  await mk('/api/v1/transactions', { type: 'income', title: 'Salary', toAccountId: bdo, categoryId: inc, amountMinor: '4500000', occurredOn: iso(12) })
  await mk('/api/v1/transactions', { type: 'expense', title: 'Jollibee Lunch', fromAccountId: gcash, categoryId: exp, amountMinor: '28900', occurredOn: iso(1) })
  await mk('/api/v1/transactions', { type: 'expense', title: 'Lazada Order', fromAccountId: card, categoryId: exp, amountMinor: '250000', occurredOn: iso(2) })
  await mk('/api/v1/transactions', { type: 'expense', title: '100% Organic Market', fromAccountId: bdo, categoryId: exp, amountMinor: '45000', occurredOn: iso(3) })
  await mk('/api/v1/transactions', { type: 'transfer', title: 'Card payment', fromAccountId: bdo, toAccountId: card, amountMinor: '100000', occurredOn: iso(4) })
  const bad = await mk('/api/v1/transactions', { type: 'expense', title: 'Mistaken Charge', fromAccountId: bdo, categoryId: exp, amountMinor: '99900', occurredOn: iso(5) })
  const rev = await api.post(`/api/v1/transactions/${bad.transaction!.id}/reverse`, { data: {} })
  expect(rev.status()).toBe(201)
  for (let i = 1; i <= 60; i++) await mk('/api/v1/transactions', { type: 'expense', title: `Seed purchase ${i}`, fromAccountId: bdo, categoryId: exp, amountMinor: String(10000 + i * 100), occurredOn: iso(6 + (i % 40)) })
  await api.storageState({ path: stateFile })
  await api.dispose()
})


test('Overview loads backend data with featured accounts and links into V3 pages', async ({ page }) => {
  await page.goto('/?v3=1')
  await expect(page).toHaveURL(/\/v3$/)
  const cards = page.getByRole('list', { name: 'Featured accounts' }).getByRole('listitem')
  await expect(cards).toHaveCount(4)
  const visa = page.getByRole('link', { name: /Visa Platinum credit card, outstanding balance owed/ })
  await expect(visa).toContainText('Owed')
  await expect(visa).toContainText('1,500.00')   // 2,500 charge - 1,000 repayment
  await expect(visa).not.toContainText('78,500')   // available credit must never be shown as a balance
  await page.getByRole('tab', { name: 'Insights' }).click()
  await expect(page.getByRole('tab', { name: 'Insights' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Summary' }).click()
  await visa.click()
  await expect(page).toHaveURL(/\/v3\/accounts\?account=/)
  await expect(page.getByTestId('v3-card-owed')).toContainText('1,500.00')
  await page.goBack()
  await expect(page).toHaveURL(/\/v3$/)
  await page.getByRole('list', { name: 'Recent transactions' }).getByRole('link').first().click()
  await expect(page).toHaveURL(/\/v3\/activity\?tx=/)
  await expect(page.getByTestId('v3-activity-detail')).toBeVisible()
})

test('Activity: search (literal %), type filter, paging, reversal audit, Back/Forward', async ({ page }) => {
  await openV3(page, '/v3/activity')
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible()
  await expect(page.getByText('Jollibee Lunch').first()).toBeVisible()
  await expect(page.getByText('Mistaken Charge')).toHaveCount(0)               // reversed pair hidden
  await expect(page.getByText('Load more')).toBeVisible()                       // >50 rows => server paging
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByText('Salary').first()).toBeVisible()
  await page.getByLabel('Search transactions').fill('%')
  await expect(page).toHaveURL(/q=%25/)
  await expect(page.getByText('100% Organic Market').first()).toBeVisible()
  await expect(page.getByText('Jollibee Lunch')).toHaveCount(0)
  await page.getByLabel('Search transactions').fill('')
  await page.getByRole('button', { name: /Filters/ }).click()
  await page.getByLabel('Type', { exact: true }).selectOption('income')
  await expect(page).toHaveURL(/type=income/)
  await expect(page.locator('li, tr, [role=listitem]').getByText('Salary').first()).toBeVisible()
  await page.goBack()
  await expect(page).not.toHaveURL(/type=income/)
  await page.goForward()
  await expect(page).toHaveURL(/type=income/)
  await page.getByRole('button', { name: 'Clear filters' }).first().click()
  await page.getByLabel(/Show reversed/).click()
  await expect(page).toHaveURL(/reversed=1/)
  await expect(page.getByLabel(/Show reversed/)).toBeChecked()
  await expect(page.getByText('Mistaken Charge').first()).toBeVisible()
  await expect(page.getByText(/reversed/i).first()).toBeVisible()
})

test('Activity: card charge and repayment are not labelled as expenses/income', async ({ page }) => {
  await openV3(page, '/v3/activity?q=Card%20payment')
  const pay = page.getByRole('row', { name: /Card payment/ })
  await expect(pay).toContainText('Card repayment')
  await expect(pay).not.toContainText('Expense')
  await page.goto('/v3/activity?q=Lazada')
  await expect(page.getByRole('row', { name: /Lazada Order/ })).toContainText('Card charge')
})

test('Activity: reverse a transaction through the confirm dialog', async ({ page }) => {
  await openV3(page, '/v3/activity?q=Seed%20purchase%201')
  await page.getByRole('button', { name: 'Reverse Seed purchase 1', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Reverse/ }).click()
  await expect(page.getByText(/was reversed/)).toBeVisible()
})

test('Accounts: create, edit (no balance field), archive, account -> filtered Activity', async ({ page }) => {
  await openV3(page, '/v3/accounts')
  await page.getByRole('button', { name: 'Add account', exact: true }).click()
  await page.getByRole('button', { name: 'Add account', exact: true }).last().click()
  await expect(page.getByRole('alert')).toContainText(/name is required/i)
  await page.getByLabel('Name', { exact: true }).fill('Maya Wallet')
  await page.getByLabel('Type', { exact: true }).selectOption('ewallet')
  await page.getByLabel('Starting balance').fill('1500.50')
  await page.getByRole('form', { name: 'Add account' }).getByRole('button', { name: 'Add account' }).click()
  const maya = page.getByRole('button', { name: /^Maya Wallet, balance/ })
  await expect(maya).toContainText('1,500.50')
  await maya.click()
  await expect(page.getByTestId('v3-account-details')).toHaveCount(1)
  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.getByRole('form', { name: 'Edit account details' }).getByLabel(/balance/i)).toHaveCount(0)
  await page.getByLabel('Name', { exact: true }).fill('Maya Savings')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: /^Maya Savings, balance/ })).toBeVisible()
  await page.getByRole('button', { name: /^BDO Checking, balance/ }).click()
  await expect(page.getByTestId('v3-account-details')).toHaveCount(1)
  await expect(page.getByRole('list', { name: 'Recent transactions on this account' })).toBeVisible()
  await page.getByRole('link', { name: 'View all activity' }).click()
  await expect(page).toHaveURL(/\/v3\/activity\?account=/)
  await expect(page.getByText('Jollibee Lunch')).toHaveCount(0)               // GCash row excluded
  await page.goBack()
  await expect(page).toHaveURL(/\/v3\/accounts\?account=/)
  await page.getByRole('button', { name: /^Maya Savings, balance/ }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByRole('button', { name: /^Maya Savings/ })).toHaveCount(0)
})

test('Activity shows an explicit error state and recovers', async ({ page }) => {
  await openV3(page, '/v3/activity')
  await expect(page.getByText('Jollibee Lunch').first()).toBeVisible()
  await page.route('**/api/v1/transactions?**', (r) => r.abort())
  await page.getByLabel('Search transactions').fill('zz')
  await expect(page.getByRole('alert')).toContainText(/could not be loaded/i)
  await page.unroute('**/api/v1/transactions?**')
  await page.getByRole('button', { name: /Try again|Retry/ }).click()
  await expect(page.getByText(/No transactions match/)).toBeVisible()
})

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`screenshots + layout @ ${name}`, async ({ page }) => {
    await page.setViewportSize(vp)
    await page.goto('/?v3=1')
    await expect(page.getByRole('list', { name: 'Featured accounts' })).toBeVisible()
    await shot(page, `overview-${name}`)
    expect(await noOverflow(page)).toBe(true)
    await page.goto('/v3/activity')
    await expect(page.getByText('Jollibee Lunch').first()).toBeVisible()
    await shot(page, `activity-${name}`)
    expect(await noOverflow(page)).toBe(true)
    const a1 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(a1.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await page.goto('/v3/accounts')
    await expect(page.getByRole('list', { name: 'Accounts' })).toBeVisible()
    await shot(page, `accounts-${name}`)
    expect(await noOverflow(page)).toBe(true)
    await page.getByRole('button', { name: /^Visa Platinum/ }).click()
    await expect(page.getByTestId('v3-account-details')).toBeVisible()
    await shot(page, `accounts-expanded-${name}`)
    expect(await noOverflow(page)).toBe(true)
    const a2 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(a2.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}
