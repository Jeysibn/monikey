/*
 * Tests for how a failed write is described to a person (UI_UX_SPEC section 7, "Server error") and for the
 * "Last updated" clock.
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError, FAILED_DELETE, FAILED_SAVE, GONE_ON_EDIT } from '../src/dataSource.ts'
import { ALREADY_DELETED, describeWriteError, INVALID_DETAILS, loadFailureText, NO_LONGER_EXISTS, SLOW_SAVE_MS, SLOW_SAVE_TEXT, WriteError } from '../src/lib/apiErrors.ts'
import { formatClock } from '../src/lib/time.ts'

describe('describeWriteError', () => {
  it('a 5xx, or no answer at all, says the same thing and never shows server details', () => {
    const secret = new ApiError(500, 'internal_error', 'psycopg2.OperationalError: connection to server at "db" failed')
    assert.equal(describeWriteError(secret, 'add-entry').message, FAILED_SAVE)
    assert.equal(describeWriteError(secret, 'edit-entry').message, FAILED_SAVE)
    assert.equal(describeWriteError(secret, 'add-account').message, FAILED_SAVE)
    assert.equal(describeWriteError(secret, 'delete-entry').message, FAILED_DELETE)
    assert.equal(describeWriteError(new TypeError('Failed to fetch'), 'add-entry').message, FAILED_SAVE)
    assert.equal(describeWriteError(new TypeError('Failed to fetch'), 'delete-entry').message, FAILED_DELETE)
    assert.equal(describeWriteError(new ApiError(503, 'x', 'whatever'), 'add-entry').message, FAILED_SAVE)
  })
  it('400 shows the server\'s own message', () => {
    const e = describeWriteError(new ApiError(400, 'invalid_account_type_combination', 'Income cannot be posted to a credit card.'), 'add-entry')
    assert.equal(e.message, 'Income cannot be posted to a credit card.')
  })
  it('404 depends on what was being done', () => {
    const nf = new ApiError(404, 'not_found', 'raw')
    assert.equal(describeWriteError(nf, 'add-entry').message, NO_LONGER_EXISTS)
    assert.equal(describeWriteError(nf, 'edit-entry').message, GONE_ON_EDIT)
    const del = describeWriteError(nf, 'delete-entry')
    assert.deepEqual([del.message, del.gone], [ALREADY_DELETED, true])
    assert.equal(describeWriteError(nf, 'edit-entry').gone, false)
  })
  it('409 keeps the message and the field (a duplicate account name goes under Name)', () => {
    const e = describeWriteError(new ApiError(409, 'duplicate_account_name', 'You already have an account with that name.', 'name'), 'add-account')
    assert.deepEqual([e.message, e.field, e.inline], ['You already have an account with that name.', 'name', true])
  })
  it('422 says some details are not valid and points at the field', () => {
    const e = describeWriteError(new ApiError(422, 'invalid_field', 'amount: value is not a valid decimal', 'amount'), 'add-entry')
    assert.deepEqual([e.message, e.field, e.inline], [INVALID_DETAILS, 'amount', false]) // highlighted, not explained
    assert.equal(INVALID_DETAILS, "Some details aren't valid. Check the highlighted fields.")
  })
  it('is a WriteError (an Error) the forms can recognise', () => {
    const e = describeWriteError(new ApiError(422, 'invalid_field', 'x', 'note'), 'add-entry')
    assert.ok(e instanceof WriteError && e instanceof Error)
  })
})

describe('loadFailureText and the slow-save constants', () => {
  it('says when the figures last arrived, or nothing if they never did', () => {
    assert.equal(loadFailureText('your summary', new Date(2026, 9, 25, 9, 14)), "Couldn't load your summary. Last updated 09:14.")
    assert.equal(loadFailureText('activity', null), "Couldn't load activity.")
  })
  it('the slow-save notice comes after 15 seconds', () => {
    assert.equal(SLOW_SAVE_MS, 15_000)
    assert.match(SLOW_SAVE_TEXT, /^This is taking longer than usual/)
  })
})

describe('formatClock', () => {
  it('two digits, 24-hour, local time', () => {
    assert.equal(formatClock(new Date(2026, 9, 25, 9, 14)), '09:14')
    assert.equal(formatClock(new Date(2026, 9, 25, 0, 5)), '00:05')
    assert.equal(formatClock(new Date(2026, 9, 25, 23, 59)), '23:59')
  })
})
