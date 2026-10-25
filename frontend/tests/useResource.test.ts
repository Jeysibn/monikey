/*
 * Tests for what a screen sees of a resource (Milestones 4.8 and 4.9): data, loading, stale, the failure that
 * belongs to the request now wanted, when the data arrived, and retry. The hook around it is covered by the
 * browser harnesses.
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deriveResource, type Failure, type Loaded, type Resource } from '../src/useResource.ts'

const loadedA: Loaded<string> = { key: 'a', token: '0:0', data: 'A data', at: Date.UTC(2026, 9, 25, 1, 14) }
const failA: Failure = { key: 'a', token: '0:0', error: new Error('A failed') }

/** The parts that describe the state (not the clock or the function). */
const state = (r: Resource<string>) => ({ data: r.data, loading: r.loading, stale: r.stale, error: r.error?.message ?? null })

describe('deriveResource', () => {
  it('nothing yet: loading, no data, no time, no error', () => {
    const r = deriveResource<string>(null, null, 'a', '0:0')
    assert.deepEqual(state(r), { data: undefined, loading: true, stale: true, error: null })
    assert.equal(r.updatedAt, null)
  })
  it('the wanted request arrived: data, not stale, and when it arrived', () => {
    const r = deriveResource(loadedA, null, 'a', '0:0')
    assert.deepEqual(state(r), { data: 'A data', loading: false, stale: false, error: null })
    assert.equal(r.updatedAt?.getTime(), loadedA.at)
  })
  it('a new key, a new version or a retry keeps the old data and marks it stale', () => {
    for (const [key, token] of [['b', '0:0'], ['a', '1:0'], ['a', '0:1']] as const) {
      assert.deepEqual(state(deriveResource(loadedA, null, key, token)), { data: 'A data', loading: false, stale: true, error: null }, `${key} ${token}`)
    }
  })
  it('a failure shows only for the request that failed; the old data stays visible with its time', () => {
    const r = deriveResource(loadedA, failA, 'a', '0:0')
    assert.deepEqual(state(r), { data: 'A data', loading: false, stale: false, error: 'A failed' })
    assert.equal(r.updatedAt?.getTime(), loadedA.at) // "Last updated 01:14" next to the error
  })
  it('switching to another key after a failure hides the old error and shows the next request as pending', () => {
    const r = deriveResource(loadedA, failA, 'b', '0:0')
    assert.equal(r.error, null)
    assert.equal(r.stale, true)
  })
  it('a new version or a retry after a failure also hides the old error until the new request settles', () => {
    for (const token of ['1:0', '0:1']) {
      const r = deriveResource(loadedA, failA, 'a', token)
      assert.equal(r.error, null, token)
      assert.equal(r.stale, true, token)
    }
  })
  it('an unneeded key (null) shows no error and no pending request, and keeps what was loaded', () => {
    assert.deepEqual(state(deriveResource(loadedA, failA, null, '0:0')), { data: 'A data', loading: false, stale: false, error: null })
  })
  it('a failure with nothing ever loaded: still loading, with the error and no time', () => {
    const r = deriveResource<string>(null, failA, 'a', '0:0')
    assert.equal(r.loading, true)
    assert.equal(r.error?.message, 'A failed')
    assert.equal(r.updatedAt, null)
  })
  it('retry is passed through', () => {
    let called = 0
    deriveResource(loadedA, failA, 'a', '0:0', () => called++).retry()
    assert.equal(called, 1)
  })
})
