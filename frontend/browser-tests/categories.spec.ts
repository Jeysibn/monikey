import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function openCategories(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Categories' }).click()
  await expect(page.getByRole('heading', { name: 'Categories', level: 1 })).toBeFocused()
}

test('category management fits supported viewports and has no axe violations', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openCategories(page)
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
    expect(dimensions.scroll, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.width)
    const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description })), `axe violations at ${width}px`).toEqual([])
    if (width === 320) await page.screenshot({ path: 'test-results/browser/categories-320.png', fullPage: true })
    if (width === 1440) await page.screenshot({ path: 'test-results/browser/categories-1440.png', fullPage: true })
  }
})

test('income and expense categories validate, save, filter, search and paginate', async ({ page }) => {
  const suffix = Date.now().toString(36)
  const incomeName = `QA Income ${suffix}`
  const expenseName = `QA Expense ${suffix}`
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openCategories(page)

  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter a category name.')
  await page.getByLabel('Type', { exact: true }).selectOption('income')
  await expect(page.getByLabel('Default Kakeibo envelope')).toHaveCount(0)
  await page.getByLabel('Name', { exact: true }).fill(incomeName)
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByRole('status')).toContainText('Category created.')
  await expect(page.getByText(incomeName, { exact: true })).toBeVisible()

  await page.getByLabel('Name', { exact: true }).fill(incomeName)
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByRole('alert')).toContainText('already exists')

  await page.getByLabel('Type', { exact: true }).selectOption('expense')
  await page.getByLabel('Name', { exact: true }).fill(expenseName)
  await page.getByLabel('Default Kakeibo envelope').selectOption('needs')
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByText(expenseName, { exact: true })).toBeVisible()

  await page.getByLabel('Filter category type').selectOption('expense')
  await page.getByLabel('Filter category status').selectOption('active')
  await page.getByLabel('Search categories').fill(expenseName)
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText('Default: Needs')).toBeVisible()
  await page.getByRole('button', { name: `Edit ${expenseName}` }).click()
  await page.getByLabel('Name', { exact: true }).fill(`${expenseName} Renamed`)
  await page.getByLabel('Default Kakeibo envelope').selectOption('culture')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: `Edit ${expenseName} Renamed` })).toBeVisible()
  await expect(page.getByText('Default: Culture')).toBeVisible()

  const manyPrefix = `QA Page ${suffix}`
  for (let index = 0; index < 55; index += 1) {
    const response = await page.request.post('/api/categories', {
      data: { name: `${manyPrefix} ${String(index).padStart(2, '0')}`, type: 'expense', default_kakeibo_envelope: null },
    })
    expect(response.status()).toBe(201)
  }
  await page.getByLabel('Search categories').fill(manyPrefix)
  await expect(page.getByRole('listitem')).toHaveCount(50)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(5)
  await expect(page.getByText(`${manyPrefix} 54`, { exact: true })).toBeVisible()
})
