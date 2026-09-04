import { test, expect } from '@playwright/test'

// SR-012: permanent E2E coverage for invariants previously verified only
// manually/ad-hoc during earlier SR reviews.

test.describe('Period boundaries (SR-001) — past/future dated transactions', () => {
  test('a past-dated expense and a future-dated expense do not change this month\'s totals', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page.getByText('₱144.65')).toBeVisible() // starting Expenses this month

    // Past-dated (outside the active Aug 2026 period).
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.locator('.tx-amount-input').fill('40')
    await page.getByPlaceholder('e.g. Grab Grocery').fill('Old Purchase')
    await page.getByLabel('Category', { exact: false }).selectOption({ label: 'Food & Groceries' })
    await page.getByLabel('Account', { exact: false }).selectOption({ label: 'Checking ••4471' })
    await page.locator('input[type="date"]').fill('2026-06-01')
    await page.getByRole('button', { name: 'Save Expense' }).click()
    await expect(page.getByText('Expense saved')).toBeVisible()
    await expect(page.getByText('₱144.65')).toBeVisible() // unchanged

    // Future-dated (outside the active Aug 2026 period).
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.locator('.tx-amount-input').fill('60')
    await page.getByPlaceholder('e.g. Grab Grocery').fill('Future Purchase')
    await page.getByLabel('Category', { exact: false }).selectOption({ label: 'Food & Groceries' })
    await page.getByLabel('Account', { exact: false }).selectOption({ label: 'Checking ••4471' })
    await page.locator('input[type="date"]').fill('2026-10-01')
    await page.getByRole('button', { name: 'Save Expense' }).click()
    await expect(page.getByText('Expense saved')).toBeVisible()
    await expect(page.getByText('₱144.65')).toBeVisible() // still unchanged

    // Both rows are nonetheless recorded on the ledger.
    await expect(page.getByRole('row', { name: /Old Purchase/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Future Purchase/ })).toBeVisible()
  })

  test('an expense dated today changes the Dashboard daily expenses trend', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.locator('.tx-amount-input').fill('33')
    await page.getByPlaceholder('e.g. Grab Grocery').fill('Today Snack')
    await page.getByLabel('Category', { exact: false }).selectOption({ label: 'Food & Groceries' })
    await page.getByLabel('Account', { exact: false }).selectOption({ label: 'Checking ••4471' })
    await page.locator('input[type="date"]').fill('2026-08-29') // DEMO_TODAY_ISO
    await page.getByRole('button', { name: 'Save Expense' }).click()
    await expect(page.getByText('Expense saved')).toBeVisible()

    // Verify the new expense landed in the ledger for today's date, and the
    // Dashboard's daily trend/expenses-today figure reflects it.
    await expect(page.getByRole('row', { name: /Today Snack/ })).toBeVisible()
    // Client-side navigation (not page.goto, which would reload and lose
    // in-memory state) to the Dashboard.
    await page.getByRole('link', { name: 'Dashboard' }).click()
    // Seed data's three today-dated expenses (₱6.40 + ₱41.85 + ₱8.20 =
    // ₱56.45) plus the new ₱33 expense = ₱89.45, rounded in the KPI.
    await expect(page.getByText('₱89 today')).toBeVisible()
  })
})

test.describe('Budget allocation (SR-002)', () => {
  test('adding a budget category decreases the unallocated amount by exactly its allocation', async ({ page }) => {
    await page.goto('/budget')
    await expect(page.getByText('₱2,000')).toBeVisible()

    await page.getByRole('button', { name: '+ New category' }).click()
    await page.getByPlaceholder('e.g. Entertainment').fill('Streaming')
    await page.getByRole('textbox', { name: 'Monthly budget' }).fill('250')
    await page.getByRole('button', { name: 'Add category' }).click()

    await expect(page.locator('.budget-row').getByText('Streaming', { exact: true })).toBeVisible()
    await expect(page.getByText('₱1,750')).toBeVisible() // 2,000 - 250
    await expect(page.getByText('₱11,600')).toBeVisible() // total envelope unchanged
  })
})

test.describe('Goal funding to completion (SR-003)', () => {
  test('funding a goal to its exact target amount marks it completed', async ({ page }) => {
    await page.goto('/goals')
    const laptopCard = page.locator('.goal-card').filter({ hasText: 'New Laptop' })
    await expect(laptopCard.getByText('₱1,179')).toBeVisible()

    await laptopCard.getByRole('button', { name: '+ Add funds' }).click()
    // Remaining to target: 1,300 - 1,179 = 121.
    await laptopCard.getByRole('textbox').last().fill('121')
    await laptopCard.getByRole('button', { name: 'Add', exact: true }).click()

    // No longer listed among active goal cards...
    await expect(page.locator('.goal-grid .goal-card').filter({ hasText: 'New Laptop' })).toHaveCount(0)
    // ...but now appears in the completed section with a reached date.
    await expect(page.getByText('Completed Goals', { exact: true })).toBeVisible()
    await expect(page.getByText('New Laptop')).toBeVisible()
    await expect(page.getByText('Reached Aug 2026', { exact: false })).toBeVisible()
  })
})

test.describe('Account form section modes (SR-006)', () => {
  test('the Banks "+ Add account" entry point defaults to Bank types only', async ({ page }) => {
    await page.goto('/accounts')
    await page.getByRole('button', { name: '+ Add account' }).first().click()
    const typeSelect = page.locator('.new-category-form select').first()
    await expect(typeSelect).toHaveValue('checking')
    const optionLabels = await typeSelect.locator('option').allTextContents()
    expect(optionLabels).toEqual(['Bank — Checking', 'Bank — Savings'])
  })

  test('the E-Wallets & Cash "+ Add account" entry point defaults to Wallet types only', async ({ page }) => {
    await page.goto('/accounts')
    const walletButtons = page.getByRole('button', { name: '+ Add account' })
    await walletButtons.nth(1).click()
    const typeSelect = page.locator('.new-category-form select').first()
    await expect(typeSelect).toHaveValue('ewallet')
    const optionLabels = await typeSelect.locator('option').allTextContents()
    expect(optionLabels).toEqual(['E-Wallet', 'Cash'])
  })
})

test.describe('Money Position placement and label (SR-008)', () => {
  test('the money position section renders above the dashboard grid with the "Estimated safe to spend" label', async ({ page }) => {
    await page.goto('/')
    const moneyPosition = page.locator('.money-position')
    const grid = page.locator('.dash-grid')
    await expect(moneyPosition).toBeVisible()
    await expect(grid).toBeVisible()
    await expect(page.getByText('Estimated safe to spend')).toBeVisible()

    const moneyPositionBox = await moneyPosition.boundingBox()
    const gridBox = await grid.boundingBox()
    expect(moneyPositionBox).not.toBeNull()
    expect(gridBox).not.toBeNull()
    expect(moneyPositionBox!.y).toBeLessThan(gridBox!.y)
  })
})

test.describe('Transfer fee reconciliation and recurring source label (SR-010)', () => {
  test('a transfer saved with a fee shows a reconciliation line on the Transactions page', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByRole('button', { name: 'Transfer', exact: true }).click()
    await page.locator('.tx-amount-input').fill('100')
    await page.getByLabel(/From Account/).selectOption({ label: 'Checking ••4471' })
    await page.getByLabel(/To Account/).selectOption({ label: 'Maya' })
    await page.getByLabel(/Transfer Fee/).fill('5')
    await page.getByRole('button', { name: 'Save Transfer' }).click()
    await expect(page.getByText('Transfer saved')).toBeVisible()

    const row = page.getByRole('row', { name: /Checking.*→.*Maya/ })
    await expect(row).toBeVisible()
    await expect(row.getByText(/₱105/)).toBeVisible()
  })

  test('a recurring transaction is labeled "Recurring", not "Manual"', async ({ page }) => {
    await page.goto('/transactions')
    const netflixRow = page.getByRole('row', { name: /Netflix/ })
    await expect(netflixRow).toBeVisible()
    await expect(netflixRow.getByText('Recurring')).toBeVisible()
  })

  test('search matches by category name and by account name, not just title', async ({ page }) => {
    await page.goto('/transactions')

    await page.getByPlaceholder('Search transactions...').fill('Utilities')
    await expect(page.getByRole('row', { name: /Meralco Bill/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Cafe Amoreza/ })).toHaveCount(0)

    await page.getByPlaceholder('Search transactions...').fill('Mastercard')
    await expect(page.getByRole('row', { name: /Grab Ride/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Meralco Bill/ })).toHaveCount(0)
  })
})

test.describe('Mobile full-screen Add Transaction modal', () => {
  test.use({ viewport: { width: 390, height: 700 } })

  test('the modal fills the viewport, scrolls, and stays keyboard-reachable', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    // Full-screen on mobile: fills (approximately) the viewport height.
    expect(box!.height).toBeGreaterThan(650)

    // The body inside the dialog is a scroll container, not clipped content.
    const overflowY = await dialog.evaluate((el) => getComputedStyle(el).overflowY)
    expect(['auto', 'scroll']).toContain(overflowY)

    // Keyboard reachability: Tab from the amount field reaches later controls
    // and Escape still closes the dialog.
    await page.locator('.tx-amount-input').focus()
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})

test.describe('Recent Transactions geometry at mobile width (SR-011 regression)', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  test('the category tag and account column do not overlap at 320px', async ({ page }) => {
    await page.goto('/')
    const firstRow = page.locator('.area-recent .tx-table tbody tr').first()
    await expect(firstRow).toBeVisible()

    const categoryCell = firstRow.locator('td').nth(1)
    const accountCell = firstRow.locator('td').nth(2)
    const categoryBox = await categoryCell.boundingBox()
    const accountBox = await accountCell.boundingBox()
    expect(categoryBox).not.toBeNull()
    expect(accountBox).not.toBeNull()

    // No horizontal overlap: the category cell ends at or before the account
    // cell begins (allowing for normal cell padding/gap).
    expect(categoryBox!.x + categoryBox!.width).toBeLessThanOrEqual(accountBox!.x + 1)

    // No page-level horizontal overflow either.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(320)
  })
})
