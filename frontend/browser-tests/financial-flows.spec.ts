import { expect, test, type Locator, type Page } from '@playwright/test'

import { hasRealApi, uniqueSuffix } from './fixtures'

/*
 * Money flows through the real screens and the real API, checked against hand-computed figures with
 * synthetic data: an expense, income, a card purchase, a card payment and a transfer, then deleting them.
 * Nothing may be counted twice: a card payment lowers debt and the paying account but is not an expense,
 * and a transfer is neither income nor an expense.
 */
type Account = { id: number; name: string; balance?: string; owed?: string; credit?: string }

async function accounts(page: Page): Promise<Record<string, Account>> {
  const rows = (await (await page.request.get('/api/accounts')).json()) as Account[]
  return Object.fromEntries(rows.map((a) => [a.name, a]))
}
async function summary(page: Page) {
  const month = new Date().toISOString().slice(0, 7)
  return (await (await page.request.get(`/api/summary?month=${month}`)).json()) as Record<string, string>
}
const num = (v: string | undefined) => Number(v ?? '0')

async function pick(dialog: Locator, id: string, name: string) {
  await dialog.locator(`#${id}`).click()
  await dialog.getByRole('option', { name: new RegExp(name) }).first().click()
}

/** The radios are visually hidden inside their labels, so a person taps the label. */
async function choose(dialog: Locator, name: string) {
  await dialog.getByRole('radio', { name, exact: true }).locator('xpath=ancestor::label[1]').click()
}

async function save(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: /^(Save|Pay credit card)/ }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('expense, income, card purchase, card payment and transfer never double count, and deleting restores every figure', async ({ page, request }) => {
  test.skip(!(await hasRealApi(request)), 'Writes through the real API.')
  test.setTimeout(120_000)
  const s = uniqueSuffix()
  const names = { cash: `FF Cash ${s}`, bank: `FF Bank ${s}`, card: `FF Card ${s}` }
  const make = async (data: Record<string, unknown>) => expect((await request.post('/api/accounts', { data })).status()).toBe(201)
  await make({ name: names.cash, type: 'cash', opening_balance: '1000.00' })
  await make({ name: names.bank, type: 'bank', opening_balance: '5000.00' })
  await make({ name: names.card, type: 'credit_card', opening_debt: '0.00', credit_limit: '20000.00' })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Add transaction' }).first()).toBeVisible()
  const before = await summary(page)

  const open = async () => {
    await page.getByRole('button', { name: 'Add transaction' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    return dialog
  }
  const fill = async (dialog: Locator, amount: string, note: string) => {
    await dialog.locator('#qa-amount').fill(amount)
    await dialog.locator('#qa-note').fill(note)
  }

  // 1. Expense 100 from cash.
  let dialog = await open()
  await fill(dialog, '100', `FF ${s} lunch`)
  await pick(dialog, 'qa-account', names.cash)
  await choose(dialog, 'Food')
  await save(page, dialog)

  // 2. Income 500 to the bank.
  dialog = await open()
  await choose(dialog, 'Income')
  await fill(dialog, '500', `FF ${s} pay`)
  await pick(dialog, 'qa-account', names.bank)
  await choose(dialog, 'Salary')
  await save(page, dialog)

  // 3. Card purchase 300 (an expense that raises debt).
  dialog = await open()
  await fill(dialog, '300', `FF ${s} card dinner`)
  await pick(dialog, 'qa-account', names.card)
  await choose(dialog, 'Food')
  await save(page, dialog)

  // 4. Pay 200 of the card from the bank (not an expense).
  dialog = await open()
  await choose(dialog, 'Pay card')
  await fill(dialog, '200', `FF ${s} card payment`)
  await pick(dialog, 'qa-account', names.bank)
  await pick(dialog, 'qa-card', names.card)
  await save(page, dialog)

  // 5. Transfer 150 from bank to cash (neither income nor expense).
  dialog = await open()
  await choose(dialog, 'Transfer')
  await fill(dialog, '150', `FF ${s} move`)
  await pick(dialog, 'qa-account', names.bank)
  await pick(dialog, 'qa-destination', names.cash)
  await save(page, dialog)

  let now = await accounts(page)
  expect(num(now[names.cash].balance)).toBe(1000 - 100 + 150)
  expect(num(now[names.bank].balance)).toBe(5000 + 500 - 200 - 150)
  expect(num(now[names.card].owed)).toBe(300 - 200)
  let totals = await summary(page)
  expect(num(totals.month_expenses) - num(before.month_expenses), 'expenses: the payment and the transfer add nothing').toBe(400)
  expect(num(totals.month_income) - num(before.month_income), 'income: the transfer adds nothing').toBe(500)
  expect(num(totals.net_position) - num(before.net_position), 'net position: +500 income −100 −300 expenses').toBe(100)

  // The new Activity search finds each entry; deleting them from the screen restores every figure.
  await page.getByRole('navigation', { name: 'Main' }).locator('button:visible').filter({ hasText: 'Activity' }).first().click()
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible()
  await page.getByRole('searchbox', { name: /search/i }).fill(`FF ${s}`).catch(async () => page.getByLabel(/Search activity/).fill(`FF ${s}`))
  await expect(page.getByText(/5 matching entries/)).toBeVisible()
  for (let remaining = 5; remaining > 0; remaining--) {
    await page.getByRole('button', { name: /^Delete/ }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: /^Delete/ }).last().click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    if (remaining > 1) await expect(page.getByText(new RegExp(`${remaining - 1} matching ${remaining - 1 === 1 ? 'entry' : 'entries'}`))).toBeVisible()
  }
  now = await accounts(page)
  expect(num(now[names.cash].balance)).toBe(1000)
  expect(num(now[names.bank].balance)).toBe(5000)
  expect(num(now[names.card].owed)).toBe(0)
  totals = await summary(page)
  expect(num(totals.month_expenses)).toBe(num(before.month_expenses))
  expect(num(totals.month_income)).toBe(num(before.month_income))
  expect(num(totals.net_position)).toBe(num(before.net_position))
})
