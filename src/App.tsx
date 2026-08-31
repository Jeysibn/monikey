import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AddTransactionModal } from './components/AddTransactionModal'
import { Toast } from './components/Toast'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Accounts } from './pages/Accounts'
import { Budget } from './pages/Budget'
import { Goals } from './pages/Goals'
import { Investments } from './pages/Investments'
import { Placeholder } from './pages/Placeholder'

export default function App() {
  const [addTxOpen, setAddTxOpen] = useState(false)

  return (
    <AppShell onAddTransaction={() => setAddTxOpen(true)}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions onAddTransaction={() => setAddTxOpen(true)} />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/investments" element={<Investments />} />
        <Route path="/recurring" element={<Placeholder title="Recurring & Bills" />} />
        <Route path="/reports" element={<Placeholder title="Reports" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
      </Routes>
      <AddTransactionModal open={addTxOpen} onClose={() => setAddTxOpen(false)} />
      <Toast />
    </AppShell>
  )
}
