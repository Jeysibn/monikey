import { test, expect } from '@playwright/test'

test.describe('Recurring browser journey', () => {
  test('adds an item, pauses and resumes it, then records a payment', async ({ page }) => {
    await page.goto('/recurring')

    const netflix = page.locator('.rec-row').filter({ hasText: 'Netflix' })
    await expect(netflix).toBeVisible()
    await netflix.getByRole('button', { name: 'Pause' }).click()
    await expect(netflix.getByRole('button', { name: 'Resume' })).toBeVisible()
    await netflix.getByRole('button', { name: 'Resume' }).click()
    await expect(netflix.getByRole('button', { name: 'Pause' })).toBeVisible()

    await page.getByRole('button', { name: 'New recurring item' }).click()
    const form = page.locator('form.new-category-form')
    await form.getByPlaceholder('e.g. Netflix').fill('Playwright Subscription')
    await form.getByLabel('Amount', { exact: true }).fill('25')
    await form.getByLabel('Next due date', { exact: true }).fill('2026-09-20')
    await form.getByRole('button', { name: 'Add recurring item' }).click()

    const created = page.locator('.rec-row').filter({ hasText: 'Playwright Subscription' })
    await expect(created).toBeVisible()
    await created.getByRole('button', { name: 'Mark as paid' }).click()
    await expect(created).toContainText('Last paid Aug 29')
  })
})

test.describe('Reports browser journey', () => {
  test('selects a custom period and exports the report CSV', async ({ page }) => {
    await page.goto('/reports')
    await page.getByRole('button', { name: 'Custom', exact: true }).click()
    const range = page.locator('.reports-custom-range')
    await range.getByLabel('From').fill('2026-08-01')
    await range.getByLabel('To').fill('2026-08-29')
    await expect(page.locator('.rp-period-caption')).toContainText('2026-08-01 to 2026-08-29')

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    await expect((await download).suggestedFilename()).toMatch(/^monikey-report-2026-08-29\.csv$/)
  })
})
