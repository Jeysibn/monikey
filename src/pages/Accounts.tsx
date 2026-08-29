import { Card } from '../components/Card'
import {
  accounts,
  creditCards,
  formatMoney,
  totalAvailableCash,
  totalCreditLimit,
  totalCreditOwed,
} from '../data/mockData'
import './Accounts.css'

export function Accounts() {
  const banks = accounts.filter((a) => a.type === 'checking' || a.type === 'savings')
  const wallets = accounts.filter((a) => a.type === 'ewallet' || a.type === 'cash')
  const bankTotal = banks.reduce((s, a) => s + a.balance, 0)
  const walletTotal = wallets.reduce((s, a) => s + a.balance, 0)

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Accounts</h1>
      </div>

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Available Cash</div>
          <div className="num kpi-val">{formatMoney(totalAvailableCash)}</div>
          <div className="kpi-delta--up">+3.2% this month</div>
        </Card>
        <Card>
          <div className="eyebrow">Banks · {banks.length} accounts</div>
          <div className="num kpi-val">{formatMoney(bankTotal)}</div>
          <div className="kpi-delta--up">+1.4% this month</div>
        </Card>
        <Card>
          <div className="eyebrow">
            E-Wallets &amp; Cash · {wallets.length} sources
          </div>
          <div className="num kpi-val">{formatMoney(walletTotal)}</div>
          <div className="kpi-delta--up">+4.2% this month</div>
        </Card>
        <Card>
          <div className="eyebrow">Credit Owed · {creditCards.length} cards</div>
          <div className="num kpi-val">{formatMoney(totalCreditOwed)}</div>
          <div className="kpi-delta--down">
            {Math.round((totalCreditOwed / totalCreditLimit) * 100)}% of {formatMoney(totalCreditLimit, { withCents: false })} limit
          </div>
        </Card>
      </div>

      <div className="accounts-split">
        <div className="accounts-col">
          <Card>
            <div className="section-head">
              <span className="card-title-text">Bank Accounts</span>
              <button type="button" className="add-link">
                + Add account
              </button>
            </div>
            {banks.map((a) => (
              <div className="account-row" key={a.id}>
                <div>
                  <div className="acct-name">
                    {a.name} ••{a.lastFour}
                  </div>
                  <div className="faint">
                    {a.institution} · {a.syncStatus}
                  </div>
                </div>
                <div className="acct-amt">
                  <div className="num">{formatMoney(a.balance)}</div>
                  {typeof a.monthlyChangePct === 'number' && (
                    <div className={a.monthlyChangePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
                      {a.monthlyChangePct >= 0 ? '+' : ''}
                      {a.monthlyChangePct}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <div className="section-head">
              <span className="card-title-text">E-Wallets &amp; Cash</span>
              <button type="button" className="add-link">
                + Add account
              </button>
            </div>
            {wallets.map((a) => (
              <div className="account-row" key={a.id}>
                <div>
                  <div className="acct-name">{a.name}</div>
                  <div className="faint">{a.syncStatus}</div>
                </div>
                <div className="acct-amt">
                  <div className="num">{formatMoney(a.balance)}</div>
                  {typeof a.monthlyChangePct === 'number' && (
                    <div className={a.monthlyChangePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
                      {a.monthlyChangePct >= 0 ? '+' : ''}
                      {a.monthlyChangePct}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <div className="section-head">
              <span className="card-title-text">Credit Cards</span>
              <button type="button" className="add-link">
                + Add card
              </button>
            </div>
            {creditCards.map((c) => (
              <div className="account-row" key={c.id}>
                <div>
                  <div className="acct-name">
                    {c.name} ••{c.lastFour}
                  </div>
                  <div className="faint">
                    Due {c.dueDate} · min {formatMoney(c.minPayment, { withCents: false })}
                  </div>
                </div>
                <div className="acct-amt">
                  <div className="num" style={{ color: 'var(--amber)' }}>
                    {formatMoney(c.balance)}
                  </div>
                  <div className="faint">of {formatMoney(c.limit, { withCents: false })}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>

        <div className="accounts-col">
          <Card>
            <div className="card-title-text">Assets Distribution</div>
            <div className="alloc-bars">
              {banks.concat(wallets).map((a) => (
                <div className="alloc-row" key={a.id}>
                  <span className="alloc-label">{a.name}</span>
                  <div className="alloc-track">
                    <div
                      className="alloc-fill"
                      style={{ width: `${(a.balance / totalAvailableCash) * 100}%` }}
                    />
                  </div>
                  <span className="num alloc-amt">{formatMoney(a.balance, { withCents: false })}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="card-title-text">
              Liabilities <span className="faint" style={{ color: 'var(--amber)', fontWeight: 400 }}>{formatMoney(totalCreditOwed, { withCents: false })} owed</span>
            </div>
            <div className="alloc-row">
              <span className="alloc-label">Credit Cards · {creditCards.length}</span>
              <span className="num alloc-amt">{formatMoney(totalCreditOwed, { withCents: false })}</span>
            </div>
            <div className="alloc-row">
              <span className="alloc-label">Loans</span>
              <span className="faint alloc-amt">None yet</span>
            </div>
          </Card>

          <Card className="add-account-card">
            <div className="add-plus" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ fontWeight: 700 }}>Link a new account</div>
            <div className="faint" style={{ textAlign: 'center' }}>
              Connect a bank, e-wallet, or credit card to track it automatically.
            </div>
            <button type="button" className="btn btn--primary">
              Connect account
            </button>
          </Card>
        </div>
      </div>
    </div>
  )
}
