import { expect, test } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:8080'

test('offline snapshot and transaction outbox replay through Compose @backend-compose @offline-compose', async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const email = `offline-compose-${unique}@monikey.test`
  const headers = { Origin: origin }
  await page.goto('/transactions')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await page.getByLabel('Display name').fill('Offline Compose User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('offline-compose-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

  const accountResponse = await page.request.post('/api/v1/accounts', { headers, data: { name: 'Offline Checking', accountType: 'checking', openingBalanceMinor: 100_000, lastFour: '1010' } })
  expect(accountResponse.status()).toBe(201)
  const bootstrap = await page.request.get('/api/v1/bootstrap')
  const state = await bootstrap.json() as { financeState: { accounts: Array<{ id: string; name: string }>; categories: Array<{ id: string; allowsExpense: boolean }> } }
  const account = state.financeState.accounts.find((item) => item.name === 'Offline Checking')!
  const category = state.financeState.categories.find((item) => item.allowsExpense)!
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

  await page.route('**/api/v1/**', (route) => route.abort())
  await page.reload()
  await expect(page.locator('.offline-banner')).toBeVisible()
  await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
  await page.getByLabel('Amount').fill('6.80')
  await page.getByPlaceholder('e.g. Grab Grocery').fill('Offline lunch')
  await page.locator('.tx-modal').getByLabel('Category', { exact: false }).selectOption(category.id)
  await page.locator('.tx-modal').getByLabel('Account', { exact: false }).selectOption(account.id)
  await page.getByRole('button', { name: 'Save Expense' }).click()
  await expect(page.getByText('queued for sync')).toBeVisible()

  await page.unroute('**/api/v1/**')
  await page.goto('/sync')
  await page.getByRole('button', { name: 'Retry sync' }).click()
  await expect(page.getByText('0 waiting · 0 needing attention')).toBeVisible({ timeout: 10_000 })
  const transactions = await page.request.get('/api/v1/transactions')
  expect(transactions.status()).toBe(200)
  const body = await transactions.json() as { items: Array<{ title: string; amountMinor: string }> }
  expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Offline lunch', amountMinor: '680' })]))
})
