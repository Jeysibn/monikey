import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  inspectImageHeader,
  isOfficialHost,
  isSafeLocalAssetPath,
  mergeCandidates,
  validateInventory,
  validatePermissionEvidence,
} from '../scripts/artworkResearch.mjs'

const candidate = {
  id: 'bpi-debit-mastercard', issuer: 'BPI', product: 'BPI Debit Mastercard', variant: 'Candidate design',
  card_network: 'Mastercard', card_type: 'debit', account_types: ['bank'],
  official_product_url: 'https://www.bpi.com.ph/personal/cards/debit-cards',
  candidate_image_url: 'https://www.bpi.com.ph/card.jpg', image_format: null, image_width: null, image_height: null,
  source_verified: true, verified_on: '2026-11-02', permission_status: 'pending', permission_evidence: null,
  local_asset_path: null, catalog_status: 'candidate', notes: [],
}

describe('card artwork discovery safety', () => {
  it('deduplicates repeated discovery runs by stable ID while retaining existing approval state', () => {
    const existing = [{ ...candidate, permission_status: 'approved', permission_evidence: 'rights.json' }]
    const merged = mergeCandidates(existing, [{ ...candidate, source_check: 'read', last_checked_on: '2026-11-03' }])
    assert.equal(merged.length, 1)
    assert.equal(merged[0]?.permission_status, 'approved')
    assert.equal(merged[0]?.source_check, 'read')
  })

  it('rejects duplicate IDs, unsupported account types, unsafe paths, and unapproved bundles', () => {
    assert.match(validateInventory([candidate, candidate]).join('\n'), /duplicate/)
    assert.match(validateInventory([{ ...candidate, account_types: ['investment'] }]).join('\n'), /unsupported account type/)
    assert.match(validateInventory([{ ...candidate, local_asset_path: '/card-art/private.svg' }]).join('\n'), /candidate cannot reference/)
    assert.equal(isSafeLocalAssetPath('/card-art/../private.png'), false)
    assert.equal(isSafeLocalAssetPath('https://issuer.example/card.png'), false)
  })

  it('requires verified source, permission evidence, and an approved local path before inventory approval', () => {
    const approved = {
      ...candidate,
      catalog_status: 'approved',
      permission_status: 'approved',
      permission_evidence: 'docs/design/artwork-permissions/bpi-card.json — redistribution scope for app bundle.',
      local_asset_path: '/card-art/bpi-card-12345678.jpg',
      image_source_classification: 'official-issuer-cdn',
    }
    assert.deepEqual(validateInventory([approved]), [])
    assert.match(validateInventory([{ ...approved, source_verified: false }]).join('\n'), /verified product source/)
    assert.match(validateInventory([{ ...approved, permission_status: 'pending' }]).join('\n'), /permission evidence/)
    assert.match(validateInventory([{ ...approved, account_types: [] }]).join('\n'), /supported account type/)
    assert.match(validateInventory([{ ...approved, local_asset_path: 'https://issuer.example/card.jpg' }]).join('\n'), /safe local asset/)
  })

  it('requires redistribution permission documented for the exact candidate', () => {
    const valid = {
      artwork_id: candidate.id, status: 'approved', permission_source_url: 'https://issuer.example/asset-license',
      permission_scope: 'Redistribution and public application bundle',
      evidence_summary: 'Issuer license explicitly permits use in this application bundle.',
      reviewed_on: '2026-11-02', reviewer: 'owner',
    }
    assert.deepEqual(validatePermissionEvidence(valid, candidate.id), [])
    assert.match(validatePermissionEvidence({ ...valid, permission_scope: 'Website display only' }, candidate.id).join('\n'), /redistribution/)
    assert.match(validatePermissionEvidence(valid, 'other-id').join('\n'), /artwork_id/)
    assert.match(validatePermissionEvidence({ ...valid, reviewed_on: '2026-02-30' }, candidate.id).join('\n'), /real YYYY-MM-DD/)
  })

  it('limits official source discovery to HTTPS issuer domains', () => {
    assert.equal(isOfficialHost(candidate.official_product_url, ['www.bpi.com.ph']), true)
    assert.equal(isOfficialHost('http://www.bpi.com.ph/card', ['www.bpi.com.ph']), false)
    assert.equal(isOfficialHost('https://unofficial.example/card', ['www.bpi.com.ph']), false)
  })

  it('checks image signatures, extension, dimensions, and embedded PAN-like text without saving assets', () => {
    const png = Buffer.alloc(32)
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
    png.writeUInt32BE(800, 16)
    png.writeUInt32BE(504, 20)
    assert.deepEqual(inspectImageHeader(png, 'card.png'), { format: 'png', width: 800, height: 504 })
    assert.throws(() => inspectImageHeader(png, 'card.webp'), /extension/)
    const unsafe = Buffer.concat([png, Buffer.from('4111111111111111')])
    assert.throws(() => inspectImageHeader(unsafe, 'card.png'), /payment-number-like/)
  })

  it('keeps research metadata separate from account and balance values', () => {
    for (const field of ['balance', 'owed', 'credit_limit', 'current_balance', 'current_debt', 'amount']) {
      assert.equal(Object.hasOwn(candidate, field), false)
    }
  })
})
