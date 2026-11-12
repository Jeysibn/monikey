import { expect, type APIRequestContext } from '@playwright/test'

/*
 * Deterministic setup for specs that need a populated ledger. A spec must never depend on records another
 * spec happened to create first. These helpers talk to the real API when one is behind the app (the Compose
 * QA stack) and do nothing when the app is running on its built-in mock data (the Vite dev server), which
 * already has a populated ledger. All records are synthetic and uniquely named, so repeated runs against the
 * same database never collide.
 */

/** True when the real FastAPI is behind the app. On the mock server `/api/...` serves the SPA's HTML, not JSON. */
export async function hasRealApi(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get('/api/health/ready')
    if (!response.ok()) return false
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null && (body as { status?: unknown }).status === 'ok'
  } catch {
    return false
  }
}

export const uniqueSuffix = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * A populated Overview: a cash account, a bank account and a credit card (so the wallet deck has several cards
 * and the net position has something to explain), each with a recorded expense. Returns the created account
 * ids, or null when running on mock data.
 */
export async function seedPopulatedLedger(request: APIRequestContext): Promise<{ cash: number; bank: number; card: number } | null> {
  if (!(await hasRealApi(request))) return null
  const suffix = uniqueSuffix()
  const create = async (data: Record<string, unknown>) => {
    const response = await request.post('/api/accounts', { data })
    expect(response.status(), `account create: ${await response.text()}`).toBe(201)
    return (await response.json() as { id: number }).id
  }
  const cash = await create({ name: `QA Cash ${suffix}`, type: 'cash', opening_balance: '1500.00' })
  const bank = await create({ name: `QA Bank ${suffix}`, type: 'bank', opening_balance: '20000.00' })
  const card = await create({ name: `QA Card ${suffix}`, type: 'credit_card', opening_debt: '2500.00', credit_limit: '30000.00' })
  const categories = await (await request.get('/api/categories?type=expense&status=active')).json() as { id: number }[]
  expect(categories.length, 'the seeded database has expense categories').toBeGreaterThan(0)
  const spend = await request.post('/api/transactions', {
    data: { account_id: cash, category_id: categories[0]!.id, amount: '120.00', transaction_date: new Date().toISOString().slice(0, 10), note: `QA seeded ${suffix}` },
  })
  expect(spend.status(), await spend.text()).toBe(201)
  return { cash, bank, card }
}
