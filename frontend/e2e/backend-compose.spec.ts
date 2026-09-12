import { expect, test } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:8080'

test.describe('Authenticated Compose backend flow @backend-compose', () => {
  // All browser contexts share the Compose proxy IP. Serial execution keeps
  // independent registration journeys within the production rate-limit budget.
  test.describe.configure({ mode: 'serial' })
  test('registers, posts an expense, signs back in, and revokes another session', async ({ page, browser }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const email = `playwright-compose-${unique}@monikey.test`
    const headers = { Origin: origin }

    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await page.getByLabel('Display name').fill('Compose E2E User')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('compose-e2e-password')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

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

    // The account was created through the public API to keep this flow focused
    // on the browser-auth gate; reload the SPA so its bootstrap snapshot includes it.
    await page.reload()
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
    const body = await transactions.json() as { items: Array<{ title: string; amountMinor: string }> }
    expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Compose API expense', amountMinor: '1234' })]))

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('compose-e2e-password')
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

    const secondContext = await browser.newContext({ baseURL: origin })
    try {
      const secondPage = await secondContext.newPage()
      await secondPage.goto('/security')
      await secondPage.getByRole('button', { name: 'Sign in' }).click()
      await secondPage.getByLabel('Email').fill(email)
      await secondPage.getByLabel('Password').fill('compose-e2e-password')
      await secondPage.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(secondPage.getByText('Active sessions')).toBeVisible()

      await page.goto('/security')
      await expect(page.getByText('Other session')).toBeVisible()
      await page.getByRole('button', { name: 'Revoke' }).click()
      await expect(page.getByText('Other session')).toHaveCount(0)
      expect((await secondPage.request.get('/api/v1/auth/me')).status()).toBe(401)
    } finally {
      await secondContext.close()
    }
  })

  test('reviews and commits a CSV import, then persists reconciliation @backend-compose', async ({ page }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const email = `playwright-import-${unique}@monikey.test`
    await page.goto('/imports')
    await page.getByRole('heading', { name: 'Create your account' }).waitFor()
    await page.getByLabel('Display name').fill('Import E2E User')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('import-e2e-password')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

    const accountResponse = await page.request.post('/api/v1/accounts', {
      headers: { Origin: origin },
      data: { name: 'Import E2E Checking', accountType: 'checking', openingBalanceMinor: '50000', lastFour: '5151' },
    })
    expect(accountResponse.status()).toBe(201)
    const account = await accountResponse.json() as { id: string }
    await page.reload()

    const csv = 'date,description,amount,merchant\n2026-09-10,Import E2E Grocery,12.34,Market'
    await page.getByLabel('CSV file').setInputFiles({ name: 'import.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: 'Upload and preview' }).click()
    await expect(page.getByText('2. Review staged rows', { exact: true })).toBeVisible()
    await page.getByLabel('Post to account').selectOption(account.id)
    await page.getByRole('button', { name: 'Commit eligible rows' }).click()
    await expect(page.getByText(/Committed 1 transaction/)).toBeVisible()

    await page.goto('/reconciliation')
    await page.locator('.reconciliation-form select').selectOption(account.id)
    await page.getByLabel('Statement balance').fill('487.66')
    await page.getByRole('button', { name: 'Compare balance' }).click()
    await expect(page.getByRole('status')).toContainText('Reconciled')
    await expect(page.getByRole('status')).toContainText('Difference: ₱0.00')
  })

  test('retries only the failed row of a partial import and preserves cumulative success @backend-compose', async ({ page }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    await page.goto('/imports')
    await page.getByRole('heading', { name: 'Create your account' }).waitFor()
    await page.getByLabel('Display name').fill('Partial Import User')
    await page.getByLabel('Email').fill(`playwright-partial-${unique}@monikey.test`)
    await page.getByLabel('Password').fill('partial-import-password')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()

    const headers = { Origin: origin }
    const lowResponse = await page.request.post('/api/v1/accounts', {
      headers,
      data: { name: 'Low Balance', accountType: 'checking', openingBalanceMinor: '1500' },
    })
    const retryResponse = await page.request.post('/api/v1/accounts', {
      headers,
      data: { name: 'Retry Account', accountType: 'checking', openingBalanceMinor: '5000' },
    })
    expect(lowResponse.status()).toBe(201)
    expect(retryResponse.status()).toBe(201)
    const low = await lowResponse.json() as { id: string }
    const retry = await retryResponse.json() as { id: string }

    const batchResponse = await page.request.post('/api/v1/imports/batches', {
      headers,
      data: { sourceType: 'csv_manual' },
    })
    expect(batchResponse.status()).toBe(201)
    const batch = await batchResponse.json() as { id: string }
    for (const suffix of ['first', 'second']) {
      const rowResponse = await page.request.post(`/api/v1/imports/batches/${batch.id}/transactions`, {
        headers,
        data: { dedupKey: `${unique}-${suffix}`, provider: 'csv', title: `Partial ${suffix}`, amountMinor: '1000', occurredOn: '2026-09-12' },
      })
      expect(rowResponse.status()).toBe(201)
    }

    const partialResponse = await page.request.post(`/api/v1/imports/batches/${batch.id}/commit`, {
      headers,
      data: { matchedAccountId: low.id },
    })
    expect(partialResponse.status()).toBe(200)
    const partial = await partialResponse.json() as { committedCount: number; errors: unknown[] }
    expect(partial.committedCount).toBe(1)
    expect(partial.errors).toHaveLength(1)

    const stagedResponse = await page.request.get(`/api/v1/imports/batches/${batch.id}/transactions`)
    const staged = await stagedResponse.json() as Array<{ status: string; processingError: string | null }>
    expect(staged.filter((row) => row.status === 'posted')).toHaveLength(1)
    expect(staged.filter((row) => row.processingError)).toHaveLength(1)

    const successfulRetry = await page.request.post(`/api/v1/imports/batches/${batch.id}/commit`, {
      headers,
      data: { matchedAccountId: retry.id },
    })
    expect(await successfulRetry.json()).toEqual({ committedCount: 2, errors: [] })

    const idempotentRetry = await page.request.post(`/api/v1/imports/batches/${batch.id}/commit`, {
      headers,
      data: { matchedAccountId: retry.id },
    })
    expect(await idempotentRetry.json()).toEqual({ committedCount: 2, errors: [] })
  })

})
