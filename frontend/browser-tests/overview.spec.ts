import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { hasRealApi, seedPopulatedLedger } from './fixtures'

/*
 * The Overview polish: the net-position hero stays first, quick actions sit right under it, the welcome panel sits
 * below the hero in a slot of the same height (so it never moves anything), two balanced columns on desktop, and
 * every block still loads, fails and recovers on its own. Runs on either data source unless a test says otherwise.
 */
test.beforeEach(async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seedPopulatedLedger(request)
})

const top = async (locator: ReturnType<Page['locator']>) => Math.round((await locator.boundingBox())!.y)
const hero = (page: Page) => page.locator('section[aria-labelledby="net-position-label"]')

test('reading order: hero, then quick actions, then the welcome panel, then the cards', async ({ page }) => {
  for (const [width, height] of [[390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByText('Welcome back!')).toBeVisible()
    const heroTop = await top(hero(page))
    const actionsTop = await top(page.getByRole('region', { name: 'Quick actions' }))
    const welcomeTop = await top(page.getByText('Welcome back!'))
    const firstCardTop = await top(page.getByRole('region', { name: /Recent activity|This month/ }).first())
    expect(heroTop, `hero is the first block at ${width}px`).toBeLessThan(actionsTop)
    expect(actionsTop).toBeLessThan(welcomeTop)
    expect(welcomeTop).toBeLessThan(firstCardTop)
    const heroBox = (await hero(page).boundingBox())!
    expect(heroBox.y, 'nothing sits above the hero except the page header').toBeLessThan(width >= 1024 ? 140 : 240)
  }
})

test('quick actions open the existing flow with the right type', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const actions = page.getByRole('region', { name: 'Quick actions' })
  const dialog = page.getByRole('dialog')
  for (const [button, type] of [['Add expense', 'Expense'], ['Add income', 'Income'], ['Transfer', 'Transfer'], ['Pay card', 'Pay card']] as const) {
    await actions.getByRole('button', { name: button, exact: true }).click()
    await expect(dialog.getByRole('radio', { name: type, exact: true })).toBeChecked()
    if (type === 'Pay card') await expect(dialog.locator('#qa-card')).not.toContainText('Choose a card') // opens on a card that owes
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(actions.getByRole('button', { name: button, exact: true })).toBeFocused() // focus returns to where it was
  }
})

test('Pay card opens on the card that owes the most, and moves to the next one once that is paid', async ({ page, request }) => {
  test.skip(await hasRealApi(request), 'Uses the mock source\'s known cards and its paid-off scenario.')
  await page.setViewportSize({ width: 1440, height: 900 })
  const dialog = page.getByRole('dialog')
  await page.goto('/')
  await page.getByRole('region', { name: 'Quick actions' }).getByRole('button', { name: 'Pay card' }).click()
  await expect(dialog.locator('#qa-card')).toContainText('Blue Card') // owes ₱14,250.00, more than Everyday Card's ₱6,800.00
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await page.goto('/?demo=paid-off') // Blue Card is paid in full here, so it owes nothing
  await page.getByRole('region', { name: 'Quick actions' }).getByRole('button', { name: 'Pay card' }).click()
  await expect(dialog.locator('#qa-card')).toContainText('Everyday Card')
})

test('the reserved welcome slot is exactly as tall as the panel, so showing or hiding it moves nothing', async ({ page }) => {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const panel = page.locator('[data-welcome-slot] > *').first()
    await expect(panel).toBeVisible()
    const [slot, inner] = await Promise.all([page.locator('[data-welcome-slot]').boundingBox(), panel.boundingBox()])
    expect(Math.abs(slot!.height - inner!.height), `slot vs panel height at ${width}px`).toBeLessThanOrEqual(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow at ${width}px`).toBeLessThanOrEqual(0)
  }
})

test('the blocks below do not move while the data refreshes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const recent = page.getByRole('region', { name: 'Recent activity' })
  const before = await top(recent)
  const heroBefore = await top(hero(page))
  // Change the month and back: a refresh hides the welcome panel for a moment; the slot keeps the page still.
  const samples: number[] = []
  const sample = async () => { samples.push(await top(recent)) }
  const select = page.getByLabel('Month', { exact: true })
  const options = await select.locator('option').evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value))
  await select.selectOption(options[1]!)
  await sample()
  await select.selectOption(options[0]!)
  await sample()
  await page.waitForTimeout(800)
  await sample()
  expect(await top(hero(page))).toBe(heroBefore)
  for (const y of samples) expect(Math.abs(y - before), 'Recent activity stayed put').toBeLessThanOrEqual(3)
})

test('desktop columns: wallets and recent activity share a row, this month sits under wallets, credit cards under recent', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const wallets = page.locator('main').getByRole('heading', { name: 'Wallets' })
  const recent = page.getByRole('heading', { name: 'Recent activity' })
  const month = page.getByRole('heading', { name: 'This month' })
  const credit = page.getByRole('heading', { name: 'Credit cards' })
  expect(Math.abs((await top(wallets)) - (await top(recent)))).toBeLessThanOrEqual(6) // the same row
  expect(await top(month)).toBeGreaterThan(await top(wallets))
  expect(await top(credit)).toBeGreaterThan(await top(recent))
  const monthBox = (await month.boundingBox())!
  const walletBox = (await wallets.boundingBox())!
  expect(Math.abs(monthBox.x - walletBox.x)).toBeLessThanOrEqual(4) // same left column
})

test('Overview links lead to Dashboard, Activity, Accounts and the account details', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'View analytics' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Overview' }).first().click()
  await page.getByRole('button', { name: 'View all', exact: true }).click() // recent activity
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible()
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Overview' }).first().click()
  await page.getByRole('button', { name: /^View all \d+ accounts$/ }).click()
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible()
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Overview' }).first().click()
  await page.getByRole('button', { name: /^Open /, }).click() // "Open <selected account>"
  await expect(page.locator('[data-account-details]')).toBeVisible()
  await expect(page.locator('[data-account-details]').getByRole('heading', { name: 'Recent activity' })).toBeVisible()
})

test('a block that fails shows its own retry and the rest of Overview stays', async ({ page, request }) => {
  test.skip(await hasRealApi(request), 'Uses the mock source\'s failing-read scenario.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?demo=load-error&failing=activity')
  await expect(page.getByRole('alert').filter({ hasText: /recent activity/ })).toBeVisible()
  await expect(hero(page)).toBeVisible() // the position is unaffected
  await expect(page.getByRole('region', { name: 'Quick actions' }).getByRole('button', { name: 'Add expense' })).toBeEnabled()
})

test('Overview has no automated WCAG A/AA violations and no horizontal scroll at any supported width', async ({ page }) => {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByText('Welcome back!')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow at ${width}px`).toBeLessThanOrEqual(0)
    const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description })), `axe at ${width}px`).toEqual([])
    if ([320, 390, 1440].includes(width)) await page.screenshot({ path: `test-results/browser/overview-${width}.png`, fullPage: true })
  }
})
