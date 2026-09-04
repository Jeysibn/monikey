import { useEffect, useState } from 'react'
import { subscribeToast } from '../hooks/toastBus'
import './Toast.css'

export function Toast() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => subscribeToast(setMessage), [])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 2600)
    return () => clearTimeout(timer)
  }, [message])

  if (!message) return null

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
