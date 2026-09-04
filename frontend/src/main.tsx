import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { FinanceProvider } from './state/FinanceProvider.tsx'
import { AsyncFinanceProvider } from './state/asyncFinanceContext.tsx'
import { BackendFinanceGate } from './components/BackendFinanceGate.tsx'
import { resolveAppClock } from './utils/clock.ts'
import './styles/global.css'

// TR-001: the one application clock is injected here, at the root, and
// nowhere else. `?today=YYYY-MM-DD` overrides it (see `resolveAppClock`) so
// the whole app can be moved to another date at once.
const clock = resolveAppClock(window.location.search)
const useBackend = import.meta.env.VITE_FINANCE_BACKEND === 'true'

function FinanceRoot() {
  if (useBackend) return <AsyncFinanceProvider><BackendFinanceGate><App /></BackendFinanceGate></AsyncFinanceProvider>
  return <FinanceProvider clock={clock}><App /></FinanceProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FinanceRoot />
    </BrowserRouter>
  </StrictMode>,
)
