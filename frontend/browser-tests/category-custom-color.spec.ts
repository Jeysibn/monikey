import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/*
 * Category colors: the curated swatches plus a custom color (ADR-026). Works on either source: it creates a
 * category, picks a custom color by hex, checks the preview and the saved badge, then edits it back to a
 * curated color and to Default. Synthetic data only.
 */
test('a category can use a custom color by hex, and switch back to a curated color or Default', async ({ page }) => {
  test.setTimeout(60_000)
  const name = `Custom hue ${Date.now().toString(36)}`
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const main = page.getByRole('navigation', { name: 'Main' })
  await main.getByRole('button', { name: 'More', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Categories', exact: true }).click()
  await page.getByRole('button', { name: 'Add category' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill(name)

  await expect(dialog.getByLabel('Hex code')).toHaveCount(0) // the custom controls appear only when Custom is chosen
  await dialog.getByRole('radio', { name: 'Custom color' }).locator('xpath=ancestor::label[1]').click()
  const hex = dialog.getByLabel('Hex code')
  await expect(hex).toBeVisible()
  await hex.fill('#8a2be')
  await expect(dialog.getByText('Use six digits, like #3A7BD5.')).toBeVisible() // incomplete input is explained, not saved
  await hex.fill('#8A2BE2')
  await expect(dialog.getByText('Use six digits, like #3A7BD5.')).toHaveCount(0)
  const preview = dialog.getByText('Preview Aa')
  await expect(preview).toBeVisible()
  expect(await preview.evaluate((el) => getComputedStyle(el).backgroundColor), 'a tint, not the raw color').not.toBe('rgb(138, 43, 226)')
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map((v) => v.id)).toEqual([])
  const box = await dialog.boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1)
  await dialog.getByRole('button', { name: 'Create category' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByLabel('Search categories').fill(name)
  await page.getByRole('button', { name: `Edit ${name}` }).click()
  const edit = page.getByRole('dialog')
  await expect(edit.getByRole('radio', { name: 'Custom color' })).toBeChecked() // the saved custom color comes back
  await expect(edit.getByLabel('Hex code')).toHaveValue('#8a2be2')
  await edit.getByRole('radio', { name: 'Teal' }).locator('xpath=ancestor::label[1]').click()
  await expect(edit.getByLabel('Hex code')).toHaveCount(0)
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: `Edit ${name}` }).click()
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Teal' })).toBeChecked()
  await page.getByRole('dialog').getByRole('radio', { name: 'Default' }).locator('xpath=ancestor::label[1]').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
