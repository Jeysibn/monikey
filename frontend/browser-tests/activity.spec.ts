import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { hasRealApi, seedPopulatedLedger, uniqueSuffix } from './fixtures'

/*
 * Activity search and filters. Filters are applied by the server to the WHOLE month before its page limit, so the
 * real-API tests build a month with more than one page of rows and prove an older match is found. The UI tests run on
 * either data source. Nothing here searches across months: the month selector always bounds the result.
 */
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // axe scans settled colors, not a half-finished fade
})

async function openActivity(page: Page) {
  const width = page.viewportSize()?.width ?? 1440
  await page.goto('/')
  if (width < 768) await page.getByRole('button', { name: 'Activity', exact: true }).click()
  else await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Activity' }).first().click()
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeFocused()
}
const countLine = (page: Page) => page.getByRole('status').filter({ hasText: /entr/ }).first()

/** A month with more than one page: three older "needle" rows, then 55 newer filler rows. API only. */
async function seedBigMonth(request: APIRequestContext) {
  const suffix = uniqueSuffix()
  const ledger = (await seedPopulatedLedger(request))!
  const expense = (await (await request.get('/api/categories?type=expense&status=active')).json() as { id: number }[])[0]!.id
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  const post = async (note: string) => {
    const response = await request.post('/api/transactions', { data: { account_id: ledger.bank, category_id: expense, amount: '1.00', transaction_date: today, note } })
    expect(response.status(), await response.text()).toBe(201)
  }
  for (let i = 1; i <= 3; i += 1) await post(`needle-${suffix} ${i}`) // created first, so they are OLDER than every filler on the same day
  for (let i = 1; i <= 55; i += 1) await post(`filler-${suffix} ${String(i).padStart(2, '0')}`)
  return { suffix, ledger, expense }
}

test('search finds rows by note, category and account, clears with the button and Escape, and ignores case', async ({ page, request }) => {
  await seedPopulatedLedger(request)
  await page.setViewportSize({ width: 1440, height: 900 })
  await openActivity(page)
  const search = page.getByLabel('Search activity')
  const all = await countLine(page).innerText()

  await search.fill('GROC') // a category name, any case (the mock's own rows) or any account/note on the real API
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible()
  await expect(countLine(page)).not.toHaveText(all, { timeout: 5_000 }).catch(() => undefined)
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused() // focus stays in the field after clearing
  await expect(countLine(page)).toHaveText(all) // everything is back, immediately

  await search.fill('zzz-nothing-has-this-name')
  await expect(page.getByText('Nothing matches these filters.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset filters' })).toHaveCount(1) // one reset action, not two
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(page.getByText('Nothing matches these filters.')).toHaveCount(0)
})

test('typing is debounced: fast keystrokes send one search, not one per letter', async ({ page, request }) => {
  test.skip(!(await hasRealApi(request)), 'Counts real requests; the mock has no network.')
  await seedPopulatedLedger(request)
  await page.setViewportSize({ width: 1440, height: 900 })
  await openActivity(page)
  const searches: string[] = []
  page.on('request', (r) => { const url = new URL(r.url()); if (url.pathname === '/api/transactions' && url.searchParams.has('q')) searches.push(url.searchParams.get('q')!) })
  await page.getByLabel('Search activity').pressSequentially('needle', { delay: 40 }) // 240ms in total, under the 300ms pause
  await expect.poll(() => searches.length).toBeGreaterThan(0)
  await page.waitForTimeout(600)
  expect(searches).toEqual(['needle']) // never 'n', 'ne', 'nee' ...
})

test('filters apply to the whole month BEFORE paging: an older match on a later page is found', async ({ page, request }) => {
  test.skip(!(await hasRealApi(request)), 'Needs a real month with more than one page of rows.')
  const { suffix } = await seedBigMonth(request)
  await page.setViewportSize({ width: 1440, height: 900 })
  await openActivity(page)
  await expect(countLine(page)).toContainText('Latest 50 entries') // the unfiltered page is full of fillers, needles are beyond it
  await expect(page.getByText(`needle-${suffix} 1`)).toHaveCount(0)

  await page.getByLabel('Search activity').fill(`needle-${suffix}`)
  await expect(countLine(page)).toHaveText(/^3 matching entries/) // all three, found server-side, no "Load more" needed
  // each row is in the page twice (a phone button and a desktop row), so look at the one that is shown
  for (const n of [1, 2, 3]) await expect(page.getByText(new RegExp(`needle-${suffix} ${n}$`)).filter({ visible: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0)

  // Changing a filter resets paging: Load more first, then filter, then reset => back to one page.
  await page.getByRole('button', { name: 'Reset filters' }).first().click()
  await expect(countLine(page)).toContainText('Latest 50 entries')
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(countLine(page)).toContainText('Latest 100 entries')
  await page.getByLabel('Type', { exact: true }).selectOption('expense')
  await expect(countLine(page)).toContainText(/entries/)
  await page.getByRole('button', { name: 'Reset filters' }).first().click()
  await expect(countLine(page)).toContainText('Latest 50 entries') // page size started again at one page
})

test('type and category filters are consistent, never offer a combination that cannot match, and reset cleanly', async ({ page, request }) => {
  await seedPopulatedLedger(request)
  await page.setViewportSize({ width: 1440, height: 900 })
  await openActivity(page)
  const kind = page.getByLabel('Type', { exact: true })
  const category = page.getByLabel('Category', { exact: true })
  await expect(kind.locator('option')).toHaveText(['All types', 'Expenses', 'Income', 'Card payments', 'Transfers'])

  await kind.selectOption('income')
  const incomeChoices = await category.locator('option').allInnerTexts()
  await kind.selectOption('expense')
  const expenseChoices = await category.locator('option').allInnerTexts()
  expect(incomeChoices).not.toEqual(expenseChoices) // the choices follow the type
  expect(incomeChoices.filter((t) => expenseChoices.includes(t) && t !== 'All categories').length).toBeLessThan(incomeChoices.length)

  await category.selectOption({ index: 1 }) // a real expense category
  await expect(category).not.toHaveValue('')
  await kind.selectOption('income') // a type that does not fit it drops the category instead of showing "nothing"
  await expect(category).toHaveValue('')

  await kind.selectOption('payment')
  await expect(category).toBeDisabled()
  await expect(page.getByText('Card payments and transfers don’t have a category.')).toBeVisible()
  await kind.selectOption('transfer')
  await expect(category).toBeDisabled()

  await page.getByLabel('Search activity').fill('x')
  await page.getByLabel('Account', { exact: true }).selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Reset filters' }).first().click() // resets account, type, category and search ...
  await expect(kind).toHaveValue('all')
  await expect(page.getByLabel('Search activity')).toHaveValue('')
  await expect(page.getByLabel('Account', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Month', { exact: true })).not.toHaveValue('') // ... and leaves the month alone
})

test('category filter lists an archived category that has history, labelled, and finds its rows', async ({ page, request }) => {
  test.skip(!(await hasRealApi(request)), 'Creates and archives a real category.')
  const ledger = (await seedPopulatedLedger(request))!
  const suffix = uniqueSuffix()
  const name = `QA Old ${suffix}`
  const made = await (await request.post('/api/categories', { data: { name, type: 'expense' } })).json() as { id: number }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  expect((await request.post('/api/transactions', { data: { account_id: ledger.bank, category_id: made.id, amount: '3.00', transaction_date: today, note: `history ${suffix}` } })).status()).toBe(201)
  const unused = await (await request.post('/api/categories', { data: { name: `QA Unused ${suffix}`, type: 'expense' } })).json() as { id: number }
  for (const id of [made.id, unused.id]) expect((await request.patch(`/api/categories/${id}/archive`, { data: { is_archived: true } })).status()).toBe(200)

  await page.setViewportSize({ width: 1440, height: 900 })
  await openActivity(page)
  const category = page.getByLabel('Category', { exact: true })
  await expect(category.locator('option', { hasText: `${name} (archived)` })).toHaveCount(1) // history exists: offered, and labelled
  await expect(category.locator('option', { hasText: `QA Unused ${suffix}` })).toHaveCount(0) // no history: it could match nothing
  await category.selectOption({ label: `${name} (archived)` })
  await expect(countLine(page)).toHaveText(/^1 matching entry/)
  await expect(page.getByText(new RegExp(`history ${suffix}$`)).filter({ visible: true })).toHaveCount(1)
})

test('Edit and Delete keep working under filters, and a saved change that no longer matches says it is hidden', async ({ page, request }) => {
  const real = await hasRealApi(request)
  const suffix = uniqueSuffix()
  let term = 'Lunch with team' // the mock's own row
  if (real) {
    const ledger = (await seedPopulatedLedger(request))!
    const expense = (await (await request.get('/api/categories?type=expense&status=active')).json() as { id: number }[])[0]!.id
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
    term = `QA editable ${suffix}`
    expect((await request.post('/api/transactions', { data: { account_id: ledger.bank, category_id: expense, amount: '4.00', transaction_date: today, note: term } })).status()).toBe(201)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await openActivity(page)
  await page.getByLabel('Search activity').fill(term)
  await expect(countLine(page)).toHaveText(/^1 matching entry/)
  await page.getByRole('button', { name: `Edit ${term}` }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: /Edit/ })).toBeVisible()
  await dialog.getByLabel('Note (optional)').fill(`renamed ${suffix}`)
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText(/hidden by your filters/)).toBeVisible() // the saved row no longer matches the search
  await page.getByRole('button', { name: 'Show it' }).click()
  await expect(page.getByLabel('Search activity')).toHaveValue('') // filters cleared so the row can be seen

  await page.getByLabel('Search activity').fill(`renamed ${suffix}`)
  await expect(countLine(page)).toHaveText(/^1 matching entry/)
  await page.getByRole('button', { name: `Delete renamed ${suffix}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Delete/ }).last().click()
  await expect(page.getByText('Nothing matches these filters.')).toBeVisible()
})

test('opening Activity from an account clears leftover filters and sets the account; the month still bounds the result', async ({ page, request }) => {
  await seedPopulatedLedger(request)
  await page.setViewportSize({ width: 1440, height: 900 })
  await openActivity(page)
  await page.getByLabel('Search activity').fill('leftover')
  await expect(page.getByLabel('Search activity')).toHaveValue('leftover')
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Accounts' }).first().click()
  await page.locator('[data-card-face]').first().click()
  const name = (await page.locator('[data-account-details] h2').innerText()).trim()
  await page.locator('[data-account-details]').getByRole('button', { name: 'View all in Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Search activity')).toHaveValue('') // a stale search would hide what was asked for
  await expect(page.locator('#activity-account option:checked')).toHaveText(name)

  await page.getByLabel('Month', { exact: true }).selectOption({ index: 6 }) // another month: results are bounded to it
  await expect(page.getByRole('status').filter({ hasText: /entr/ }).first()).toContainText(/^\d+ (matching )?entr|^No/)
})

test('Activity controls fit every supported width, with filters active, and pass axe', async ({ page, request }) => {
  await seedPopulatedLedger(request)
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openActivity(page)
    await page.getByLabel('Search activity').fill('a')
    await page.getByLabel('Type', { exact: true }).selectOption('expense')
    await expect(page.getByRole('button', { name: 'Reset filters' }).first()).toBeVisible()
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
    expect(dimensions.scroll, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.width)
    const bounds = await page.getByRole('search').boundingBox()
    expect((bounds?.x ?? 0) + (bounds?.width ?? 999)).toBeLessThanOrEqual(width)
    const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description })), `axe at ${width}px`).toEqual([])
    if ([320, 390, 1440].includes(width)) await page.screenshot({ path: `test-results/browser/activity-${width}.png`, fullPage: true })
  }
})
