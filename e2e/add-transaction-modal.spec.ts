import { test, expect } from '@playwright/test'

test.describe('Add Transaction modal', () => {
  test('opens from the top bar, defaults to Expense, and closes on Cancel', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add Transaction' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Expense', selected: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Expense' })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('switching tabs changes the visible fields and the save button label', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()

    await page.getByRole('tab', { name: 'Income' }).click()
    await expect(page.getByLabel(/Source \/ Description/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Income' })).toBeVisible()

    await page.getByRole('tab', { name: 'Transfer' }).click()
    await expect(page.getByLabel(/From Account/)).toBeVisible()
    await expect(page.getByLabel(/To Account/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Transfer' })).toBeVisible()
  })

  test('transfer form blocks saving when From and To accounts match', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByRole('tab', { name: 'Transfer' }).click()

    await page.getByLabel(/From Account/).selectOption({ label: 'Checking ••4471' })
    await page.getByLabel(/To Account/).selectOption({ label: 'Checking ••4471' })

    await expect(page.getByRole('alert').filter({ hasText: "can't be the same" })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Transfer' })).toBeDisabled()

    await page.getByLabel(/To Account/).selectOption({ label: 'GCash' })
    await expect(page.getByRole('alert').filter({ hasText: "can't be the same" })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save Transfer' })).toBeEnabled()
  })

  test('closes on Escape', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add Transaction' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('rejects a zero or missing amount with an inline message', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByPlaceholder('e.g. Grab Grocery').fill('Test')
    await page.getByRole('button', { name: 'Save Expense' }).click()
    await expect(page.getByText('Enter an amount greater than zero.')).toBeVisible()
    // The dialog must still be open — an invalid submit never silently saves.
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('a valid expense can be entered and saved, and updates totals without reloading', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page.getByText('₱144.65')).toBeVisible() // starting Expenses this month

    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.locator('.tx-amount-input').fill('100')
    await page.getByPlaceholder('e.g. Grab Grocery').fill('Playwright Snack')
    await page.getByLabel('Category', { exact: false }).selectOption({ label: 'Food & Groceries' })
    await page.getByLabel('Account', { exact: false }).selectOption({ label: 'Checking ••4471' })
    await page.getByRole('button', { name: 'Save Expense' }).click()

    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText('Expense saved')).toBeVisible()
    await expect(page.getByRole('row', { name: /Playwright Snack/ })).toBeVisible()
    await expect(page.getByText('₱244.65')).toBeVisible() // 144.65 + 100
  })

  test('a valid income can be entered and saved, and net cash flow updates', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByRole('tab', { name: 'Income' }).click()
    await page.locator('.tx-amount-input').fill('500')
    await page.getByPlaceholder('e.g. Freelance Payment').fill('Playwright Bonus')
    await page.getByLabel('Category', { exact: false }).selectOption({ label: 'Salary' })
    await page.getByLabel('Deposit to', { exact: false }).selectOption({ label: 'Checking ••4471' })
    await page.getByRole('button', { name: 'Save Income' }).click()

    await expect(page.getByText('Income saved')).toBeVisible()
    await expect(page.getByText('₱2,855.35')).toBeVisible() // net cash flow: 2,355.35 + 500
  })

  test('a valid transfer can be entered and saved, and income/expense totals do not change', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByRole('tab', { name: 'Transfer' }).click()
    await page.locator('.tx-amount-input').fill('75')
    await page.getByLabel(/From Account/).selectOption({ label: 'Checking ••4471' })
    await page.getByLabel(/To Account/).selectOption({ label: 'Maya' })
    await page.getByRole('button', { name: 'Save Transfer' }).click()

    await expect(page.getByText('Transfer saved')).toBeVisible()
    // Income and expenses totals are unchanged by a transfer.
    await expect(page.getByText('₱2,500.00')).toBeVisible()
    await expect(page.getByText('₱144.65')).toBeVisible()
    await expect(page.getByText('2 transfer excluded from cash flow')).toBeVisible()
  })

  test('reopening the modal after a save starts from a clean Expense form', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByRole('tab', { name: 'Income' }).click()
    await page.locator('.tx-amount-input').fill('999')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await expect(page.getByRole('tab', { name: 'Expense', selected: true })).toBeVisible()
    await expect(page.locator('.tx-amount-input')).toHaveValue('')
  })
})

test.describe('Transactions page filtering', () => {
  test('search narrows the table and Clear Filters recovers from a no-results state', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page.getByRole('row', { name: /Cafe Amoreza/ })).toBeVisible()

    await page.getByPlaceholder('Search transactions...').fill('zzz-no-match')
    await expect(page.getByText('No matching transactions')).toBeVisible()

    await page.getByRole('button', { name: 'Clear Filters' }).click()
    await expect(page.getByRole('row', { name: /Cafe Amoreza/ })).toBeVisible()
  })

  test('filtering by Transfer type shows only the transfer row', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByLabel('Filter by type').selectOption('transfer')
    await expect(page.getByRole('row', { name: /Checking → GCash/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Cafe Amoreza/ })).toHaveCount(0)
  })
})
