import { useEffect, useState } from 'react'

/** Tracks a CSS media query. Without `matchMedia` (jsdom) it reports `fallback`, i.e. the mobile layout. */
export function useMediaQuery(query: string, fallback = false): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const [matches, setMatches] = useState(() => (supported ? window.matchMedia(query).matches : fallback))
  useEffect(() => {
    if (!supported) return
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query, supported])
  return matches
}
