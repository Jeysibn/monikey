import { test, expect } from '@playwright/test'

test.describe('Primary navigation', () => {
  test('all five main pages are reachable from the nav', async ({ page }) => {
    await page.goto('/')
    // Dashboard has no page <h1>; assert via a known widget instead.
    await expect(page.getByText('Available Cash')).toBeVisible()

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

  test('More menu opens and lists Investments, Recurring & Bills, Reports, Settings', async ({ page }) => {
    await page.goto('/')
    const moreButton = page.getByRole('button', { name: /More/ })
    await expect(moreButton).toHaveAttribute('aria-expanded', 'false')
    await moreButton.click()
    await expect(moreButton).toHaveAttribute('aria-expanded', 'true')

    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: /Investments/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Recurring & Bills/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Reports/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Settings' })).toBeVisible()

    await menu.getByRole('menuitem', { name: /Investments/ }).click()
    await expect(page).toHaveURL(/\/investments$/)
    await expect(page.getByText('Investments is coming soon')).toBeVisible()
  })

  test('More menu closes on outside click and Escape', async ({ page }) => {
    await page.goto('/')
    const moreButton = page.getByRole('button', { name: /More/ })
    await moreButton.click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()

    await moreButton.click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.mouse.click(10, 10)
    await expect(page.getByRole('menu')).toBeHidden()
  })
})
