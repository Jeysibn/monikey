import { expect, test } from '@playwright/test'

// Mock-mode (no backend) behavior of the V3 Activity and Accounts pages.
async function openV3(page: import('@playwright/test').Page, route: string) {
  await page.goto('/?v3=1')
  await expect(page).toHaveURL(/\/v3$/)
  await page.goto(route)
}

test.describe('V3 Activity (mock data)', () => {
  test('filters live in the URL and survive Back/Forward', async ({ page }) => {
    await openV3(page, '/v3/activity')
    await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: /Filters/ }).click()
    await page.getByLabel('Type', { exact: true }).selectOption('income')
    await expect(page).toHaveURL(/type=income/)
    await page.goBack()
    await expect(page).not.toHaveURL(/type=income/)
    await page.goForward()
    await expect(page).toHaveURL(/type=income/)
  })
  test('search with no match shows an empty state', async ({ page }) => {
    await openV3(page, '/v3/activity?q=zzzznomatch')
    await expect(page.getByText(/No transactions match/)).toBeVisible()
  })
  test('Overview recent row opens the matching Activity detail', async ({ page }) => {
    await openV3(page, '/v3')
    await page.getByRole('list', { name: 'Recent transactions' }).getByRole('link').first().click()
    await expect(page).toHaveURL(/\/v3\/activity\?tx=/)
    await expect(page.getByTestId('v3-activity-detail')).toBeVisible()
  })
})

test.describe('V3 Accounts (mock data)', () => {
  test('only one account is expanded, credit card shows debt, Activity link is filtered', async ({ page }) => {
    await openV3(page, '/v3/accounts')
    const grid = page.getByRole('list', { name: 'Accounts' })
    await grid.getByRole('button', { name: /^Checking,/ }).click()
    await grid.getByRole('button', { name: /^Visa Platinum/ }).click()
    await expect(page.getByTestId('v3-account-details')).toHaveCount(1)
    await expect(page.getByTestId('v3-card-owed')).toContainText('1,460.00')
    await page.getByRole('link', { name: 'View all activity' }).click()
    await expect(page).toHaveURL(/\/v3\/activity\?account=/)
    await page.goBack()
    await expect(page.getByTestId('v3-account-details')).toBeVisible()
  })
  test('edit and archive are unavailable without a backend', async ({ page }) => {
    await openV3(page, '/v3/accounts')
    await page.getByRole('list', { name: 'Accounts' }).getByRole('button', { name: /^Checking,/ }).click()
    await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0)
    await expect(page.getByText(/need a connected backend/)).toBeVisible()
  })
})
