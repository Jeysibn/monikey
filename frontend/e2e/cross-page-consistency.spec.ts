import { test, expect } from '@playwright/test'

// Regression tests for the exact bugs the QA brief called out: Dashboard and
// Transactions disagreeing about Net Cash Flow, and Dashboard and Budget
// disagreeing about Budget Used. Both pages read from the same finance
// provider state, so these should always agree — if one of these fails,
// someone reintroduced a second hardcoded copy of a shared number.

test.describe('Cross-page data consistency', () => {
  test('Net Cash Flow matches between Dashboard and Transactions', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('₱2,355.35')).toBeVisible()

    await page.getByRole('link', { name: 'Transactions', exact: true }).click()
    await expect(page.getByText('Net Cash Flow', { exact: false })).toBeVisible()
    await expect(page.getByText('₱2,355.35')).toBeVisible()
  })

  test('Budget Used percentage matches between Dashboard and Budget', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Budget used 82%')).toBeVisible()

    await page.getByRole('link', { name: 'Budget', exact: true }).click()
    await expect(page.getByText('82% of budget used')).toBeVisible()
  })

  test('Available Cash matches between Dashboard and Accounts, with no misleading account digits', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByText('₱8,040.00')).toBeVisible()
    await expect(page.getByText('Across 5 cash sources', { exact: false })).toBeVisible()
    await expect(page.getByText('•••• 4471').first()).toHaveCount(0)

    await page.getByRole('link', { name: 'Accounts', exact: true }).click()
    await expect(page.getByText('₱8,040.00').first()).toBeVisible()
  })

  test('Spend Mix total matches Budget page Spent So Far — both derive from the same budget-category records', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByText('₱9,498')).toBeVisible()

    await page.getByRole('link', { name: 'Budget', exact: true }).click()
    await expect(page.getByText('₱9,498')).toBeVisible()
  })

  test('Dashboard Goals preview shows only active goals, not completed ones', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Travel')).toBeVisible()
    await expect(page.getByText('New Laptop')).toBeVisible()
    await expect(page.getByText('Car Down Payment')).toBeVisible()
    // Home Fund and Emergency Fund are completed goals and must not appear
    // in the active-goals dashboard preview.
    await expect(page.getByText('Home Fund')).toHaveCount(0)
    await expect(page.getByText('Emergency Fund')).toHaveCount(0)
    await expect(page.getByText(/2 goals completed/)).toBeVisible()
  })

  // TR-004: the wording is "planned", not "auto-save" — no automation moves
  // this money, so the KPI, the goal cards, and Money Position all say so.
  test('Goals Planned Monthly Contribution matches the sum of the visible active monthly plans', async ({ page }) => {
    await page.goto('/goals')
    await expect(page.getByText('Planned Monthly Contribution')).toBeVisible()
    await expect(page.getByText('₱360.00')).toBeVisible()
    await expect(page.getByText('planned across 3 active goals')).toBeVisible()
    await expect(page.getByText('Monthly plan ₱100/mo')).toBeVisible()
    await expect(page.getByText('Monthly plan ₱60/mo')).toBeVisible()
    await expect(page.getByText('Monthly plan ₱200/mo')).toBeVisible()
    // No "auto-save" language survives anywhere on the page.
    await expect(page.getByText(/auto-save/i)).toHaveCount(0)
  })

  test('Average goal progress is computed from active goals only, not inflated by completed ones', async ({ page }) => {
    await page.goto('/goals')
    // Travel 53% + New Laptop 91% + Car Down Payment 0% (13/5000, rounds to
    // 0) averaged over 3 active goals = 48%, not diluted upward by the two
    // completed (100%+) goals.
    await expect(page.getByText('48%')).toBeVisible()
  })
})
