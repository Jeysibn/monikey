import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function openCategories(page: import('@playwright/test').Page) {
  await page.goto('/')
  const direct = page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Categories' })
  if (await direct.count()) {
    await direct.last().click()
  } else {
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Categories', exact: true }).click()
  }
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

test('failed category reads expose a retry and recover', async ({ page }) => {
  await openCategories(page)
  const categoryName = `QA Retry ${Date.now().toString(36)}`
  let failedOnce = false
  await page.route('**/api/categories', async (route) => {
    if (!failedOnce && route.request().method() === 'GET') {
      failedOnce = true
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"synthetic QA failure"}' })
      return
    }
    await route.continue()
  })
  await page.getByLabel('Name', { exact: true }).fill(categoryName)
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByText('Category created.', { exact: true })).toBeVisible()
  await expect.poll(() => failedOnce).toBe(true)
  await expect(page.getByRole('button', { name: 'Retry loading categories' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry loading categories' }).click()
  await page.getByLabel('Search categories').fill(categoryName)
  await expect(page.getByRole('button', { name: `Edit ${categoryName}` })).toBeVisible()
})

test('income and expense categories validate, save, filter, search and paginate', async ({ page }) => {
  const suffix = Date.now().toString(36)
  const incomeName = `QA Income ${suffix}`
  const expenseName = `QA Expense ${suffix}`
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openCategories(page)

  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter a category name.')
  await page.getByRole('combobox', { name: 'Type', exact: true }).first().selectOption('income')
  await expect(page.getByLabel('Default Kakeibo envelope')).toHaveCount(0)
  await page.getByLabel('Name', { exact: true }).fill(incomeName)
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByText('Category created.', { exact: true })).toBeVisible()
  await page.getByLabel('Search categories').fill(incomeName)
  await expect(page.getByRole('button', { name: `Edit ${incomeName}` })).toBeVisible()

  await page.getByLabel('Name', { exact: true }).fill(incomeName)
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByRole('alert')).toContainText('already exists')

  await page.getByRole('combobox', { name: 'Type', exact: true }).first().selectOption('expense')
  await page.getByLabel('Name', { exact: true }).fill(expenseName)
  await page.getByLabel('Default Kakeibo envelope').selectOption('needs')
  await page.getByRole('button', { name: 'Create category' }).click()
  await page.getByLabel('Search categories').fill(expenseName)
  await expect(page.getByRole('button', { name: `Edit ${expenseName}` })).toBeVisible()

  await page.getByLabel('Filter category type').selectOption('expense')
  await page.getByLabel('Filter category status').selectOption('active')
  await page.getByLabel('Search categories').fill(expenseName)
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText('Default: Needs')).toBeVisible()
  await page.getByRole('button', { name: `Edit ${expenseName}` }).click()
  await page.getByLabel('Name', { exact: true }).fill(`${expenseName} Renamed`)
  await page.getByLabel('Default Kakeibo envelope').selectOption('culture')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByLabel('Search categories').fill(`${expenseName} Renamed`)
  await expect(page.getByRole('button', { name: `Edit ${expenseName} Renamed` })).toBeVisible()
  await expect(page.getByText('Default: Culture')).toBeVisible()

  const manyPrefix = `QA Page ${suffix}`
  for (let index = 0; index < 55; index += 1) {
    const response = await page.request.post('/api/categories', {
      data: { name: `${manyPrefix} ${String(index).padStart(2, '0')}`, type: 'expense', default_kakeibo_envelope: null },
    })
    expect(response.status()).toBe(201)
  }
  await page.reload()
  await openCategories(page)
  await page.getByLabel('Filter category type').selectOption('expense')
  await page.getByLabel('Filter category status').selectOption('active')
  await page.getByLabel('Search categories').fill(manyPrefix)
  await expect(page.getByRole('listitem')).toHaveCount(50)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(5)
  await expect(page.getByRole('button', { name: `Edit ${manyPrefix} 54` })).toBeVisible()
})

test('category icon picker supports search, keyboard selection, edit and persisted reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const account = await page.request.post('/api/accounts', {
    data: { name: `QA Icon Account ${Date.now().toString(36)}`, type: 'cash', opening_balance: '100.00' },
  })
  expect(account.status()).toBe(201)
  await openCategories(page)
  const name = `QA Icon ${Date.now().toString(36)}`
  await page.getByLabel('Name', { exact: true }).fill(name)

  const search = page.getByLabel('Search category icons')
  await search.focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Groceries icon' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Work icon' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Work icon' })).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'test-results/browser/category-icon-picker-390.png' })
  await search.fill('Books')
  await expect(page.getByRole('button', { name: 'Books icon' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Work icon' })).toHaveCount(0)
  await search.clear()
  await expect(page.getByRole('button', { name: 'Work icon' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByText('Category created.', { exact: true })).toBeVisible()

  await page.getByLabel('Search categories').fill(name)
  await expect(page.getByRole('button', { name: `Edit ${name}` })).toBeVisible()
  await page.reload()
  await openCategories(page)
  await page.getByLabel('Search categories').fill(name)
  await page.getByRole('button', { name: `Edit ${name}` }).click()
  await expect(page.getByRole('button', { name: 'Work icon' })).toHaveAttribute('aria-pressed', 'true')

  const addTransaction = page.getByRole('button', { name: /Add transaction/ })
  await addTransaction.click()
  const categoryRadio = page.getByRole('radio', { name, exact: true })
  await expect(categoryRadio.locator('xpath=..').locator('svg.lucide-briefcase-business')).toHaveCount(1)
  await page.getByLabel('Amount').fill('1.00')
  await page.getByLabel('Account').selectOption({ index: 1 })
  await categoryRadio.focus()
  await page.keyboard.press('Space')
  await expect(categoryRadio).toBeChecked()
  const note = `Icon QA ${Date.now().toString(36)}`
  await page.getByLabel('Note (optional)').fill(note)
  await page.screenshot({ path: 'test-results/browser/category-icon-quickadd-390.png' })
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  const activityRow = page.getByRole('button', { name: new RegExp(note) })
  await expect(activityRow.locator('svg.lucide-briefcase-business')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/browser/category-icon-activity-390.png' })

  await openCategories(page)
  await page.getByLabel('Search categories').fill(name)
  await page.getByRole('button', { name: `Edit ${name}` }).click()

  await page.getByRole('button', { name: 'Clear icon' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Category updated.', { exact: true })).toBeVisible()
  await page.reload()
  await openCategories(page)
  await page.getByLabel('Search categories').fill(name)
  await page.getByRole('button', { name: `Edit ${name}` }).click()
  await expect(page.getByText('No icon selected')).toBeVisible()
})
