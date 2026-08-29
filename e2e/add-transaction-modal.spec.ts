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

    await page.getByLabel(/From Account/).selectOption('Checking ••4471')
    await page.getByLabel(/To Account/).selectOption('Checking ••4471')

    await expect(page.getByRole('alert')).toContainText("can't be the same")
    await expect(page.getByRole('button', { name: 'Save Transfer' })).toBeDisabled()

    await page.getByLabel(/To Account/).selectOption('GCash')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save Transfer' })).toBeEnabled()
  })

  test('closes on Escape', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add Transaction' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
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
