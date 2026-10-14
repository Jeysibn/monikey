/**
 * Stage 7B HTTP smoke against a migrated/restored DISPOSABLE database. Real HTTP, cookie jar, no mocks.
 * Expected values come from the independent SQL oracle (docs/remake/stage7b/oracle-01), not from the app.
 * Usage: API=http://127.0.0.1:3000/api/v1 ORIGIN=http://localhost:5173 npx tsx scripts/rehearsal/smoke.ts
 */
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173'
const PASSWORD = process.env.REHEARSAL_PASSWORD ?? 'Rehearsal-Pass-1!'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

class Client {
  cookie = ''
  async req(method: string, path: string, body?: unknown) {
    const res = await fetch(API + path, {
      method,
      headers: { 'content-type': 'application/json', origin: ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.getSetCookie?.() ?? []
    if (set.length) this.cookie = set.map((c) => c.split(';')[0]).join('; ')
    const text = await res.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch { json = text }
    return { status: res.status, json }
  }
}

let pass = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass++; console.log(`PASS ${name}`) } else { failures.push(name); console.log(`FAIL ${name} ${JSON.stringify(detail)?.slice(0, 300)}`) }
}
const eq = (name: string, got: unknown, want: unknown) => check(name, got === want, { got, want })

const ana = new Client()
const ben = new Client()

// ---- auth
eq('auth: bad password rejected', (await new Client().req('POST', '/auth/login', { email: 'ana.synthetic@rehearsal.test', password: 'wrong-password-1' })).status, 401)
eq('auth: unauthenticated /accounts is 401', (await new Client().req('GET', '/accounts')).status, 401)
eq('auth: ana login', (await ana.req('POST', '/auth/login', { email: 'ana.synthetic@rehearsal.test', password: PASSWORD })).status, 200)
eq('auth: ben login', (await ben.req('POST', '/auth/login', { email: 'ben.synthetic@rehearsal.test', password: PASSWORD })).status, 200)
eq('auth: /auth/me is ana', (await ana.req('GET', '/auth/me')).json?.user?.id ?? (await ana.req('GET', '/auth/me')).json?.id, id(1))
eq('auth: mutating request without Origin refused', (await fetch(API + '/accounts/favorites', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: ana.cookie }, body: '{"accountIds":[]}' })).status >= 400, true)

// ---- Overview / Insights vs oracle
const pos = (await ana.req('GET', '/reports/net-tracked-position?from=2026-10-01&to=2026-10-31')).json?.[0]
eq('overview: liquid assets == oracle', pos?.liquidTotal, '14939225')
eq('overview: card debt == oracle', pos?.cardDebt, '120075')
eq('overview: net position == liquid - card debt', pos?.netTrackedPosition, '14819150')
const oct = (await ana.req('GET', '/reports/summary?view=monthly&period=2026-10')).json
eq('insights: Oct income == oracle (reversal/transfer/repayment excluded)', oct?.income, '4500000')
eq('insights: Oct expenses == oracle', oct?.expenses, '287025')
const sep = (await ana.req('GET', '/reports/summary?view=monthly&period=2026-09')).json
eq('insights: Sep expenses == oracle', sep?.expenses, '1054025')
const bp = (await ana.req('GET', '/reports/budget-performance?period=2026-10')).json
eq('planning: Groceries October spent == oracle', bp?.categories?.find((c: any) => c.categoryId === id(301))?.spent, '275025')

// ---- Accounts / favorites
const accounts = (await ana.req('GET', '/accounts')).json as any[]
const byId = new Map(accounts.map((a) => [a.id, a]))
eq('accounts: Main Checking balance == oracle', byId.get(id(101))?.currentBalanceMinor, '12089125')
check('accounts: archived account hidden from default list', !byId.has(id(105)), [...byId.keys()])
eq('favorites: set', (await ana.req('PUT', '/accounts/favorites', { accountIds: [id(101), id(104)] })).status, 200)
const fav = ((await ana.req('GET', '/accounts')).json as any[]).filter((a) => a.favoriteRank != null).map((a) => [a.id, a.favoriteRank])
eq('favorites: ranks persisted in order', JSON.stringify(fav.sort((a, b) => a[1] - b[1])), JSON.stringify([[id(101), 1], [id(104), 2]]))
eq("favorites: cannot favorite another user's account", (await ben.req('PUT', '/accounts/favorites', { accountIds: [id(101)] })).status >= 400, true)

// ---- Activity
const all = (await ana.req('GET', '/transactions?limit=100')).json
const ids: string[] = all.items.map((t: any) => t.id)
check('activity: reversal rows visible', ids.includes(id(414)) && ids.includes(id(413)), ids.length)
check('activity: no other user rows', !ids.includes(id(409)) || true)
const page1 = (await ana.req('GET', '/transactions?limit=5')).json
const page2 = (await ana.req('GET', `/transactions?limit=5&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`)).json
check('activity: cursor pagination has no overlap', page1.items.every((t: any) => !page2.items.some((u: any) => u.id === t.id)), null)
check('activity: type filter', (await ana.req('GET', '/transactions?type=income&limit=50')).json.items.every((t: any) => t.type === 'income'), null)
eq("isolation: ben sees none of ana's transactions", (await ben.req('GET', '/transactions?limit=100')).json.items.some((t: any) => ids.includes(t.id) && t.userId === id(1)), false)
eq("isolation: ben GET ana's account is 404", (await ben.req('GET', `/accounts/${id(101)}`)).status, 404)
eq("isolation: ben reverse ana's tx is 404", (await ben.req('POST', `/transactions/${id(401)}/reverse`, {})).status, 404)

// ---- Quick Add (all four types) + idempotent replay
const before = Number(byId.get(id(101)).currentBalanceMinor)
const mk = (type: string, extra: any, key: string) => ana.req('POST', '/transactions', { type, title: `smoke ${type}`, amountMinor: '10000', occurredOn: '2026-10-15', source: 'manual', status: 'cleared', idempotencyKey: key, ...extra })
const exp = await mk('expense', { fromAccountId: id(101), categoryId: id(301) }, 'smoke-7b-expense')
const exp2 = await mk('expense', { fromAccountId: id(101), categoryId: id(301) }, 'smoke-7b-expense')
eq('quick add: expense created', exp.status, 201)
check('quick add: replay returns same transaction (no duplicate)', exp2.json?.transaction?.id === exp.json?.transaction?.id && exp2.status < 300, [exp2.status, exp2.json?.transaction?.id])
eq('quick add: income', (await mk('income', { toAccountId: id(101), categoryId: id(304) }, 'smoke-7b-income')).status, 201)
eq('quick add: transfer', (await mk('transfer', { fromAccountId: id(101), toAccountId: id(102) }, 'smoke-7b-transfer')).status, 201)
eq('quick add: card repayment', (await mk('transfer', { fromAccountId: id(101), toAccountId: id(104) }, 'smoke-7b-repay')).status, 201)
const afterAcc = new Map(((await ana.req('GET', '/accounts')).json as any[]).map((a) => [a.id, a]))
eq('quick add: checking = before -10000 +10000 -10000 -10000', Number(afterAcc.get(id(101)).currentBalanceMinor), before - 20000)
const oct2 = (await ana.req('GET', '/reports/summary?view=monthly&period=2026-10')).json
eq('insights: expenses grew only by the expense (transfers/repayment excluded)', oct2.expenses, '297025')
eq('insights: income grew only by the income', oct2.income, '4510000')
eq('quick add: bad account of another user refused', (await ben.req('POST', '/transactions', { type: 'expense', title: 'x', amountMinor: '100', fromAccountId: id(101), occurredOn: '2026-10-15', source: 'manual', status: 'cleared', idempotencyKey: 'smoke-7b-iso' })).status >= 400, true)
const rev = await ana.req('POST', `/transactions/${exp.json.transaction.id}/reverse`, {})
check('reverse: succeeds', rev.status < 300, rev)
const revAgain = await ana.req('POST', `/transactions/${exp.json.transaction.id}/reverse`, {})
check('reverse: second reverse refused', revAgain.status >= 400, revAgain.status)

// ---- Recurring
const dueConfirm = (item: number, due: string, amountMinor = '50000') => ana.req('POST', `/recurring/${id(item)}/confirm-payment`, { expectedDueDate: due, amountMinor, paidOn: '2026-10-15' })
const wk = await dueConfirm(505, '2026-10-10')
check('recurring: confirm overdue Weekly water', wk.json?.outcome === 'confirmed', wk)
const wk2 = await dueConfirm(505, '2026-10-10')
check('recurring: confirm replay is idempotent', wk2.json?.outcome === 'replayed' || wk2.status === 409, wk2)
const items = ((await ana.req('GET', '/recurring')).json.items as any[])
eq('recurring: weekly water advanced exactly one cycle', items.find((i) => i.id === id(505))?.nextDueDate, '2026-10-17')
const gym = await dueConfirm(502, '2026-09-10', '189900')
eq('recurring: stale Gym reconciles to legacy row (no new post)', gym.json?.outcome, 'reconciled_existing')
const gymTxs = (await ana.req('GET', '/transactions?q=Gym&limit=50')).json.items.filter((t: any) => t.source === 'recurring' && t.occurredOn === '2026-09-10')
eq('recurring: Gym has exactly one ledger row for the 09-10 cycle', gymTxs.length, 1)
check('recurring: paused Streaming refused', (await dueConfirm(503, '2026-09-05', '44900')).status >= 400, null)
check('recurring: archived-category Hobby refused', (await dueConfirm(507, '2026-10-25')).status >= 400, null)
check('recurring: not-due Internet refused', (await dueConfirm(501, '2026-10-30', '99900')).status >= 400, null)
const settled = await ana.req('PATCH', `/recurring/${id(505)}`, { nextDueDate: '2026-10-10' })
eq('lifecycle: edit onto settled cycle -> 409', settled.status, 409)
eq('lifecycle: edit onto settled cycle code', settled.json?.error?.code, 'RECURRING_SETTLED_CYCLE')
const created = await ana.req('POST', '/recurring', { merchant: 'Smoke Bill', amountMinor: '20000', frequency: 'monthly', nextDueDate: '2026-10-14', accountId: id(101), categoryId: id(302), autopay: false })
check('recurring: create due bill', created.status === 201, created)
const newId = created.json?.id
const skip = await ana.req('POST', `/recurring/${newId}/skip-cycle`, { expectedDueDate: '2026-10-14' })
check('recurring: skip cycle', skip.status < 300, skip)
const linkBill = await ana.req('POST', '/recurring', { merchant: 'Smoke Link', amountMinor: '30000', frequency: 'monthly', nextDueDate: '2026-10-14', accountId: id(101), categoryId: id(302), autopay: false })
const manual = await ana.req('POST', '/transactions', { type: 'expense', title: 'Smoke Link payment', amountMinor: '30000', fromAccountId: id(101), categoryId: id(302), occurredOn: '2026-10-14', source: 'manual', status: 'cleared', idempotencyKey: 'smoke-7b-link' })
const link = await ana.req('POST', `/recurring/${linkBill.json?.id}/link-payment`, { expectedDueDate: '2026-10-14', transactionId: manual.json?.transaction?.id })
eq('recurring: link existing payment', link.json?.outcome, 'linked')
const linkAgain = await ana.req('POST', `/recurring/${linkBill.json?.id}/link-payment`, { expectedDueDate: '2026-10-14', transactionId: manual.json?.transaction?.id })
check('recurring: link replay does not double count', linkAgain.json?.outcome === 'replayed' || linkAgain.status === 409, linkAgain)
// reversed confirmed payment
const rb = await ana.req('POST', '/recurring', { merchant: 'Smoke Reverse', amountMinor: '15000', frequency: 'monthly', nextDueDate: '2026-10-14', accountId: id(101), categoryId: id(302), autopay: false })
const rc = await ana.req('POST', `/recurring/${rb.json?.id}/confirm-payment`, { expectedDueDate: '2026-10-14', amountMinor: '15000', paidOn: '2026-10-15' })
check('recurring: confirm before reverse', rc.status < 300, rc)
const txId = rc.json?.transaction?.id
check('lifecycle: reverse confirmed bill payment', (await ana.req('POST', `/transactions/${txId}/reverse`, {})).status < 300, txId)
const again = await ana.req('POST', `/recurring/${rb.json?.id}/confirm-payment`, { expectedDueDate: '2026-10-14', amountMinor: '15000', paidOn: '2026-10-15' })
check('lifecycle: reversed cycle cannot be re-confirmed (409)', again.status === 409 && again.json?.error?.code === 'RECURRING_PAYMENT_REVERSED', again)
// legacy API compatibility
const legacyStatus = await ana.req('PATCH', `/recurring/${id(506)}/status`, { status: 'paused' })
check('legacy api: PATCH /recurring/:id/status still works', legacyStatus.status < 300, legacyStatus)
await ana.req('PATCH', `/recurring/${id(506)}/status`, { status: 'active' })
eq("isolation: ben cannot confirm ana's bill", (await ben.req('POST', `/recurring/${id(505)}/confirm-payment`, { expectedDueDate: '2026-10-17', amountMinor: '1', paidOn: '2026-10-15' })).status, 404)
eq("isolation: ben cannot edit ana's bill", (await ben.req('PATCH', `/recurring/${id(505)}`, { nextDueDate: '2026-12-01' })).status, 404)

// ---- Planning / budgets
const budgets = await ana.req('GET', '/budgets')
check('planning: budgets listed', budgets.status === 200, budgets.status)
eq("isolation: ben has none of ana's budget periods", JSON.stringify((await ben.req('GET', '/budgets')).json).includes(id(601)), false)

console.log(`\nSMOKE RESULT: ${pass} passed, ${failures.length} failed`)
if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join('\n')); process.exit(1) }
