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
    await expect(page.getByText(/Forecast ₱1,680/)).toBeVisible()
  })

  test('"On track" category count is derived, and Budget vs Actual has a visible legend', async ({ page }) => {
    await page.goto('/budget')
    await expect(page.getByText('On track', { exact: false }).first()).toBeVisible()
    await expect(page.locator('.bva-legend')).toContainText('Budget')
    await expect(page.locator('.bva-legend')).toContainText('Actual (over budget)')
  })

  test('a category progress bar has an accessible name and over-budget value text', async ({ page }) => {
    await page.goto('/budget')
    const shoppingBar = page.getByRole('progressbar', { name: 'Shopping budget used' })
    await expect(shoppingBar).toBeVisible()
    await expect(shoppingBar).toHaveAttribute('aria-valuenow', '100') // clamped, not the raw 122
    const valueText = await shoppingBar.getAttribute('aria-valuetext')
    expect(valueText).toContain('over budget')
  })

  test('+ New category adds a row that participates in the same totals', async ({ page }) => {
    await page.goto('/budget')
    await page.getByRole('button', { name: '+ New category' }).click()
    await page.getByPlaceholder('e.g. Entertainment').fill('Entertainment')
    await page.getByRole('textbox', { name: 'Monthly budget' }).fill('500')
    await page.getByRole('button', { name: 'Add category' }).click()

    await expect(page.locator('.budget-row').getByText('Entertainment', { exact: true })).toBeVisible()
    await expect(page.getByText('₱12,100')).toBeVisible() // total budget: 11,600 + 500
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

  test('Connect account is a real disabled control, not a clickable-looking dead end', async ({ page }) => {
    await page.goto('/accounts')
    const connectButton = page.getByRole('button', { name: /Connect account/ })
    await expect(connectButton).toBeDisabled()
  })

  test('+ Add account creates a manual account that appears immediately', async ({ page }) => {
    await page.goto('/accounts')
    await page.getByRole('button', { name: '+ Add account' }).first().click()
    await page.getByPlaceholder('e.g. PayMaya').fill('Union Bank')
    await page.getByRole('textbox', { name: 'Starting balance' }).fill('1000')
    await page.getByRole('button', { name: 'Add account', exact: true }).click()
    await expect(page.locator('.account-row').getByText('Union Bank', { exact: true })).toBeVisible()
  })
})

test.describe('Goals page', () => {
  test('Continue saving, Increase target, and Archive are honestly disabled', async ({ page }) => {
    await page.goto('/goals')
    await expect(page.getByRole('button', { name: 'Continue saving' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Increase target' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Archive' }).first()).toBeDisabled()
  })

  test('completed goals show a reached date distinct from their target date', async ({ page }) => {
    await page.goto('/goals')
    await expect(page.getByText('Reached Jul 2026', { exact: false })).toBeVisible()
  })

  test('+ Add funds increases a goal\'s progress immediately', async ({ page }) => {
    await page.goto('/goals')
    await page.getByRole('button', { name: '+ Add funds' }).first().click()
    const amountInput = page.getByRole('textbox').last()
    await amountInput.fill('50')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('₱2,175')).toBeVisible() // 2,125 + 50
  })

  test('Create goal adds a new active goal card', async ({ page }) => {
    await page.goto('/goals')
    await page.getByRole('button', { name: 'Create goal' }).click()
    await page.getByPlaceholder('e.g. New Phone').fill('New Phone')
    await page.locator('input[inputmode="decimal"]').first().fill('300')
    await page.getByLabel('Target date').fill('2027-01-01')
    await page.getByRole('button', { name: 'Create goal' }).click()
    await expect(page.getByText('New Phone', { exact: true })).toBeVisible()
  })
})

test.describe('AI assistant honesty', () => {
  test('the AI card is labeled a preview, not a live "online" service', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('AI Assistant Preview')).toBeVisible()
    await expect(page.getByText('online', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /coming soon/ })).toBeDisabled()
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

  test('the notification panel uses a plain list, not non-interactive menuitem divs', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Notifications/ }).click()
    // Informational rows are a real <ul>/<li> list — no menu/menuitem roles
    // on elements that don't do anything when activated (FR-008).
    await expect(page.getByRole('menuitem')).toHaveCount(0)
    await expect(page.locator('ul.notif-list li').first()).toBeVisible()
  })

  test('every budget category progress bar has a valid, clamped aria-valuenow', async ({ page }) => {
    await page.goto('/budget')
    const bars = page.getByRole('progressbar')
    const count = await bars.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const valueNow = await bars.nth(i).getAttribute('aria-valuenow')
      const n = Number(valueNow)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(100)
    }
  })
})
