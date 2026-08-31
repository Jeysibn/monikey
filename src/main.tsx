import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { FinanceProvider } from './state/FinanceProvider.tsx'
import { resolveAppClock } from './utils/clock.ts'
import './styles/global.css'

// TR-001: the one application clock is injected here, at the root, and
// nowhere else. `?today=YYYY-MM-DD` overrides it (see `resolveAppClock`) so
// the whole app can be moved to another date at once.
const clock = resolveAppClock(window.location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FinanceProvider clock={clock}>
        <App />
      </FinanceProvider>
    </BrowserRouter>
  </StrictMode>,
)
