/**
 * Keep keyboard focus somewhere sensible when the control that has it is about to disappear (Retry on a failed
 * block removes that block at once). Focus goes to `selector` now, and again after the screen has re-rendered
 * if it has been lost meanwhile (the target itself may be re-created by that render). Focus is never taken back
 * from a control the person has moved on to.
 */
export function moveFocusTo(selector: string): void {
  const go = () => document.querySelector<HTMLElement>(selector)?.focus()
  go()
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const now = document.activeElement
      if (!now || now === document.body) go()
    }),
  )
}
