import { expect, test } from '@playwright/test'

/**
 * Common implementation contract. The same scenarios run against the
 * in-memory mock preview and the authenticated Compose API when
 * PLAYWRIGHT_TEST_BASE_URL is set. Setup differs because backend sessions and
 * accounts are real, but the user-visible behavior under test is identical.
 */
const backendMode = Boolean(process.env.PLAYWRIGHT_TEST_BASE_URL)
const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:8080'

test.describe('Finance implementation contract', () => {
  test.describe.configure({ mode: 'serial' })

  let accountLabels: string[] = []
  let expenseCategoryId: string | undefined

  test.beforeEach(async ({ page }) => {
    accountLabels = ['Checking ••4471', 'GCash']
    expenseCategoryId = undefined
    await page.goto('/transactions')

    if (!backendMode) return

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await page.getByLabel('Display name').fill('Contract User')
    await page.getByLabel('Email').fill(`finance-contract-${unique}@monikey.test`)
    await page.getByLabel('Password').fill('finance-contract-password')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

    const headers = { Origin: origin }
    accountLabels = []
    for (const account of [
      { name: 'Contract Checking', accountType: 'checking', openingBalanceMinor: '50000', lastFour: '4471' },
      { name: 'Contract GCash', accountType: 'ewallet', openingBalanceMinor: '50000' },
    ]) {
      const response = await page.request.post('/api/v1/accounts', { headers, data: account })
      expect(response.status()).toBe(201)
      const created = await response.json() as { name: string; lastFour?: string }
      accountLabels.push(created.lastFour ? `${created.name} ••${created.lastFour}` : created.name)
    }

    const bootstrap = await page.request.get('/api/v1/bootstrap')
    expect(bootstrap.status()).toBe(200)
    const state = await bootstrap.json() as { financeState: { categories: Array<{ id: string; allowsExpense: boolean }> } }
    expenseCategoryId = state.financeState.categories.find((category) => category.allowsExpense)?.id
    expect(expenseCategoryId).toBeTruthy()
    await page.reload()
  })

  test('account creation and expense posting produce a visible ledger entry @finance-contract', async ({ page }) => {
    const title = `Contract expense ${Date.now()}`
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.locator('.tx-amount-input').fill('12.34')
    await page.getByPlaceholder('e.g. Grab Grocery').fill(title)
    if (expenseCategoryId) await page.locator('.tx-modal').getByLabel('Category', { exact: false }).selectOption(expenseCategoryId)
    else await page.locator('.tx-modal').getByLabel('Category', { exact: false }).selectOption({ label: 'Food & Groceries' })
    await page.locator('.tx-modal').getByLabel('Account', { exact: false }).selectOption({ label: accountLabels.at(-2)! })
    await page.getByRole('button', { name: 'Save Expense' }).click()

    await expect(page.getByText('Expense saved')).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(title) })).toBeVisible()
  })

  test('invalid amount is rejected without closing the transaction form @finance-contract', async ({ page }) => {
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByPlaceholder('e.g. Grab Grocery').fill('Invalid contract expense')
    await page.getByRole('button', { name: 'Save Expense' }).click()

    await expect(page.getByText('Enter an amount greater than zero.')).toBeVisible()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('transfer is classified separately from income and expense @finance-contract', async ({ page }) => {
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByRole('button', { name: 'Transfer', exact: true }).click()
    await page.locator('.tx-amount-input').fill('7.50')
    await page.getByLabel(/From Account/).selectOption({ label: accountLabels.at(-2)! })
    await page.getByLabel(/To Account/).selectOption({ label: accountLabels.at(-1)! })
    await page.getByRole('button', { name: 'Save Transfer' }).click()

    await expect(page.getByText('Transfer saved')).toBeVisible()
    const transferRow = page.getByRole('row').filter({ hasText: 'Transfer' }).filter({ hasText: '₱7.50' })
    await expect(transferRow).toBeVisible()
    await expect(transferRow).toContainText('₱7.50')
  })
})
