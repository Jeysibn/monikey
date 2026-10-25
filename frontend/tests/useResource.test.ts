/*
 * Tests for what a screen sees of a resource (Milestone 4.8): data, loading, stale and the failure that
 * belongs to the request now wanted. The hook around it is covered by the browser harnesses.
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deriveResource, type Failure, type Loaded } from '../src/useResource.ts'

const loadedA: Loaded<string> = { key: 'a', version: 0, data: 'A data' }
const failA: Failure = { key: 'a', version: 0, error: new Error('A failed') }

describe('deriveResource', () => {
  it('nothing yet: loading, not stale, no error', () => {
    assert.deepEqual(deriveResource<string>(null, null, 'a', 0), { data: undefined, loading: true, stale: true, error: null })
  })
  it('the wanted key arrived: data, not stale', () => {
    assert.deepEqual(deriveResource(loadedA, null, 'a', 0), { data: 'A data', loading: false, stale: false, error: null })
  })
  it('a new key or a new version keeps the old data and marks it stale', () => {
    assert.deepEqual(deriveResource(loadedA, null, 'b', 0), { data: 'A data', loading: false, stale: true, error: null })
    assert.deepEqual(deriveResource(loadedA, null, 'a', 1), { data: 'A data', loading: false, stale: true, error: null })
  })
  it('a failure shows only for the key and version that failed', () => {
    const r = deriveResource(loadedA, failA, 'a', 0)
    assert.equal(r.error?.message, 'A failed')
    assert.equal(r.stale, false) // the wanted request is settled (it failed); the old data stays visible
    assert.equal(r.data, 'A data')
  })
  it('switching to another key after a failure hides the old error and shows the next request as pending', () => {
    const r = deriveResource(loadedA, failA, 'b', 0)
    assert.equal(r.error, null)
    assert.equal(r.stale, true)
  })
  it('a new version after a failure (a refetch following a write) also hides the old error', () => {
    const r = deriveResource(loadedA, failA, 'a', 1)
    assert.equal(r.error, null)
    assert.equal(r.stale, true)
  })
  it('an unneeded key (null) shows no error and no pending request, and keeps what was loaded', () => {
    assert.deepEqual(deriveResource(loadedA, failA, null, 0), { data: 'A data', loading: false, stale: false, error: null })
  })
  it('a failure with nothing ever loaded: still loading, with the error', () => {
    const r = deriveResource<string>(null, failA, 'a', 0)
    assert.equal(r.loading, true)
    assert.equal(r.error?.message, 'A failed')
  })
})
