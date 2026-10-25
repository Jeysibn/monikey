import { ApiError, FAILED_DELETE, FAILED_SAVE, GONE_ON_EDIT } from '../dataSource.ts'
import { formatClock } from './time.ts'

/*
 * What to tell a person when a write fails (UI_UX_SPEC section 7, "Server error"). The data source speaks in
 * the API's terms (a status, a code, a field); this turns them into the spec's words and says which form field,
 * if any, the problem belongs to. Whatever the status, a 5xx or a request that never got an answer says the
 * same thing: nothing about the server's insides reaches the screen.
 */
export type WriteContext = 'add-entry' | 'edit-entry' | 'delete-entry' | 'add-account'

export const NO_LONGER_EXISTS = 'That account or category no longer exists. Reload and try again.'
export const ALREADY_DELETED = 'It was already deleted.'
export const INVALID_DETAILS = "Some details aren't valid. Check the highlighted fields."

/** A failed write, ready for a form: the message to show and the form field it concerns (if any). */
export class WriteError extends Error {
  readonly field?: string // the form field it concerns
  readonly inline: boolean // the message itself belongs under that field (a duplicate name); otherwise the field is only highlighted
  readonly gone: boolean // the entry was already deleted: nothing to retry
  constructor(message: string, options: { field?: string; inline?: boolean; gone?: boolean } = {}) {
    super(message)
    this.name = 'WriteError'
    this.field = options.field
    this.inline = options.inline ?? false
    this.gone = options.gone ?? false
  }
}

const generic = (context: WriteContext): string => (context === 'delete-entry' ? FAILED_DELETE : FAILED_SAVE)

export function describeWriteError(err: unknown, context: WriteContext): WriteError {
  if (!(err instanceof ApiError)) return new WriteError(generic(context)) // no answer at all (network)
  switch (err.status) {
    case 400:
      return new WriteError(err.message) // the server's own words
    case 404:
      if (context === 'delete-entry') return new WriteError(ALREADY_DELETED, { gone: true })
      return new WriteError(context === 'edit-entry' ? GONE_ON_EDIT : NO_LONGER_EXISTS)
    case 409:
      return new WriteError(err.message, { field: err.field, inline: err.field !== undefined })
    case 422:
      return new WriteError(INVALID_DETAILS, { field: err.field })
    default:
      return new WriteError(generic(context))
  }
}

/** After this long a save that has not answered gets a notice (spec section 7). Saving stays disabled meanwhile. */
export const SLOW_SAVE_MS = 15_000
export const SLOW_SAVE_TEXT = "This is taking longer than usual. Keep this open; your entry is still here."

/** "Couldn't load your summary. Last updated 09:14." The time is left out when nothing ever loaded. */
export function loadFailureText(what: string, updatedAt: Date | null): string {
  return `Couldn't load ${what}.${updatedAt ? ` Last updated ${formatClock(updatedAt)}.` : ''}`
}
