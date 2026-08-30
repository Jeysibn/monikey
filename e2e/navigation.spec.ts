import { test, expect } from '@playwright/test'

test.describe('Primary navigation', () => {
  test('all five main pages are reachable from the nav', async ({ page }) => {
    await page.goto('/')
    // Dashboard has no page <h1>; assert via a known widget instead.
    await expect(page.getByText('Available Cash', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Transactions', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
    await expect(page).toHaveURL(/\/transactions$/)

    await page.getByRole('link', { name: 'Accounts', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()

    await page.getByRole('link', { name: 'Budget', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Budget' })).toBeVisible()

    await page.getByRole('link', { name: 'Goals', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible()

    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(page).toHaveURL('/')
  })

  // The More menu is a disclosure (button + plain links), not an ARIA
  // `menu`/`menuitem` — it doesn't implement roving-focus keyboard
  // behavior, so claiming the menu role would be a false a11y promise
  // (FR-008).
  test('More menu opens and lists Investments, Recurring & Bills, Reports, Settings', async ({ page }) => {
    await page.goto('/')
    const moreButton = page.getByRole('button', { name: /More/ })
    await expect(moreButton).toHaveAttribute('aria-expanded', 'false')
    await moreButton.click()
    await expect(moreButton).toHaveAttribute('aria-expanded', 'true')

    await expect(page.getByRole('link', { name: /Investments/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Recurring & Bills/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Reports/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()

    await page.getByRole('link', { name: /Investments/ }).click()
    await expect(page).toHaveURL(/\/investments$/)
    await expect(page.getByText('Investments is coming soon')).toBeVisible()
  })

  test('More menu closes on outside click and Escape, and returns focus to the toggle', async ({ page }) => {
    await page.goto('/')
    const moreButton = page.getByRole('button', { name: /More/ })
    await moreButton.click()
    const settingsLink = page.getByRole('link', { name: 'Settings' })
    await expect(settingsLink).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(settingsLink).toBeHidden()
    await expect(moreButton).toBeFocused()

    await moreButton.click()
    await expect(settingsLink).toBeVisible()
    await page.mouse.click(10, 10)
    await expect(settingsLink).toBeHidden()
  })

  test('notification bell shows a badge count and lists attention items', async ({ page }) => {
    await page.goto('/')
    const bellButton = page.getByRole('button', { name: /Notifications, \d+ need attention/ })
    await expect(bellButton).toBeVisible()
    await bellButton.click()
    await expect(page.getByText('Attention Needed')).toBeVisible()
    await expect(page.getByText('Visa payment due in 3 days')).toBeVisible()
    await expect(page.locator('.notif-dropdown').getByRole('link', { name: /See all/ })).toBeVisible()
  })
})

test.describe('Mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the desktop nav row is replaced by a compact menu button', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav[aria-label="Primary"]')).toBeHidden()
    const toggle = page.getByRole('button', { name: 'Menu' })
    await expect(toggle).toBeVisible()

    await toggle.click()
    await expect(page.getByRole('link', { name: 'Transactions', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Budget', exact: true }).click()
    await expect(page).toHaveURL(/\/budget$/)
  })

  test('no page has unintended horizontal overflow at 390px', async ({ page }) => {
    for (const route of ['/', '/transactions', '/accounts', '/budget', '/goals']) {
      await page.goto(route)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${route} should not overflow horizontally`).toBe(0)
    }
  })
})
