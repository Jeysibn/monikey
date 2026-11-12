import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { describe, it } from 'node:test'

import { MOKI_ASSETS } from '../src/lib/mokiAssets.ts'
import { dismissTip, MOKI_TIP_IDS, MOKI_TIPS_STORAGE_KEY, parseDismissed, readDismissedTips, type TipStorage } from '../src/lib/mokiTips.ts'

const memory = (initial: string | null = null): TipStorage & { value: string | null } => {
  const box = { value: initial, getItem: () => box.value, setItem: (_: string, v: string) => { box.value = v } }
  return box
}

describe('Moki poses', () => {
  it('every pose is served from a real, small, distinct WebP file', () => {
    const files = Object.values(MOKI_ASSETS)
    assert.equal(new Set(files).size, files.length, 'two poses share a file')
    for (const [pose, url] of Object.entries(MOKI_ASSETS)) {
      const path = new URL(`../public${url}`, import.meta.url)
      assert.ok(existsSync(path), `${pose}: ${url} is missing`)
      assert.match(url, /^\/moki\/moki-[a-z-]+\.webp$/)
      assert.ok(statSync(path).size < 80_000, `${pose}: ${url} is larger than 80 KB`)
    }
  })
})

describe('Moki tips', () => {
  it('start undismissed and remember a dismissal', () => {
    const storage = memory()
    assert.deepEqual(readDismissedTips(storage), [])
    assert.equal(dismissTip('activity-search', storage), true)
    assert.deepEqual(readDismissedTips(storage), ['activity-search'])
    dismissTip('dashboard-scopes', storage)
    dismissTip('activity-search', storage) // again: no duplicate
    assert.deepEqual([...readDismissedTips(storage)].sort(), ['activity-search', 'dashboard-scopes'])
    assert.ok((storage.value?.length ?? 0) < 100, 'only ids are stored')
  })
  it('ignores unknown ids, corrupt data and the wrong shape instead of failing', () => {
    assert.deepEqual(parseDismissed('["activity-search","<script>x</script>",7,null]'), ['activity-search'])
    for (const bad of [null, '', 'not json', '{"a":1}', '"activity-search"', '7']) assert.deepEqual(parseDismissed(bad), [], String(bad))
    assert.deepEqual(readDismissedTips(memory('garbage')), [])
  })
  it('a browser that blocks storage shows the tip and never throws', () => {
    const blocked: TipStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    assert.deepEqual(readDismissedTips(blocked), [])
    assert.equal(dismissTip('activity-search', blocked), false)
    assert.deepEqual(readDismissedTips(null), [])
    assert.equal(dismissTip('activity-search', null), false)
  })
  it('uses one versioned key and a closed list of tip ids', () => {
    assert.equal(MOKI_TIPS_STORAGE_KEY, 'monikey.moki.tips.v1')
    assert.deepEqual([...MOKI_TIP_IDS].sort(), ['activity-search', 'categories-look', 'dashboard-scopes'])
  })
})
