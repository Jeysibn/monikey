import { useEffect, useRef, useState } from 'react'

/*
 * A text box that updates the screen at once but tells its owner only after a pause (so a search is not sent on
 * every keystroke). `value` is what the owner currently holds. Typing is never overwritten while it is in progress,
 * but when the owner changes the value itself (a "Reset filters", a link that sets a search) the box follows.
 * Clearing commits immediately: waiting to show everything again would feel broken.
 */
export function useDebouncedCommit(value: string, onCommit: (next: string) => void, normalize: (text: string) => string, delayMs = 300) {
  const [draft, setDraft] = useState(value)
  const lastSent = useRef(value)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })

  // The owner changed the value (not through this box): follow it.
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value
      setDraft(value)
    }
  }, [value])

  useEffect(() => {
    const next = normalize(draft)
    if (next === lastSent.current) return
    const wait = next === '' ? 0 : delayMs
    const timer = window.setTimeout(() => {
      lastSent.current = next
      commit.current(next)
    }, wait)
    return () => window.clearTimeout(timer)
  }, [draft, normalize, delayMs])

  const clear = () => {
    setDraft('')
  }
  return { draft, setDraft, clear }
}
