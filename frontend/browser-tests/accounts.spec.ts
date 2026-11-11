import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import { seedPopulatedLedger } from './fixtures'

/*
 * The redesigned Accounts page: search, type filter and sort, a saved Cards/List choice, and the account details
 * drawer (a right-hand panel on desktop, a bottom sheet on a phone) with its quick actions and recent activity.
 * Runs on either data source. Figures are read from the screen and compared with each other, never hard-coded.
 */
test.beforeEach(async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // axe scans settled colors, not a half-finished fade
  await seedPopulatedLedger(request)
})

async function openAccounts(page: Page) {
  const width = page.viewportSize()?.width ?? 1440
  await page.goto('/')
  if (width < 768) {
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Accounts', exact: true }).click()
  } else {
    await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Accounts' }).first().click()
  }
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeFocused()
  await expect(page.locator('[data-card-face]').first()).toBeVisible()
}

const faces = (page: Page) => page.locator('[data-card-face]')
const nameOf = async (face: Locator) => (await face.locator('span.truncate').first().innerText()).trim()
const names = async (page: Page) => Promise.all((await faces(page).all()).map(nameOf))
const isLiquid = async (face: Locator) => /balance/i.test(await face.innerText())
const toolbar = (page: Page) => page.getByRole('region', { name: 'Find and arrange accounts' })

test('search, type filter and sort change what shows, in order, and can be reset', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openAccounts(page)
  const all = await names(page)
  expect(all.length).toBeGreaterThanOrEqual(3)
  await expect(toolbar(page).getByRole('status')).toHaveText(new RegExp(`^${all.length} accounts?`))

  // Search by name: case and spaces do not matter; a miss explains itself and offers a way back.
  const target = all[0]!
  await page.getByLabel('Search accounts').fill(`  ${target.toUpperCase()}  `)
  expect(await names(page)).toContain(target)
  await expect(toolbar(page).getByRole('status')).toContainText(`of ${all.length} account`)
  await page.getByLabel('Search accounts').fill('no account has this name')
  await expect(page.getByText('No accounts match your search or filter.')).toBeVisible()
  await page.getByRole('button', { name: 'Show all accounts' }).click()
  await expect(page.getByLabel('Search accounts')).toHaveValue('')
  expect(await names(page)).toEqual(all)

  // Type filter: money accounts show a Balance; cards show available credit instead.
  await page.getByLabel('Filter accounts by type').selectOption('credit')
  for (const face of await faces(page).all()) expect(await isLiquid(face)).toBe(false)
  await page.getByLabel('Filter accounts by type').selectOption('cash-bank')
  for (const face of await faces(page).all()) expect(await isLiquid(face)).toBe(true)
  await page.getByLabel('Filter accounts by type').selectOption('all')

  // Sort A to Z.
  await page.getByLabel('Sort accounts').selectOption('name')
  const sorted = [...all].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  expect(await names(page)).toEqual(sorted)

  // Sorting by balance ranks only accounts that hold money; credit cards follow them (a debt is never a balance).
  await page.getByLabel('Sort accounts').selectOption('balance-high')
  const flags = await Promise.all((await faces(page).all()).map(isLiquid))
  expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a))) // every money account before every card
  await expect(toolbar(page).getByRole('status')).toContainText('Credit cards follow, A–Z')
  await page.getByLabel('Sort accounts').selectOption('owed-high')
  const owedFlags = await Promise.all((await faces(page).all()).map(isLiquid))
  expect(owedFlags).toEqual([...owedFlags].sort((a, b) => Number(a) - Number(b))) // every card before every money account
})

test('the Cards/List choice, type and sort are remembered; the search is not', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openAccounts(page)
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.getByLabel('Filter accounts by type').selectOption('credit')
  await page.getByLabel('Sort accounts').selectOption('owed-high')
  await page.getByLabel('Search accounts').fill('card')
  await expect(page.getByRole('region', { name: 'Money you owe' })).toBeVisible()

  await page.reload()
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Accounts' }).first().click()
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Filter accounts by type')).toHaveValue('credit')
  await expect(page.getByLabel('Sort accounts')).toHaveValue('owed-high')
  await expect(page.getByLabel('Search accounts')).toHaveValue('') // transient
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('monikey.accountsView') ?? 'null'))
  expect(stored).toEqual({ version: 1, mode: 'list', type: 'credit', sort: 'owed-high' }) // presentation only: no figures

  // A corrupt saved value falls back to the defaults instead of breaking the page.
  await page.evaluate(() => localStorage.setItem('monikey.accountsView', '{"version":1,"mode":"<script>","type":7}'))
  await page.reload()
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Accounts' }).first().click()
  await expect(page.getByRole('button', { name: 'Cards', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Filter accounts by type')).toHaveValue('all')
})

test('account details open as a right-hand drawer on desktop and a bottom sheet on a phone', async ({ page }) => {
  for (const [width, height] of [[1440, 900], [1024, 800], [768, 900], [390, 844], [320, 700]] as const) {
    await page.setViewportSize({ width, height })
    await openAccounts(page)
    await faces(page).first().click()
    const drawer = page.locator('[data-account-details]')
    await expect(drawer).toBeVisible()
    const box = (await drawer.boundingBox())!
    if (width >= 768) {
      expect(Math.round(box.x + box.width), `drawer reaches the right edge at ${width}px`).toBe(width)
      expect(Math.round(box.height), `drawer is full height at ${width}px`).toBe(height)
      expect(box.width).toBeLessThanOrEqual(440)
    } else {
      expect(box.x).toBe(0)
      expect(Math.round(box.width)).toBe(width)
      expect(box.y).toBeGreaterThan(0) // a sheet below the top edge, not full-screen
      expect(box.y + box.height).toBeLessThanOrEqual(height)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow at ${width}px`).toBeLessThanOrEqual(0)
    await expect(drawer.getByRole('button', { name: 'Done' })).toBeVisible() // the footer is always reachable
    await expect(drawer.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
  }
})

test('a money account shows its balance and actions; a card shows debt, limit, utilization and available credit as not cash', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openAccounts(page)
  const all = await faces(page).all()
  let liquid: Locator | undefined
  let card: Locator | undefined
  for (const face of all) {
    if (await isLiquid(face)) liquid ??= face
    else card ??= face
  }
  expect(liquid && card).toBeTruthy()

  const liquidName = await nameOf(liquid!)
  await liquid!.click()
  const drawer = page.locator('[data-account-details]')
  await expect(drawer.getByRole('heading', { name: liquidName })).toBeVisible()
  await expect(drawer).toContainText('Current balance')
  for (const action of ['Add expense', 'Add income', 'Transfer']) await expect(drawer.getByRole('button', { name: action, exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Pay card' })).toHaveCount(0) // a money account is not paid
  await expect(drawer.getByRole('heading', { name: 'Recent activity' })).toBeVisible()
  await drawer.getByRole('button', { name: 'Done' }).click()

  const cardName = await nameOf(card!)
  await card!.click()
  await expect(drawer.getByRole('heading', { name: cardName })).toBeVisible()
  await expect(drawer).toContainText(/Amount owed|Card credit|Nothing owed/)
  await expect(drawer).toContainText('Credit limit')
  await expect(drawer).toContainText('Limit in use')
  await expect(drawer).toContainText('Available credit (not cash)')
  await expect(drawer).toContainText('never part of your cash or net position')
  await expect(drawer.getByRole('button', { name: 'Add expense', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Pay card', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Add income' })).toHaveCount(0) // nothing is deposited to or moved from a card
  await expect(drawer.getByRole('button', { name: 'Transfer', exact: true })).toHaveCount(0)
  await expect(drawer.getByRole('img', { name: /Credit limit progress/ })).toBeVisible()
  const axe = await new AxeBuilder({ page }).include('[data-account-details]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(axe.violations.map(({ id, impact, nodes }) => ({ id, impact, where: nodes.map((n) => n.target.join(' ')).slice(0, 2) }))).toEqual([])
})

test('quick actions open the existing flows on this account, and View all opens Activity filtered to it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openAccounts(page)
  const all = await faces(page).all()
  let liquid: Locator | undefined
  let card: Locator | undefined
  for (const face of all) {
    if (await isLiquid(face)) liquid ??= face
    else card ??= face
  }
  const liquidName = await nameOf(liquid!)
  const cardName = await nameOf(card!)
  const drawer = page.locator('[data-account-details]')
  const quickAdd = page.getByRole('dialog')

  await liquid!.click()
  await drawer.getByRole('button', { name: 'Add expense', exact: true }).click()
  await expect(quickAdd.getByRole('heading', { name: 'Add transaction' })).toBeVisible()
  await expect(quickAdd.locator('#qa-account')).toContainText(liquidName)
  await expect(quickAdd.getByRole('radio', { name: 'Expense', exact: true })).toBeChecked()
  await quickAdd.getByRole('button', { name: 'Cancel' }).click()

  await liquid!.click()
  await drawer.getByRole('button', { name: 'Add income', exact: true }).click()
  await expect(quickAdd.getByRole('radio', { name: 'Income', exact: true })).toBeChecked()
  await expect(quickAdd.locator('#qa-account')).toContainText(liquidName)
  await quickAdd.getByRole('button', { name: 'Cancel' }).click()

  await liquid!.click()
  await drawer.getByRole('button', { name: 'Transfer', exact: true }).click()
  await expect(quickAdd.getByRole('radio', { name: 'Transfer', exact: true })).toBeChecked()
  await expect(quickAdd.locator('#qa-account')).toContainText(liquidName) // money moves from this account
  await quickAdd.getByRole('button', { name: 'Cancel' }).click()

  await card!.click()
  await drawer.getByRole('button', { name: 'Add expense', exact: true }).click()
  await expect(quickAdd.locator('#qa-account')).toContainText(cardName)
  await expect(quickAdd.getByText(/adds to the card's debt/)).toBeVisible()
  await quickAdd.getByRole('button', { name: 'Cancel' }).click()

  const pay = card!
  await pay.click()
  const payButton = drawer.getByRole('button', { name: 'Pay card', exact: true })
  if (await payButton.isEnabled()) {
    await payButton.click()
    await expect(quickAdd.getByRole('radio', { name: 'Pay card', exact: true })).toBeChecked()
    await expect(quickAdd.locator('#qa-card')).toContainText(cardName)
    await quickAdd.getByRole('button', { name: 'Cancel' }).click()
  } else {
    await expect(drawer.getByText(/Pay card is off/)).toBeVisible() // nothing owed: disabled, and it says why
    await drawer.getByRole('button', { name: 'Done' }).click()
  }

  await liquid!.click()
  await drawer.getByRole('button', { name: 'Edit account', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: /Edit/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await liquid!.click()
  await drawer.getByRole('button', { name: 'View all in Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible()
  await expect(page.locator('#activity-account option:checked')).toHaveText(liquidName)
})

test('the list view opens the same details panel and returns focus to its button', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openAccounts(page)
  await page.getByRole('button', { name: 'List', exact: true }).click()
  const details = page.getByRole('button', { name: /^Details, / }).first()
  await details.click()
  const drawer = page.locator('[data-account-details]')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Recent activity' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(details).toBeFocused()
  await expect(page.getByText(/Available credit isn.t cash/).first()).toBeVisible()
})

test('Accounts fits every supported width with no horizontal scroll and no axe violations, cards and list', async ({ page }) => {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openAccounts(page)
    for (const mode of ['Cards', 'List']) {
      await page.getByRole('button', { name: mode, exact: true }).click()
      const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
      expect(dimensions.scroll, `${mode}: horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.width)
      const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description })), `${mode}: axe at ${width}px`).toEqual([])
    }
    await page.getByRole('button', { name: 'Cards', exact: true }).click()
    if ([320, 390, 1440].includes(width)) await page.screenshot({ path: `test-results/browser/accounts-${width}.png`, fullPage: true })
  }
})
