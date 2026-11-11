import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/*
 * Add Transaction redesign: date directly after Amount with Today/Yesterday, a searchable account picker,
 * and a footer that stays on screen. Runs on a phone-sized viewport against the synthetic QA stack
 * (see browser-tests/README.md). It saves nothing.
 */
test.use({ viewport: { width: 390, height: 700 } })

test('Add transaction: date after amount, searchable account picker, footer stays visible', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Add transaction' })).toBeVisible()
  await expect(dialog.getByLabel('Amount')).toBeFocused()

  // Order on screen: Amount, then Date, then Account.
  const top = async (selector: string) => (await dialog.locator(selector).boundingBox())?.y ?? Number.NaN
  const [amountY, dateY, accountY] = [await top('#qa-amount'), await top('#qa-date'), await top('#qa-account')]
  expect(amountY).toBeLessThan(dateY)
  expect(dateY).toBeLessThan(accountY)
  expect(dateY, 'Date is reachable without scrolling on a phone').toBeLessThan(700)

  // Today / Yesterday set the same date value.
  const today = await dialog.locator('#qa-date').inputValue()
  await dialog.getByRole('button', { name: 'Yesterday', exact: true }).click()
  const yesterday = await dialog.locator('#qa-date').inputValue()
  expect(yesterday < today).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Yesterday', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(dialog.locator('#qa-date')).toHaveValue(today)

  // The account picker: opens, searches, shows a no-result state, closes on Escape without closing the dialog.
  await dialog.locator('#qa-account').click()
  const search = dialog.getByRole('combobox', { name: 'Search accounts' })
  await expect(search).toBeVisible()
  const all = await dialog.getByRole('option').count()
  expect(all).toBeGreaterThan(0)
  await search.fill('zzz-no-such-account')
  await expect(dialog.getByText(/No accounts match/)).toBeVisible()
  await search.fill('')
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(axe.violations.map(({ id, impact }) => ({ id, impact }))).toEqual([])
  await search.focus()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('listbox')).toHaveCount(0)
  await expect(dialog.locator('#qa-account')).toBeFocused()

  // Keyboard selection, then the choice shows its name and balance line.
  await page.keyboard.press('Enter') // reopen from the keyboard: the search box takes focus
  await expect(search).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('listbox')).toHaveCount(0)
  await expect(dialog.locator('#qa-account')).toContainText('·')

  // The Save/Cancel footer is always inside the viewport, and nothing scrolls sideways.
  const footer = await dialog.getByRole('button', { name: 'Save expense' }).boundingBox()
  expect((footer?.y ?? 0) + (footer?.height ?? 0)).toBeLessThanOrEqual(700)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})
