import { useCallback, useId, useRef, useState, type ChangeEvent } from 'react'

/** Any control a finance form binds an error to. */
export type FieldChangeEvent = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>

/**
 * TR-009: the shared field-error wiring EVERY form uses (the local page forms
 * and the Add Transaction modal alike), so the accessibility contract is
 * implemented once instead of re-derived — or drifting — per form.
 *
 * It gives each field a stable id and error id, points the invalid control at
 * its own message via `aria-invalid`/`aria-describedby`, moves focus to the
 * first invalid control on a failed submit, and — the part that has to be
 * owned here rather than remembered by each form — clears a field's error as
 * soon as the user edits that field, so a corrected control does not keep
 * announcing itself as invalid until the next submit.
 *
 * That last behavior is why `field()` takes the caller's own change handler:
 * the hook wraps it, so there is no way to wire up a control and silently
 * forget the clearing half of the contract.
 *
 * `order` is the fields in the order they appear on screen; it is the only
 * thing that decides which control gets focus when several are invalid.
 */
export function useFieldErrors<F extends string>(order: readonly F[]) {
  const baseId = useId()
  const [errors, setErrors] = useState<Partial<Record<F, string>>>({})
  const controls = useRef<Partial<Record<F, HTMLElement | null>>>({})

  // `errorId`, `clearField`, `fail`, and `clear` are stable across renders so
  // callers can list them in an effect's dependency array without re-running
  // it every render. `field` deliberately is not: it closes over the current
  // errors, which is exactly what it must reflect.
  const errorId = useCallback((field: F): string => `${baseId}-${field}-error`, [baseId])

  /** Drops one field's error (no-op, and no re-render, when it has none). */
  const clearField = useCallback((name: F): void => {
    setErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }, [])

  /**
   * Spread onto the control itself: id, ref registration, error association,
   * and a change handler that clears this field's error before delegating to
   * the caller's own handler.
   */
  function field(name: F, onChange?: (event: FieldChangeEvent) => void) {
    const message = errors[name]
    return {
      id: `${baseId}-${name}`,
      ref: (el: HTMLElement | null) => {
        controls.current[name] = el
      },
      'aria-invalid': message ? (true as const) : undefined,
      'aria-describedby': message ? errorId(name) : undefined,
      onChange: (event: FieldChangeEvent) => {
        clearField(name)
        onChange?.(event)
      },
    }
  }

  /** Records the errors and focuses the first invalid control. */
  const fail = useCallback(
    (next: Partial<Record<F, string>>): void => {
      setErrors(next)
      const first = order.find((f) => next[f])
      if (first) controls.current[first]?.focus()
    },
    [order],
  )

  const clear = useCallback((): void => {
    setErrors({})
  }, [])

  return { errors, field, errorId, fail, clear, clearField }
}
