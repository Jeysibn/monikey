import { test, expect } from '@playwright/test'

test.describe('Budget page', () => {
  test('shows category statuses and separates budget-level wording from category wording', async ({ page }) => {
    await page.goto('/budget')
    await expect(page.getByText('Within total budget · 3 days left')).toBeVisible()
    await expect(page.getByText('Near Limit').first()).toBeVisible()
    await expect(page.getByText('Over Budget').first()).toBeVisible()
    await expect(page.getByText('Shopping, Debt Payments')).toBeVisible()
  })

  test('Food & Groceries shows a forecast line', async ({ page }) => {
    await page.goto('/budget')
    await expect(page.getByText(/Forecast \$1,680/)).toBeVisible()
  })
})

test.describe('Accounts page', () => {
  test('Add account label replaces the old Add wallet wording', async ({ page }) => {
    await page.goto('/accounts')
    await expect(page.getByText('E-Wallets & Cash', { exact: true })).toBeVisible()
    await expect(page.getByText('+ Add account').first()).toBeVisible()
    await expect(page.getByText('+ Add wallet')).toHaveCount(0)
    await expect(page.getByText('Cash Wallet').first()).toBeVisible()
  })
})

test.describe('Basic accessibility', () => {
  test('primary nav is a real <nav> with real links, and the search input is semantic', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible()
    await expect(page.locator('nav a[href="/accounts"]')).toBeVisible()
    await expect(page.locator('input[type="search"]')).toBeVisible()
  })

  test('Add Transaction dialog has an accessible name and icon-only buttons have labels', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add Transaction' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveAccessibleName('Add Transaction')
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()
  })
})
