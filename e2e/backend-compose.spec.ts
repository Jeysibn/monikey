import { expect, test } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:8080'

test.describe('Authenticated Compose backend flow @backend-compose', () => {
  test('registers an isolated user, loads API-backed state, and posts an expense through the SPA', async ({ page }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const email = `playwright-compose-${unique}@monikey.test`
    const headers = { Origin: origin }

    // BrowserContext.request shares its cookie jar with the page. Registering
    // here proves the real session route/cookie path before the SPA asks for
    // bootstrap; no test-only database seeding is used.
    const register = await page.request.post('/api/v1/auth/register', {
      headers,
      data: { email, password: 'compose-e2e-password', displayName: 'Compose E2E User' },
    })
    expect(register.status()).toBe(201)

    const accountResponse = await page.request.post('/api/v1/accounts', {
      headers,
      data: {
        name: 'Compose E2E Checking',
        accountType: 'checking',
        openingBalanceMinor: 50_000,
        lastFour: '4242',
      },
    })
    expect(accountResponse.status()).toBe(201)
    const account = await accountResponse.json() as { id: string }

    const bootstrap = await page.request.get('/api/v1/bootstrap')
    expect(bootstrap.status()).toBe(200)
    const state = await bootstrap.json() as { user: { email: string }; financeState: { categories: Array<{ id: string; allowsExpense: boolean }> } }
    expect(state.user.email).toBe(email)
    const expenseCategory = state.financeState.categories.find((category) => category.allowsExpense)
    expect(expenseCategory).toBeTruthy()

    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await expect(page.getByLabel('Account', { exact: false }).getByRole('option', { name: 'Compose E2E Checking ••4242' })).toBeAttached()
    await page.getByLabel('Amount').fill('12.34')
    await page.getByPlaceholder('e.g. Grab Grocery').fill('Compose API expense')
    await page.getByLabel('Category', { exact: false }).selectOption(expenseCategory!.id)
    await page.getByLabel('Account', { exact: false }).selectOption(account.id)
    await page.getByRole('button', { name: 'Save Expense' }).click()

    await expect(page.getByText('Expense saved')).toBeVisible()
    await expect(page.getByRole('row', { name: /Compose API expense/ })).toBeVisible()

    const transactions = await page.request.get('/api/v1/transactions')
    expect(transactions.status()).toBe(200)
    const body = await transactions.json() as { items: Array<{ title: string; amountMinor: number }> }
    expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Compose API expense', amountMinor: 1234 })]))
  })
})
