import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/*
 * Category appearance and lifecycle against the real stack (ADR-026): icon and color persist through the API
 * and a reload, the list shows tabs with counts and usage, Archive and Delete use styled confirmations, a used
 * category cannot be deleted, and the persisted look appears in Quick Add and Activity. Synthetic data only.
 */
async function openCategories(page: Page) {
  await page.goto('/')
  const direct = page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Categories' })
  if (await direct.count()) await direct.last().click()
  else {
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Categories', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: 'Categories', level: 1 })).toBeFocused()
}

const PURPLE = 'rgb(238, 230, 251)' // #EEE6FB, the registry tint for "purple"

test('color and icon persist, show in Quick Add and Activity, and lifecycle uses styled confirmations', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const suffix = Date.now().toString(36)
  const name = `QA Look ${suffix}`
  const account = await page.request.post('/api/accounts', { data: { name: `QA Look Cash ${suffix}`, type: 'cash', opening_balance: '100.00' } })
  expect(account.status()).toBe(201)

  await openCategories(page)
  await page.getByRole('button', { name: 'Add category' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add category' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Pets icon' }).click()
  await dialog.getByRole('radio', { name: 'Purple' }).check({ force: true })
  await dialog.getByLabel('Default Kakeibo envelope').selectOption('wants')
  const preview = dialog.getByRole('group', { name: 'Appearance preview' })
  await expect(preview).toContainText(name)
  await expect(preview).toContainText('Expense · Wants')
  expect(await preview.locator('[data-category-badge]').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(PURPLE)
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(axe.violations.map(({ id, impact }) => ({ id, impact }))).toEqual([])
  await dialog.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByText('Category created.', { exact: true })).toBeVisible()

  // Persisted through the API, not just the screen.
  const stored = (await (await page.request.get('/api/categories')).json() as Record<string, any>[]).find((row) => row.name === name)
  expect(stored).toMatchObject({ icon_key: 'paw-print', color_key: 'purple', default_kakeibo_envelope: 'wants', usage_count: 0 })

  await page.reload()
  await openCategories(page)
  await page.getByLabel('Search categories').fill(name)
  const row = page.getByRole('list', { name: 'Categories' }).getByRole('listitem').first()
  await expect(row).toContainText('Default: Wants')
  await expect(row).toContainText('Not used yet')
  expect(await row.locator('[data-category-badge]').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(PURPLE)

  // Quick Add shows the persisted look, and using the category raises its usage count.
  await page.getByRole('button', { name: /Add transaction/ }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Amount').fill('2.50')
  await form.getByLabel('Account', { exact: true }).click()
  await form.getByRole('option').filter({ hasText: `QA Look Cash ${suffix}` }).click()
  const chip = form.getByRole('radio', { name, exact: true })
  expect(await chip.locator('xpath=..').locator('[data-category-badge]').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(PURPLE)
  await chip.focus()
  await page.keyboard.press('Space')
  await expect(form.locator('#qa-envelope-toggle')).toContainText('Wants') // the category's default is suggested
  const note = `Look QA ${suffix}`
  await form.getByLabel('Note (optional)').fill(note)
  await form.getByRole('button', { name: 'Save expense' }).click()
  await expect(form).toHaveCount(0)

  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  const activityRow = page.getByRole('button', { name: new RegExp(note) })
  expect(await activityRow.locator('[data-category-badge]').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(PURPLE)

  await openCategories(page)
  await page.getByLabel('Search categories').fill(name)
  await expect(page.getByRole('list', { name: 'Categories' }).getByRole('listitem').first()).toContainText('Used by 1 transaction')
  await page.getByRole('button', { name: `Edit ${name}` }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0) // used: archive instead
  await page.getByRole('radio', { name: 'Default' }).check({ force: true }) // clear the color
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Category updated.', { exact: true })).toBeVisible()
  const cleared = (await (await page.request.get('/api/categories')).json() as Record<string, any>[]).find((row) => row.name === name)
  expect(cleared?.color_key).toBeNull()
  expect(cleared?.icon_key).toBe('paw-print') // icon kept

  // Archive asks first, Cancel changes nothing, confirming moves it to the Archived tab with its history intact.
  await page.getByRole('button', { name: `Archive ${name}` }).click()
  const confirm = page.getByRole('dialog', { name: `Archive “${name}”?` })
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: `Archive ${name}` })).toBeFocused()
  await page.getByRole('button', { name: `Archive ${name}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive category' }).click()
  await expect(page.getByText(/Category archived/)).toBeVisible()
  await page.getByText(/^Archived \d+$/).click()
  await expect(page.getByRole('list', { name: 'Categories' }).getByRole('listitem').first()).toContainText('Used by 1 transaction')
})

test('an unused category is deleted only after a styled confirmation; tabs and counts follow the data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const name = `QA Unused ${Date.now().toString(36)}`
  const created = await page.request.post('/api/categories', { data: { name, type: 'income', color_key: 'teal', icon_key: 'banknote' } })
  expect(created.status()).toBe(201)
  await openCategories(page)

  const incomeTab = page.getByText(/^Income \d+$/)
  const before = Number((await incomeTab.textContent())?.match(/\d+/)?.[0]) // already includes the category created above
  await incomeTab.click()
  await expect(page.getByLabel('Filter Kakeibo envelope')).toHaveCount(0) // envelopes are for expenses only
  await page.getByLabel('Search categories').fill(name)
  await page.getByRole('button', { name: `Edit ${name}` }).click()
  const editor = page.getByRole('dialog')
  await expect(editor.getByLabel('Default Kakeibo envelope')).toHaveCount(0)
  await editor.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(editor.getByRole('heading', { name: `Delete “${name}”?` })).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await editor.getByRole('button', { name: 'Cancel' }).click() // back to the form with everything still there
  await expect(editor.getByLabel('Name', { exact: true })).toHaveValue(name)
  await editor.getByRole('button', { name: 'Delete', exact: true }).click()
  await editor.getByRole('button', { name: 'Delete category' }).click()
  await expect(page.getByText('Category deleted.', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(Number((await incomeTab.textContent())?.match(/\d+/)?.[0])).toBe(before - 1) // the tab count followed the delete
  const remaining = (await (await page.request.get('/api/categories')).json() as Record<string, any>[]).some((row) => row.name === name)
  expect(remaining).toBe(false)
})

test('sorting orders by use or name and phones show the tabs on one row', async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await openCategories(page)
    const tabs = page.locator('fieldset', { has: page.getByRole('radio', { name: /^Expenses/ }) }).locator('label')
    const tops = await tabs.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(new Set(tops).size, `tabs wrap onto several rows at ${width}px`).toBe(1)
  }
  await page.getByLabel('Sort categories').selectOption('name')
  const names = await page.getByRole('list', { name: 'Categories' }).locator('li p.font-semibold').allTextContents()
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  expect(names).toEqual(sorted)
})

test('creating a category keeps a search that still matches it and clears one that would hide it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const suffix = Date.now().toString(36)
  await openCategories(page)
  const search = page.getByLabel('Search categories')

  await search.fill(`QA Keep ${suffix}`)
  await page.getByRole('button', { name: 'Add category' }).click()
  await page.getByLabel('Name', { exact: true }).fill(`QA Keep ${suffix} One`)
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByText('Category created.', { exact: true })).toBeVisible()
  await expect(search).toHaveValue(`QA Keep ${suffix}`) // it still matches: left alone
  await expect(page.getByRole('button', { name: `Edit QA Keep ${suffix} One` })).toBeVisible()

  await search.fill('no category is named this')
  await page.getByRole('button', { name: 'Add category' }).click()
  await page.getByLabel('Name', { exact: true }).fill(`QA Other ${suffix}`)
  await page.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByText('Category created.', { exact: true })).toBeVisible()
  await expect(search).toHaveValue('') // it would have been hidden: the search is cleared so the new row shows
  await expect(page.getByRole('button', { name: `Edit QA Other ${suffix}` })).toBeVisible()
})
