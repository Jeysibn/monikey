import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AddTransactionModal } from './components/AddTransactionModal'
import { Toast } from './components/Toast'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Accounts } from './pages/Accounts'
import { Budget } from './pages/Budget'
import { Goals } from './pages/Goals'
import { Recurring } from './pages/Recurring'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { Crypto } from './pages/Crypto'
import type { Transaction } from './domain/finance'
import { Rules } from './pages/Rules'
import { Reconciliation } from './pages/Reconciliation'
import { Imports } from './pages/Imports'
import { Security } from './pages/Security'
import { Tags } from './pages/Tags'
import { SyncCenter } from './pages/SyncCenter'
import { V3Shell } from './v3/V3Shell'
import { V3Accounts, V3Activity, V3DesignSpecimen, V3Overview, V3Planning } from './v3/V3Pages'
import { isV3PreviewEnabled, setV3PreviewEnabled, v3QueryOverride } from './v3/v3Preview'

export default function App() {
  const [addTxOpen, setAddTxOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)

  const handleOpenAddTransaction = () => {
    setEditingTransaction(null)
    setAddTxOpen(true)
  }

  const handleEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx)
    setAddTxOpen(true)
  }

  const handleCloseModal = () => {
    setEditingTransaction(null)
    setAddTxOpen(false)
  }

  // Opt-in V3 preview: `?v3=1` enables, `?v3=0` disables. Legacy stays the default.
  const location = useLocation()
  const navigate = useNavigate()
  const override = v3QueryOverride(location.search)
  useEffect(() => {
    if (override === null) return
    setV3PreviewEnabled(override)
    navigate(override ? '/v3' : location.pathname, { replace: true })
  }, [override, navigate, location.pathname])
  const onV3Path = location.pathname === '/v3' || location.pathname.startsWith('/v3/')
  const v3Enabled = override ?? isV3PreviewEnabled()

  const overlays = (
    <>
      <AddTransactionModal open={addTxOpen} onClose={handleCloseModal} editingTransaction={editingTransaction ?? undefined} />
      <Toast />
    </>
  )

  if (onV3Path && v3Enabled) {
    return (
      <>
        <V3Shell onAddTransaction={handleOpenAddTransaction}>
          <Routes>
            <Route path="/v3" element={<V3Overview />} />
            <Route path="/v3/activity" element={<V3Activity />} />
            <Route path="/v3/accounts" element={<V3Accounts />} />
            <Route path="/v3/planning" element={<V3Planning />} />
            <Route path="/v3/design" element={<V3DesignSpecimen />} />
            <Route path="*" element={<Navigate to="/v3" replace />} />
          </Routes>
        </V3Shell>
        {overlays}
      </>
    )
  }
  if (onV3Path) return <Navigate to="/" replace />

  return (
    <AppShell onAddTransaction={handleOpenAddTransaction}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions onAddTransaction={handleOpenAddTransaction} onEditTransaction={handleEditTransaction} />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/imports" element={<Imports />} />
        <Route path="/security" element={<Security />} />
        <Route path="/tags" element={<Tags />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/crypto" element={<Crypto />} />
        {/* Compatibility redirect: /investments was the canonical route before
            the Crypto Portfolio feature was renamed; keep old bookmarks/links
            working (§27) instead of silently 404ing. */}
        <Route path="/investments" element={<Navigate to="/crypto" replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/sync" element={<SyncCenter />} />
      </Routes>
      {overlays}
    </AppShell>
  )
}
