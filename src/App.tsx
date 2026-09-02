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
import { Recurring } from './pages/Recurring'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import type { Transaction } from './domain/finance'

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

  return (
    <AppShell onAddTransaction={handleOpenAddTransaction}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions onAddTransaction={handleOpenAddTransaction} onEditTransaction={handleEditTransaction} />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/investments" element={<Investments />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <AddTransactionModal open={addTxOpen} onClose={handleCloseModal} editingTransaction={editingTransaction ?? undefined} />
      <Toast />
    </AppShell>
  )
}
