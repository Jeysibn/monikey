import type { ReactNode } from 'react'

/** The ids a field's helper and error lines have (see FormField), joined for `aria-describedby`. */
export const describedBy = (id: string, error?: string, helper?: ReactNode): string | undefined =>
  [helper ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
