import { isolatedClient } from './helpers/isolation'
import { expect, test, request as pwRequest, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'

// Stage 5B real-backend Quick Add flows. Needs the API on :3000 (disposable DB) and Vite (VITE_FINANCE_BACKEND=true).
const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:5173'
const stateFile = path.resolve(process.cwd(), 'test-results/v3-quickadd-state.json')
const shotDir = path.resolve(process.cwd(), '../docs/remake/screenshots/stage5b')
const email = `v3-qa-${Date.now()}@monikey.test`
async function shot(page: Page, name: string) { await page.waitForTimeout(400); fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false }) }

fs.mkdirSync(path.dirname(stateFile), { recursive: true })
fs.writeFileSync(stateFile, JSON.stringify({ cookies: [], origins: [] }))
test.skip(process.env.V3_BACKEND_LOCAL !== '1', 'Needs a real local backend: set V3_BACKEND_LOCAL=1 and PLAYWRIGHT_TEST_BASE_URL')
test.describe.configure({ mode: 'serial' })
test.use({ storageState: stateFile })

interface Boot { financeState: { accounts: { id: string; name: string; currentBalanceMinor: string }[]; transactions: { id: string; type: string; title: string; amountMinor: string; feeMinor?: string; idempotencyKey?: string }[]; categories: { id: string; name: string; allowsExpense: boolean; allowsIncome: boolean }[] } }
const ids: Record<string, string> = {}
let catExpense = ''
let catIncome = ''
const bal = async (page: Page, name: string) => BigInt(((await (await page.request.get('/api/v1/bootstrap')).json()) as Boot).financeState.accounts.find((a) => a.name === name)!.currentBalanceMinor)
const txs = async (page: Page) => ((await (await page.request.get('/api/v1/bootstrap')).json()) as Boot).financeState.transactions

async function openV3(page: Page, route = '/v3') {
  await page.goto('/?v3=1')
  await expect(page).toHaveURL(/\/v3$/)
  if (route !== '/v3') await page.goto(route)
  await expect(page.getByRole('main')).toBeVisible()
}
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Quick add' })
async function openAdd(page: Page) {
  await page.getByRole('button', { name: /^Add/ }).first().click()
  await expect(sheet(page)).toBeVisible()
}

test.beforeAll(async () => {
  const api = await pwRequest.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin, ...isolatedClient() } })
  expect((await api.post('/api/v1/auth/register', { data: { email, password: 'v3-quickadd-password', displayName: 'QuickAdd Tester' } })).status()).toBe(201)
  const mk = async (url: string, data: object) => { const r = await api.post(url, { data }); expect(r.status(), url).toBe(201); return (await r.json()) as { id: string } }
  ids.bdo = (await mk('/api/v1/accounts', { name: 'BDO Checking', accountType: 'checking', institution: 'BDO', openingBalanceMinor: '10000000', lastFour: '4242' })).id
  ids.bpiOne = (await mk('/api/v1/accounts', { name: 'BPI Savings', accountType: 'savings', institution: 'BPI', openingBalanceMinor: '5000000', lastFour: '1188' })).id
  ids.bpiTwo = (await mk('/api/v1/accounts', { name: 'BPI Savings', accountType: 'savings', institution: 'BPI Family', openingBalanceMinor: '200000', lastFour: '2299' })).id
  ids.cash = (await mk('/api/v1/accounts', { name: 'Cash Wallet', accountType: 'cash', openingBalanceMinor: '300000' })).id
  ids.visa = (await mk('/api/v1/credit-cards', { name: 'Visa Platinum', network: 'visa', lastFour: '9001', creditLimitMinor: '8000000', dueDay: 20, openingBalanceMinor: '250000' })).id
  const fav = await api.put('/api/v1/accounts/favorites', { data: { accountIds: [ids.bdo, ids.visa] } })
  expect(fav.status(), await fav.text()).toBe(200)
  const boot = (await (await api.get('/api/v1/bootstrap')).json()) as Boot
  expect(boot.financeState.categories.length, JSON.stringify(boot).slice(0, 400)).toBeGreaterThan(0)
  catExpense = boot.financeState.categories.find((c) => c.allowsExpense)!.id
  catIncome = boot.financeState.categories.find((c) => c.allowsIncome)!.id
  await api.storageState({ path: stateFile })
  await api.dispose()
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Add opens the V3 sheet (not the legacy modal); favorites first; touch targets and safe layout', async ({ page }) => {
    await openV3(page)
    await openAdd(page)
    await expect(page.getByRole('dialog', { name: 'Add Transaction' })).toHaveCount(0)
    const options = await sheet(page).getByLabel('Paid from').locator('option').allTextContents()
    expect(options[1]).toMatch(/BDO Checking/)
    expect(options[2]).toMatch(/Visa Platinum/)
    await expect(sheet(page).getByLabel('Paid from').locator('optgroup').first()).toHaveAttribute('label', 'Favorites')
    await expect(sheet(page).getByLabel('Paid from')).toHaveValue(ids.bdo)
    for (const loc of [sheet(page).getByRole('radio').first().locator('xpath=following-sibling::span'), sheet(page).getByLabel('Amount'), sheet(page).getByRole('button', { name: 'Add expense' }), sheet(page).getByRole('button', { name: 'Close quick add' })]) {
      const box = (await loc.boundingBox())!
      expect(box.height, 'touch height').toBeGreaterThanOrEqual(47.5)
      expect(box.width).toBeGreaterThanOrEqual(47.5)
    }
    await page.waitForTimeout(300) // let the open animation finish
    const sb = (await sheet(page).boundingBox())!
    expect(sb.y + sb.height).toBeLessThanOrEqual(844 + 0.5)
    const results = await new AxeBuilder({ page }).include('dialog.v3-qa').analyze()
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
    await shot(page, 'mobile-expense')
  })

  test('expense from an asset account: exact balance, counted once, Activity and Overview refresh', async ({ page }) => {
    await openV3(page, '/v3/activity')
    const before = await bal(page, 'BDO Checking'); const n = (await txs(page)).length
    await openAdd(page)
    await sheet(page).getByLabel('Amount').fill('1,234.56')
    await sheet(page).getByLabel('Category').selectOption(catExpense)
    await sheet(page).getByRole('button', { name: /optional details/ }).click()
    await sheet(page).getByLabel('Description').fill('Groceries run')
    await sheet(page).getByRole('button', { name: 'Add expense' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(await bal(page, 'BDO Checking')).toBe(before - 123456n)
    const after = await txs(page)
    expect(after.length).toBe(n + 1)
    expect(after.filter((t) => t.title === 'Groceries run')).toHaveLength(1)
    await expect(page.getByText('Groceries run').first()).toBeVisible()
    await page.getByRole('link', { name: 'Overview' }).first().click()
    await expect(page.getByText('Groceries run').first()).toBeVisible()
  })

  test('card purchase raises the liability once; income never offers a card and credits the asset', async ({ page }) => {
    await openV3(page)
    const owed = await bal(page, 'Visa Platinum'); const n = (await txs(page)).length
    await openAdd(page)
    await sheet(page).getByLabel('Amount').fill('500')
    await sheet(page).getByLabel('Paid from').selectOption(ids.visa)
    await sheet(page).getByLabel('Category').selectOption(catExpense)
    await sheet(page).getByRole('button', { name: 'Add expense' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(await bal(page, 'Visa Platinum')).toBe(owed + 50000n)
    expect((await txs(page)).length).toBe(n + 1)

    const cash = await bal(page, 'Cash Wallet')
    await openAdd(page)
    await sheet(page).getByRole('radio', { name: 'Income' }).click()
    const dest = await sheet(page).getByLabel('Deposit to').locator('option').allTextContents()
    expect(dest.some((t) => /Visa/.test(t))).toBe(false)
    await sheet(page).getByLabel('Amount').fill('75.25')
    await sheet(page).getByLabel('Deposit to').selectOption(ids.cash)
    await sheet(page).getByLabel('Category').selectOption(catIncome)
    await sheet(page).getByRole('button', { name: 'Add income' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(await bal(page, 'Cash Wallet')).toBe(cash + 7525n)
    await openAdd(page)
    await sheet(page).getByRole('radio', { name: 'Income' }).click()
    await shot(page, 'mobile-income')
  })

  test('transfer with fee between similarly named accounts; not income or spending', async ({ page }) => {
    await openV3(page)
    const a = await bal(page, 'BDO Checking'); const t = await txs(page)
    await openAdd(page)
    await sheet(page).getByRole('radio', { name: 'Transfer' }).click()
    await sheet(page).getByLabel('Amount').fill('1000')
    await sheet(page).getByLabel('From').selectOption(ids.bpiOne)
    const to = await sheet(page).getByLabel('To').locator('option').allTextContents()
    expect(to.filter((x) => /BPI Savings/.test(x))).toHaveLength(1) // source is excluded
    expect(to.join(' ')).toMatch(/BPI Family/)
    await sheet(page).getByLabel('To').selectOption(ids.bpiTwo)
    await sheet(page).getByRole('button', { name: /optional details/ }).click()
    await sheet(page).getByLabel('Transfer fee').fill('15')
    await shot(page, 'mobile-transfer')
    const one = await bal(page, 'BPI Savings')
    await sheet(page).getByRole('button', { name: 'Add transfer' }).click()
    await expect(sheet(page)).toHaveCount(0)
    const list = (await (await page.request.get('/api/v1/bootstrap')).json()) as Boot
    const savings = list.financeState.accounts.filter((x) => x.name === 'BPI Savings').map((x) => BigInt(x.currentBalanceMinor)).sort()
    expect(savings).toEqual([200000n + 100000n, 5000000n - 100000n - 1500n].sort())
    expect(one).toBeDefined(); expect(await bal(page, 'BDO Checking')).toBe(a)
    const added = (await txs(page)).filter((x) => !t.some((y) => y.id === x.id))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ type: 'transfer', amountMinor: '100000' })
  })

  test('card payment: reduces cash and debt, is a transfer (not spending), overpayment blocked client- and server-side', async ({ page }) => {
    await openV3(page)
    const cash = await bal(page, 'Cash Wallet'); const owed = await bal(page, 'Visa Platinum'); const before = await txs(page)
    await openAdd(page)
    await sheet(page).getByRole('radio', { name: 'Card Payment' }).click()
    await expect(sheet(page).getByLabel('Category')).toHaveCount(0)
    await expect(sheet(page).getByLabel('Credit card')).toHaveValue(ids.visa)
    await sheet(page).getByLabel('Pay from').selectOption(ids.cash)
    await sheet(page).getByLabel('Amount').fill(String(Number(owed) / 100 + 1))
    await sheet(page).getByRole('button', { name: 'Pay card' }).click()
    await expect(sheet(page).getByText(/can't exceed/)).toBeVisible()
    await shot(page, 'mobile-card-payment-error')
    await sheet(page).getByLabel('Amount').fill('100')
    await shot(page, 'mobile-card-payment')
    await sheet(page).getByRole('button', { name: 'Pay card' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(await bal(page, 'Cash Wallet')).toBe(cash - 10000n)
    expect(await bal(page, 'Visa Platinum')).toBe(owed - 10000n)
    const added = (await txs(page)).filter((x) => !before.some((y) => y.id === x.id))
    expect(added).toHaveLength(1)
    expect(added[0]!.type).toBe('transfer')
    // The server rejects an over-payment independently of the UI.
    const over = await page.request.post('/api/v1/transactions', { headers: { Origin: origin }, data: { type: 'transfer', title: 'Over', fromAccountId: ids.cash, toAccountId: ids.visa, occurredOn: '2026-10-14', amountMinor: '999999999', feeMinor: '0', source: 'manual', status: 'cleared' } })
    expect(over.status()).toBeGreaterThanOrEqual(400)
  })

  test('validation error state keeps the entry, then recovers', async ({ page }) => {
    await openV3(page)
    await openAdd(page)
    await sheet(page).getByLabel('Amount').fill('20')
    await sheet(page).getByRole('button', { name: 'Add expense' }).click()
    await expect(sheet(page).getByText('Choose a category.')).toBeVisible()
    await expect(sheet(page).getByLabel('Category')).toBeFocused()
    await expect(sheet(page).getByLabel('Amount')).toHaveValue('20')
    await shot(page, 'mobile-validation-error')
    await sheet(page).getByLabel('Category').selectOption(catExpense)
    await expect(sheet(page).getByText('Choose a category.')).toHaveCount(0)
    await sheet(page).getByRole('button', { name: 'Add expense' }).click()
    await expect(sheet(page)).toHaveCount(0)
  })

  test('rapid repeated submit posts exactly once', async ({ page }) => {
    await openV3(page)
    const before = (await txs(page)).length
    await openAdd(page)
    await sheet(page).getByLabel('Amount').fill('33.33')
    await sheet(page).getByLabel('Category').selectOption(catExpense)
    const btn = sheet(page).getByRole('button', { name: 'Add expense' })
    await btn.dblclick(); await btn.click({ force: true, timeout: 500 }).catch(() => undefined)
    await expect(sheet(page)).toHaveCount(0)
    await page.waitForTimeout(500)
    expect((await txs(page)).length).toBe(before + 1)
  })

  test('a response lost after the server posted is queued under the same key and posts exactly once', async ({ page }) => {
    await openV3(page)
    const before = await txs(page); const bdo = await bal(page, 'BDO Checking')
    let abort = true
    await page.route('**/api/v1/transactions', async (route) => {
      if (route.request().method() === 'POST' && abort) { await route.fetch(); await route.abort('failed'); return }
      await route.continue()
    })
    await openAdd(page)
    await sheet(page).getByLabel('Amount').fill('44')
    await sheet(page).getByLabel('Category').selectOption(catExpense)
    await sheet(page).getByRole('button', { name: 'Add expense' }).click()
    await expect(page.getByTestId('v3-qa-queued')).toContainText('not shown as posted')
    expect((await txs(page)).length).toBe(before.length + 1) // the server did post it
    abort = false
    await page.getByTestId('v3-qa-queued').getByRole('link', { name: 'Review in Sync Center' }).click()
    await expect(page.getByText(/create transaction · pending/)).toBeVisible()
    await page.getByRole('button', { name: 'Retry sync' }).click()
    await expect(page.getByText(/create transaction · synced/)).toBeVisible({ timeout: 15000 })
    const after = await txs(page)
    expect(after.length).toBe(before.length + 1) // replay with the same key did not duplicate
    expect(await bal(page, 'BDO Checking')).toBe(bdo - 4400n)
  })

  test('offline: queued (not posted), banner and Sync Center, then recovery posts once', async ({ page, context }) => {
    await openV3(page)
    const before = (await txs(page)).length; const bdo = await bal(page, 'BDO Checking')
    await context.setOffline(true)
    await openAdd(page)
    await sheet(page).getByLabel('Amount').fill('61.10')
    await sheet(page).getByLabel('Category').selectOption(catExpense)
    await sheet(page).getByRole('button', { name: 'Add expense' }).click()
    await expect(page.getByTestId('v3-qa-queued')).toBeVisible()
    await shot(page, 'mobile-offline-queued')
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTestId('v3-pending-sync')).toContainText('1 transaction queued, pending sync')
    await context.setOffline(false)
    expect((await txs(page)).length).toBe(before)
    await page.getByTestId('v3-pending-sync').getByRole('link', { name: 'Review in Sync Center' }).click()
    await page.getByRole('button', { name: 'Retry sync' }).click()
    await expect(page.getByText(/create transaction · synced/).first()).toBeVisible({ timeout: 15000 })
    expect((await txs(page)).length).toBe(before + 1)
    expect(await bal(page, 'BDO Checking')).toBe(bdo - 6110n)
  })
})

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test('compact centered dialog; Escape guards unsaved input; keyboard-only submit', async ({ page }) => {
    await openV3(page)
    await openAdd(page)
    const box = (await sheet(page).boundingBox())!
    expect(box.width).toBeLessThanOrEqual(500)
    expect(box.x).toBeGreaterThan(300)
    await shot(page, 'desktop-expense')
    await expect(sheet(page).getByLabel('Amount')).toBeFocused()
    await page.keyboard.type('12')
    await page.keyboard.press('Escape')
    await expect(sheet(page).getByText('Discard this entry?')).toBeVisible()
    await page.getByRole('button', { name: 'Keep editing' }).click()
    await expect(sheet(page).getByLabel('Amount')).toHaveValue('12')
    // keyboard-only: category by keyboard, Enter submits
    await sheet(page).getByLabel('Category').focus()
    await page.keyboard.press('ArrowDown')
    await expect(sheet(page).getByLabel('Category')).not.toHaveValue('')
    await sheet(page).getByLabel('Amount').focus()
    await page.keyboard.press('Enter')
    await expect(sheet(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Add/ }).first()).toBeFocused()
  })

  test('desktop card payment and expanded optional details screenshots', async ({ page }) => {
    await openV3(page)
    await openAdd(page)
    await sheet(page).getByRole('radio', { name: 'Card Payment' }).click()
    await sheet(page).getByLabel('Amount').fill('25')
    await shot(page, 'desktop-card-payment')
    await sheet(page).getByRole('radio', { name: 'Transfer' }).click()
    await sheet(page).getByRole('button', { name: /optional details/ }).click()
    await sheet(page).getByLabel('Description').fill('Move to savings')
    await expect(sheet(page).getByLabel('Transfer fee')).toBeVisible()
    await shot(page, 'desktop-optional-details')
  })

  test('empty-state actions open Quick Add', async ({ page }) => {
    const api = await pwRequest.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin, ...isolatedClient() } })
    const e = `v3-qa-empty-${Date.now()}@monikey.test`
    await api.post('/api/v1/auth/register', { data: { email: e, password: 'v3-quickadd-password', displayName: 'Empty' } })
    await api.post('/api/v1/accounts', { data: { name: 'Solo', accountType: 'checking', openingBalanceMinor: '1000' } })
    const empty = await (await import('@playwright/test')).chromium.launch()
    const ctx = await empty.newContext({ baseURL: origin, storageState: await api.storageState() })
    const p = await ctx.newPage()
    await p.goto('/?v3=1'); await expect(p).toHaveURL(/\/v3$/); await p.goto('/v3/activity')
    await p.getByRole('button', { name: 'Add a transaction' }).click()
    await expect(sheet(p)).toBeVisible()
    await ctx.close(); await empty.close(); await api.dispose()
  })
})
