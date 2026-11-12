import { useEffect, useRef, useState, type RefObject } from 'react'

/*
 * The pixel width of the element a chart draws into. Charts are drawn in real pixels (not a scaled viewBox) so
 * their text stays 11 to 12px at 320px wide instead of shrinking with the picture. Before the first measurement,
 * and wherever there is no ResizeObserver, it falls back to a phone-sized width.
 */
export function useChartWidth(fallback = 320): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const next = Math.floor(element.getBoundingClientRect().width)
      if (next > 0) setWidth(next)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
